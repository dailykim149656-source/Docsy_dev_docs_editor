import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

export interface GoogleWorkspaceTokens {
  accessToken?: string;
  expiryDate?: number;
  refreshToken?: string;
  scope?: string;
  tokenType?: string;
}

export interface WorkspaceUserProfile {
  email?: string;
  name?: string;
  picture?: string;
  sub?: string;
}

export interface WorkspaceConnectionRecord {
  changePageToken?: string;
  connectedAt: number;
  connectionId: string;
  lastChangeScanAt?: number;
  provider: "google_drive";
  tokens: GoogleWorkspaceTokens;
  updatedAt: number;
  user: WorkspaceUserProfile;
}

export interface WorkspaceSessionRecord {
  connectionId: string;
  createdAt: number;
  expiresAt: number;
  sessionId: string;
  updatedAt: number;
}

export interface WorkspaceImportedDocumentRecord {
  connectionId: string;
  createdAt: number;
  documentId: string;
  driveModifiedTime?: string;
  fileId: string;
  fileName: string;
  lastRescannedAt?: number;
  latestRemoteModifiedTime?: string;
  latestRemoteRevisionId?: string;
  mimeType: string;
  remoteChangeDetectedAt?: number;
  revisionId?: string;
  updatedAt: number;
}

export interface WorkspaceAuthStateRecord {
  createdAt: number;
  expiresAt: number;
  returnTo: string;
  state: string;
}

export interface SharedDocumentRecord {
  compressedPayload: string;
  compression: "deflate-raw-base64url";
  createdAt: number;
  expiresAt: number;
  shareId: string;
  updatedAt: number;
}

interface WorkspaceRepositoryState {
  authStates: Record<string, WorkspaceAuthStateRecord>;
  connections: Record<string, WorkspaceConnectionRecord>;
  importedDocuments: Record<string, WorkspaceImportedDocumentRecord>;
  sharedDocuments: Record<string, SharedDocumentRecord>;
  sessions: Record<string, WorkspaceSessionRecord>;
  version: 1;
}

export interface WorkspaceRepository {
  consumeAuthState(stateId: string): Promise<WorkspaceAuthStateRecord | null>;
  createSession(connectionId: string, absoluteTtlMs: number, idleTtlMs: number): Promise<WorkspaceSessionRecord>;
  deleteSession(sessionId: string): Promise<void>;
  getConnection(connectionId: string): Promise<WorkspaceConnectionRecord | null>;
  getImportedDocument(documentId: string): Promise<WorkspaceImportedDocumentRecord | null>;
  getSharedDocument(shareId: string): Promise<SharedDocumentRecord | null>;
  getSession(sessionId: string): Promise<{ connection: WorkspaceConnectionRecord | null; session: WorkspaceSessionRecord } | null>;
  listImportedDocuments(connectionId: string): Promise<WorkspaceImportedDocumentRecord[]>;
  pruneExpired(now?: number): Promise<void>;
  saveAuthState(record: WorkspaceAuthStateRecord): Promise<void>;
  touchSession(
    sessionId: string,
    absoluteTtlMs: number,
    idleTtlMs: number,
  ): Promise<{ connection: WorkspaceConnectionRecord | null; session: WorkspaceSessionRecord } | null>;
  upsertConnection(record: WorkspaceConnectionRecord): Promise<void>;
  upsertImportedDocument(record: WorkspaceImportedDocumentRecord): Promise<void>;
  upsertSharedDocument(record: SharedDocumentRecord): Promise<void>;
}

const DEFAULT_REPOSITORY_STATE: WorkspaceRepositoryState = {
  authStates: {},
  connections: {},
  importedDocuments: {},
  sharedDocuments: {},
  sessions: {},
  version: 1,
};

const DEFAULT_CLOUD_RUN_STATE_PATH = path.posix.join("/tmp", "docsy-workspace-state.json");
const DEFAULT_LOCAL_STATE_PATH = path.join(homedir(), ".docsy", "workspace-state.json");

