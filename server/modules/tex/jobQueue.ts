export const enqueueTexJob = async ({
  jobId,
  processLocally,
}: {
  jobId: string;
  processLocally?: () => Promise<void>;
}) => {
  if (!processLocally) {
    return;
  }

  queueMicrotask(() => {
    void processLocally().catch((error) => {
      console.error(`[TeX Job Queue] Local background processing failed jobId=${jobId}`, error);
    });
  });
};
