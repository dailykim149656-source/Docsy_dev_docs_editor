import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import type { TexDiagnostic, TexJobMode, TexJobStatus, TexSourceType } from "@/types/tex";

export interface TexJobRecord {
  compileMs?: number;
  contentHash?: string;
  createdAt: number;
  diagnostics?: TexDiagnostic[];
  documentName?: string;
  downloadUrl?: string;
  error?: string;
  expiresAt?: number;
  jobId: string;
  latex: string;
  logSummary?: string;
  mode: TexJobMode;
  previewUrl?: string;
  sourceType: TexSourceType;
  status: TexJobStatus;
  ttlAt: number;
  updatedAt: number;
}

export interface CreateTexJobInput {
  contentHash?: string;
  documentName?: string;
  latex: string;
  mode: TexJobMode;
  sourceType: TexSourceType;
}

export interface CompleteTexJobInput {
  compileMs?: number;
  diagnostics?: TexDiagnostic[];
  downloadUrl?: string;
  error?: string;
  expiresAt?: number;
  logSummary?: string;
  previewUrl?: string;
}

export interface TexJobStore {
  claimJob(jobId: string): Promise<TexJobRecord | null>;
  completeJob(jobId: string, status: Extract<TexJobStatus, "failed" | "succeeded">, result: CompleteTexJobInput): Promise<TexJobRecord | null>;
  createJob(input: CreateTexJobInput): Promise<TexJobRecord>;
  getJob(jobId: string): Promise<TexJobRecord | null>;
  pruneExpired(now?: number): Promise<void>;
}

interface TexJobStoreState {
  jobs: Record<string, TexJobRecord>;
  version: 1;
}

const DEFAULT_JOB_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STATE: TexJobStoreState = {
  jobs: {},
  version: 1,
};
const DEFAULT_CLOUD_RUN_STATE_PATH = path.posix.join("/tmp", "docsy-tex-jobs.json");
const DEFAULT_LOCAL_STATE_PATH = path.join(homedir(), ".docsy", "tex-jobs.json");

const getDefaultStatePath = () =>
  (process.env.K_SERVICE || process.env.K_REVISION || process.env.CLOUD_RUN_JOB)
    ? DEFAULT_CLOUD_RUN_STATE_PATH
    : DEFAULT_LOCAL_STATE_PATH;

const getStatePath = () =>
  path.resolve(process.cwd(), process.env.TEX_JOB_STATE_PATH || getDefaultStatePath());

const getJobTtlMs = () => {
  const configured = Number(process.env.TEX_JOB_TTL_MS || DEFAULT_JOB_TTL_MS);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_JOB_TTL_MS;
};

const sanitizeTexJobRecord = (record: Partial<TexJobRecord> | null | undefined): TexJobRecord | null => {
  if (!record?.jobId || !record.latex || !record.mode || !record.sourceType || !record.status) {
    return null;
  }

  return {
    compileMs: typeof record.compileMs === "number" ? record.compileMs : undefined,
    contentHash: typeof record.contentHash === "string" ? record.contentHash : undefined,
    createdAt: typeof record.createdAt === "number" ? record.createdAt : Date.now(),
    diagnostics: Array.isArray(record.diagnostics) ? record.diagnostics : undefined,
    documentName: typeof record.documentName === "string" ? record.documentName : undefined,
    downloadUrl: typeof record.downloadUrl === "string" ? record.downloadUrl : undefined,
    error: typeof record.error === "string" ? record.error : undefined,
    expiresAt: typeof record.expiresAt === "number" ? record.expiresAt : undefined,
    jobId: record.jobId,
    latex: record.latex,
    logSummary: typeof record.logSummary === "string" ? record.logSummary : undefined,
    mode: record.mode,
    previewUrl: typeof record.previewUrl === "string" ? record.previewUrl : undefined,
    sourceType: record.sourceType,
    status: record.status,
    ttlAt: typeof record.ttlAt === "number" ? record.ttlAt : Date.now() + getJobTtlMs(),
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
  };
};

const readState = async (): Promise<TexJobStoreState> => {
  try {
    const raw = await readFile(getStatePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<TexJobStoreState>;

    return {
      jobs: Object.fromEntries(
        Object.entries(parsed.jobs || {})
          .map(([jobId, record]) => [jobId, sanitizeTexJobRecord(record)])
          .filter((entry): entry is [string, TexJobRecord] => Boolean(entry[1])),
      ),
      version: 1,
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
};

const writeState = async (state: TexJobStoreState) => {
  const statePath = getStatePath();
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
};

class FileTexJobStore implements TexJobStore {
  private queue = Promise.resolve();

  private enqueue<T>(operation: () => Promise<T>) {
    const next = this.queue.then(operation, operation);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async pruneExpired(now = Date.now()) {
    return this.enqueue(async () => {
      const state = await readState();
      let changed = false;

      for (const [jobId, record] of Object.entries(state.jobs)) {
        if (record.ttlAt <= now) {
          delete state.jobs[jobId];
          changed = true;
        }
      }

      if (changed) {
        await writeState(state);
      }
    });
  }

  async createJob(input: CreateTexJobInput) {
    return this.enqueue(async () => {
      const now = Date.now();
      const record: TexJobRecord = {
        contentHash: input.contentHash,
        createdAt: now,
        documentName: input.documentName,
        jobId: randomUUID(),
        latex: input.latex,
        mode: input.mode,
        sourceType: input.sourceType,
        status: "queued",
        ttlAt: now + getJobTtlMs(),
        updatedAt: now,
      };
      const state = await readState();
      state.jobs[record.jobId] = record;
      await writeState(state);
      return record;
    });
  }

  async getJob(jobId: string) {
    return this.enqueue(async () => {
      const state = await readState();
      return state.jobs[jobId] || null;
    });
  }

  async claimJob(jobId: string) {
    return this.enqueue(async () => {
      const state = await readState();
      const record = state.jobs[jobId];

      if (!record || record.status !== "queued") {
        return null;
      }

      const nextRecord: TexJobRecord = {
        ...record,
        status: "running",
        updatedAt: Date.now(),
      };
      state.jobs[jobId] = nextRecord;
      await writeState(state);
      return nextRecord;
    });
  }

  async completeJob(jobId: string, status: Extract<TexJobStatus, "failed" | "succeeded">, result: CompleteTexJobInput) {
    return this.enqueue(async () => {
      const state = await readState();
      const record = state.jobs[jobId];

      if (!record) {
        return null;
      }

      const nextRecord: TexJobRecord = {
        ...record,
        compileMs: result.compileMs,
        diagnostics: result.diagnostics,
        downloadUrl: result.downloadUrl,
        error: result.error,
        expiresAt: result.expiresAt,
        logSummary: result.logSummary,
        previewUrl: result.previewUrl,
        status,
        updatedAt: Date.now(),
      };
      state.jobs[jobId] = nextRecord;
      await writeState(state);
      return nextRecord;
    });
  }
}

let jobStoreInstance: TexJobStore | null = null;

export const getTexJobStore = (): TexJobStore => {
  if (!jobStoreInstance) {
    jobStoreInstance = new FileTexJobStore();
  }

  return jobStoreInstance;
};

export const resetTexJobStoreForTests = () => {
  jobStoreInstance = null;
};