const isCloudRunEnvironment = (env = process.env) =>
  Boolean(env.K_SERVICE || env.K_REVISION || env.CLOUD_RUN_JOB);

const isTestEnvironment = (env = process.env) =>
  env.NODE_ENV === "test" || env.VITEST === "true";

let didWarnIgnoredWorkspaceRepositoryBackend = false;

const isPathInsideDirectory = (candidatePath: string, directoryPath: string) => {
  const relativePath = path.relative(directoryPath, candidatePath);
  return relativePath === ""
    || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
};

const getDefaultRepositoryFilePath = (env = process.env) =>
  isCloudRunEnvironment(env) ? DEFAULT_CLOUD_RUN_STATE_PATH : DEFAULT_LOCAL_STATE_PATH;

const sortImportedDocuments = (documents: WorkspaceImportedDocumentRecord[]) =>
  documents.sort((left, right) => right.updatedAt - left.updatedAt || left.fileName.localeCompare(right.fileName));

const sanitizeWorkspaceTokens = (tokens: Partial<GoogleWorkspaceTokens> | null | undefined): GoogleWorkspaceTokens => ({
  expiryDate: typeof tokens?.expiryDate === "number" ? tokens.expiryDate : undefined,
  refreshToken: typeof tokens?.refreshToken === "string" ? tokens.refreshToken : undefined,
  scope: typeof tokens?.scope === "string" ? tokens.scope : undefined,
  tokenType: typeof tokens?.tokenType === "string" ? tokens.tokenType : undefined,
});

const sanitizeWorkspaceConnectionRecord = (
  record: Partial<WorkspaceConnectionRecord> | null | undefined,
): WorkspaceConnectionRecord | null => {
  if (!record?.connectionId || record.provider !== "google_drive") {
    return null;
  }

  return {
    changePageToken: typeof record.changePageToken === "string" ? record.changePageToken : undefined,
    connectedAt: typeof record.connectedAt === "number" ? record.connectedAt : Date.now(),
    connectionId: record.connectionId,
    lastChangeScanAt: typeof record.lastChangeScanAt === "number" ? record.lastChangeScanAt : undefined,
    provider: "google_drive",
    tokens: sanitizeWorkspaceTokens(record.tokens),
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
    user: {
      email: typeof record.user?.email === "string" ? record.user.email : undefined,
      name: typeof record.user?.name === "string" ? record.user.name : undefined,
      picture: typeof record.user?.picture === "string" ? record.user.picture : undefined,
      sub: typeof record.user?.sub === "string" ? record.user.sub : undefined,
    },
  };
};

const sanitizeWorkspaceSessionRecord = (
  record: Partial<WorkspaceSessionRecord> | null | undefined,
): WorkspaceSessionRecord | null => {
  if (!record?.sessionId || !record.connectionId) {
    return null;
  }

  return {
    connectionId: record.connectionId,
    createdAt: typeof record.createdAt === "number" ? record.createdAt : Date.now(),
    expiresAt: typeof record.expiresAt === "number" ? record.expiresAt : Date.now(),
    sessionId: record.sessionId,
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
  };
};

const sanitizeWorkspaceAuthStateRecord = (
  record: Partial<WorkspaceAuthStateRecord> | null | undefined,
): WorkspaceAuthStateRecord | null => {
  if (!record?.state || typeof record.returnTo !== "string") {
    return null;
  }

  return {
    createdAt: typeof record.createdAt === "number" ? record.createdAt : Date.now(),
    expiresAt: typeof record.expiresAt === "number" ? record.expiresAt : Date.now(),
    returnTo: record.returnTo,
    state: record.state,
  };
};

