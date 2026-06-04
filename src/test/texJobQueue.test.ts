import { afterEach, describe, expect, it, vi } from "vitest";
import { enqueueTexJob } from "../../server/modules/tex/jobQueue";

const ORIGINAL_ENV = {
  GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
  TEX_JOB_WORKER_URL: process.env.TEX_JOB_WORKER_URL,
  TEX_TASK_LOCATION: process.env.TEX_TASK_LOCATION,
  TEX_TASK_QUEUE: process.env.TEX_TASK_QUEUE,
};

const restoreEnv = (key: keyof typeof ORIGINAL_ENV) => {
  const value = ORIGINAL_ENV[key];

  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
};

afterEach(() => {
  restoreEnv("GOOGLE_CLOUD_PROJECT");
  restoreEnv("TEX_JOB_WORKER_URL");
  restoreEnv("TEX_TASK_LOCATION");
  restoreEnv("TEX_TASK_QUEUE");
});

describe("tex job queue", () => {
  it("runs jobs locally even when legacy Cloud Tasks env vars are configured", async () => {
    process.env.GOOGLE_CLOUD_PROJECT = "legacy-cloud-project";
    process.env.TEX_TASK_QUEUE = "legacy-queue";
    process.env.TEX_TASK_LOCATION = "asia-northeast3";
    process.env.TEX_JOB_WORKER_URL = "https://worker.example.test";

    const processLocally = vi.fn().mockResolvedValue(undefined);

    await enqueueTexJob({
      jobId: "job-1",
      processLocally,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(processLocally).toHaveBeenCalledOnce();
  });
});
