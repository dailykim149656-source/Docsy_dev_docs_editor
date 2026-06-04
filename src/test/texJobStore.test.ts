import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTexJobStore, resetTexJobStoreForTests } from "../../server/modules/tex/jobStore";

const ORIGINAL_ENV = {
  GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
  K_SERVICE: process.env.K_SERVICE,
  K_REVISION: process.env.K_REVISION,
  TEX_JOB_STATE_PATH: process.env.TEX_JOB_STATE_PATH,
  WORKSPACE_REPOSITORY_BACKEND: process.env.WORKSPACE_REPOSITORY_BACKEND,
};

const restoreEnv = (key: keyof typeof ORIGINAL_ENV) => {
  const value = ORIGINAL_ENV[key];

  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
};

beforeEach(() => {
  vi.useFakeTimers();
  process.env.GOOGLE_CLOUD_PROJECT = "";
  process.env.K_SERVICE = "";
  process.env.K_REVISION = "";
  process.env.WORKSPACE_REPOSITORY_BACKEND = "file";
  process.env.TEX_JOB_STATE_PATH = `.data/test-tex-jobs-${Date.now()}.json`;
  resetTexJobStoreForTests();
});

afterEach(() => {
  vi.useRealTimers();
  restoreEnv("GOOGLE_CLOUD_PROJECT");
  restoreEnv("K_SERVICE");
  restoreEnv("K_REVISION");
  restoreEnv("TEX_JOB_STATE_PATH");
  restoreEnv("WORKSPACE_REPOSITORY_BACKEND");
  resetTexJobStoreForTests();
});

describe("tex job store", () => {
  it("uses the local file store when legacy Firestore settings are present", async () => {
    process.env.GOOGLE_CLOUD_PROJECT = "legacy-cloud-project";
    process.env.K_SERVICE = "docsy-tex";
    process.env.WORKSPACE_REPOSITORY_BACKEND = "firestore";
    resetTexJobStoreForTests();

    const store = getTexJobStore();
    const created = await store.createJob({
      latex: "\\section{Local}",
      mode: "preview",
      sourceType: "raw-latex",
    });

    expect(await store.getJob(created.jobId)).toEqual(created);
  });

  it("creates, claims, and completes preview jobs", async () => {
    const store = getTexJobStore();
    const created = await store.createJob({
      contentHash: "hash-1",
      documentName: "Draft",
      latex: "\\section{One}",
      mode: "preview",
      sourceType: "raw-latex",
    });

    expect(created.status).toBe("queued");

    const claimed = await store.claimJob(created.jobId);
    expect(claimed?.status).toBe("running");

    const completed = await store.completeJob(created.jobId, "succeeded", {
      compileMs: 123,
      expiresAt: Date.now() + 900_000,
      logSummary: "ok",
      previewUrl: "https://example.com/preview.pdf",
    });

    expect(completed?.status).toBe("succeeded");
    expect(completed?.previewUrl).toBe("https://example.com/preview.pdf");
  });
});