const sanitizeImportedDocumentRecord = (
  record: Partial<WorkspaceImportedDocumentRecord> | null | undefined,
): WorkspaceImportedDocumentRecord | null => {
  if (!record?.connectionId || !record.documentId || !record.fileId || !record.fileName || !record.mimeType) {
    return null;
  }

  return {
    connectionId: record.connectionId,
    createdAt: typeof record.createdAt === "number" ? record.createdAt : Date.now(),
    documentId: record.documentId,
    driveModifiedTime: typeof record.driveModifiedTime === "string" ? record.driveModifiedTime : undefined,
    fileId: record.fileId,
    fileName: record.fileName,
    lastRescannedAt: typeof record.lastRescannedAt === "number" ? record.lastRescannedAt : undefined,
    latestRemoteModifiedTime: typeof record.latestRemoteModifiedTime === "string" ? record.latestRemoteModifiedTime : undefined,
    latestRemoteRevisionId: typeof record.latestRemoteRevisionId === "string" ? record.latestRemoteRevisionId : undefined,
    mimeType: record.mimeType,
    remoteChangeDetectedAt: typeof record.remoteChangeDetectedAt === "number" ? record.remoteChangeDetectedAt : undefined,
    revisionId: typeof record.revisionId === "string" ? record.revisionId : undefined,
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
  };
};

const sanitizeSharedDocumentRecord = (
  record: Partial<SharedDocumentRecord> | null | undefined,
): SharedDocumentRecord | null => {
  if (
    !record?.shareId
    || typeof record.compressedPayload !== "string"
    || record.compression !== "deflate-raw-base64url"
  ) {
    return null;
  }

  return {
    compressedPayload: record.compressedPayload,
    compression: "deflate-raw-base64url",
    createdAt: typeof record.createdAt === "number" ? record.createdAt : Date.now(),
    expiresAt: typeof record.expiresAt === "number" ? record.expiresAt : Date.now(),
    shareId: record.shareId,
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
  };
};

export const resolveWorkspaceRepositoryFilePath = (
  env = process.env,
  cwd = process.cwd(),
) =>
  path.resolve(
    cwd,
    env.WORKSPACE_STATE_PATH
      || env.WORKSPACE_DB_PATH
      || getDefaultRepositoryFilePath(env),
  );

export const assertSafeWorkspaceRepositoryPath = (
  repositoryPath: string,
  env = process.env,
  cwd = process.cwd(),
) => {
  if (isTestEnvironment(env)) {
    return;
  }

  if (isPathInsideDirectory(repositoryPath, cwd)) {
    throw new Error(
      `Workspace state must be stored outside the repository. Configure WORKSPACE_STATE_PATH to a home or temp location. Current path: ${repositoryPath}`,
    );
  }
};

export const resolveWorkspaceRepositoryBackend = (env = process.env): "file" => {
  const configured = env.WORKSPACE_REPOSITORY_BACKEND?.trim().toLowerCase();

  if (configured && configured !== "file" && configured !== "local" && !didWarnIgnoredWorkspaceRepositoryBackend) {
    console.warn(`Workspace repository backend "${configured}" is ignored. Docsy now uses the local file-backed repository.`);
    didWarnIgnoredWorkspaceRepositoryBackend = true;
  }

  return "file";
};

const getRepositoryFilePath = () => {
  const repositoryPath = resolveWorkspaceRepositoryFilePath();
  assertSafeWorkspaceRepositoryPath(repositoryPath);
  return repositoryPath;
};

const readRepositoryState = async (): Promise<WorkspaceRepositoryState> => {
  const repositoryPath = getRepositoryFilePath();

  try {
    const raw = await readFile(repositoryPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<WorkspaceRepositoryState>;

    return {
      authStates: Object.fromEntries(
        Object.entries(parsed.authStates || {})
          .map(([stateId, record]) => [stateId, sanitizeWorkspaceAuthStateRecord(record)])
          .filter((entry): entry is [string, WorkspaceAuthStateRecord] => Boolean(entry[1])),
      ),
      connections: Object.fromEntries(
        Object.entries(parsed.connections || {})
          .map(([connectionId, record]) => [connectionId, sanitizeWorkspaceConnectionRecord(record)])
          .filter((entry): entry is [string, WorkspaceConnectionRecord] => Boolean(entry[1])),
      ),
      importedDocuments: Object.fromEntries(
        Object.entries(parsed.importedDocuments || {})
          .map(([documentId, record]) => [documentId, sanitizeImportedDocumentRecord(record)])
          .filter((entry): entry is [string, WorkspaceImportedDocumentRecord] => Boolean(entry[1])),
      ),
      sharedDocuments: Object.fromEntries(
        Object.entries(parsed.sharedDocuments || {})
          .map(([shareId, record]) => [shareId, sanitizeSharedDocumentRecord(record)])
          .filter((entry): entry is [string, SharedDocumentRecord] => Boolean(entry[1])),
      ),
      sessions: Object.fromEntries(
        Object.entries(parsed.sessions || {})
          .map(([sessionId, record]) => [sessionId, sanitizeWorkspaceSessionRecord(record)])
          .filter((entry): entry is [string, WorkspaceSessionRecord] => Boolean(entry[1])),
      ),
      version: 1,
    };
  } catch {
    return structuredClone(DEFAULT_REPOSITORY_STATE);
  }
};

const writeRepositoryState = async (state: WorkspaceRepositoryState) => {
  const repositoryPath = getRepositoryFilePath();
  await mkdir(path.dirname(repositoryPath), { recursive: true });
  await writeFile(repositoryPath, JSON.stringify(state, null, 2), "utf8");
};

class FileWorkspaceRepository implements WorkspaceRepository {
  private queue = Promise.resolve();

  private enqueue<T>(operation: () => Promise<T>) {
    const next = this.queue.then(operation, operation);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async pruneExpired(now = Date.now()) {
    return this.enqueue(async () => {
      try {
        const state = await readRepositoryState();
        let changed = false;

        for (const [stateId, authState] of Object.entries(state.authStates)) {
          if (authState.expiresAt <= now) {
            delete state.authStates[stateId];
            changed = true;
          }
        }

        for (const [sessionId, session] of Object.entries(state.sessions)) {
          if (session.expiresAt <= now) {
            delete state.sessions[sessionId];
            changed = true;
          }
        }

        for (const [shareId, sharedDocument] of Object.entries(state.sharedDocuments)) {
          if (sharedDocument.expiresAt <= now) {
            delete state.sharedDocuments[shareId];
            changed = true;
          }
        }

        if (changed) {
          await writeRepositoryState(state);
        }
      } catch (error) {
        console.warn("Failed to prune expired repository state:", error instanceof Error ? error.message : String(error));
      }
    });
  }

  async saveAuthState(record: WorkspaceAuthStateRecord) {
    return this.enqueue(async () => {
      const state = await readRepositoryState();
      state.authStates[record.state] = record;
      await writeRepositoryState(state);
    });
  }

  async consumeAuthState(stateId: string) {
    return this.enqueue(async () => {
      const state = await readRepositoryState();
      const record = state.authStates[stateId] || null;

      if (record) {
        delete state.authStates[stateId];
        await writeRepositoryState(state);
      }

      return record;
    });
  }

  async upsertConnection(record: WorkspaceConnectionRecord) {
    return this.enqueue(async () => {
      const state = await readRepositoryState();
      const sanitizedRecord = sanitizeWorkspaceConnectionRecord(record);

      if (!sanitizedRecord) {
        throw new Error(`Workspace connection record is invalid for connectionId=${record.connectionId}`);
      }

      state.connections[record.connectionId] = sanitizedRecord;
      await writeRepositoryState(state);
    });
  }

  async getConnection(connectionId: string) {
    return this.enqueue(async () => {
      const state = await readRepositoryState();
      return state.connections[connectionId] || null;
    });
  }

  async createSession(connectionId: string, absoluteTtlMs: number, idleTtlMs: number) {
    return this.enqueue(async () => {
      const now = Date.now();
      const session: WorkspaceSessionRecord = {
        connectionId,
        createdAt: now,
        expiresAt: now + Math.min(absoluteTtlMs, idleTtlMs),
        sessionId: randomUUID(),
        updatedAt: now,
      };
      const state = await readRepositoryState();
      state.sessions[session.sessionId] = session;
      await writeRepositoryState(state);
      return session;
    });
  }

  async getSession(sessionId: string) {
    return this.enqueue(async () => {
      const state = await readRepositoryState();
      const session = state.sessions[sessionId];

      if (!session) {
        return null;
      }

      return {
        connection: state.connections[session.connectionId] || null,
        session,
      };
    });
  }

  async touchSession(sessionId: string, absoluteTtlMs: number, idleTtlMs: number) {
    return this.enqueue(async () => {
      const state = await readRepositoryState();
      const session = state.sessions[sessionId];

      if (!session) {
        return null;
      }

      const now = Date.now();
      const absoluteExpiryAt = session.createdAt + absoluteTtlMs;
      const idleExpiryAt = now + idleTtlMs;
      const nextExpiryAt = Math.min(absoluteExpiryAt, idleExpiryAt);
      const updatedSession: WorkspaceSessionRecord = {
        ...session,
        expiresAt: nextExpiryAt,
        updatedAt: now,
      };

      state.sessions[sessionId] = updatedSession;
      await writeRepositoryState(state);

      return {
        connection: state.connections[updatedSession.connectionId] || null,
        session: updatedSession,
      };
    });
  }

  async deleteSession(sessionId: string) {
    return this.enqueue(async () => {
      const state = await readRepositoryState();
      delete state.sessions[sessionId];
      await writeRepositoryState(state);
    });
  }

  async upsertImportedDocument(record: WorkspaceImportedDocumentRecord) {
    return this.enqueue(async () => {
      const state = await readRepositoryState();
      const sanitizedRecord = sanitizeImportedDocumentRecord(record);

      if (!sanitizedRecord) {
        throw new Error(`Imported workspace document record is invalid for documentId=${record.documentId}`);
      }

      state.importedDocuments[record.documentId] = sanitizedRecord;
      await writeRepositoryState(state);
    });
  }

  async getImportedDocument(documentId: string) {
    return this.enqueue(async () => {
      const state = await readRepositoryState();
      return state.importedDocuments[documentId] || null;
    });
  }

  async getSharedDocument(shareId: string) {
    return this.enqueue(async () => {
      const state = await readRepositoryState();
      return state.sharedDocuments[shareId] || null;
    });
  }

  async listImportedDocuments(connectionId: string) {
    return this.enqueue(async () => {
      const state = await readRepositoryState();
      return sortImportedDocuments(
        Object.values(state.importedDocuments)
          .filter((document) => document.connectionId === connectionId),
      );
    });
  }

  async upsertSharedDocument(record: SharedDocumentRecord) {
    return this.enqueue(async () => {
      const state = await readRepositoryState();
      const sanitizedRecord = sanitizeSharedDocumentRecord(record);

      if (!sanitizedRecord) {
        throw new Error(`Shared document record is invalid for shareId=${record.shareId}`);
      }

      state.sharedDocuments[sanitizedRecord.shareId] = sanitizedRecord;
      await writeRepositoryState(state);
    });
  }
}

let repositoryInstance: WorkspaceRepository | null = null;

export const getWorkspaceRepository = (): WorkspaceRepository => {
  if (!repositoryInstance) {
    repositoryInstance = new FileWorkspaceRepository();
  }

  return repositoryInstance;
};

export const resetWorkspaceRepositoryForTests = () => {
  repositoryInstance = null;
};
