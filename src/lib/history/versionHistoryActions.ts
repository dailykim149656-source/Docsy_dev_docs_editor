import type {
  DocumentData,
  DocumentVersionSnapshot,
  DocumentVersionSnapshotMetadata,
  VersionSnapshotTrigger,
} from "@/types/document";

const MAX_VERSION_SNAPSHOTS = 5;
const initializedDocumentIds = new Set<string>();

const loadVersionHistoryStore = () => import("@/lib/history/versionHistoryStore");

const hashString = (value: string) => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

const createSnapshotContentHash = (document: DocumentData) =>
  hashString(JSON.stringify({
    ast: document.ast ?? null,
    content: document.content,
    metadata: document.metadata ?? {},
    mode: document.mode,
    name: document.name,
    sourceSnapshots: document.sourceSnapshots ?? {},
    tiptapJson: document.tiptapJson ?? null,
  }));

const createSnapshot = (
  document: DocumentData,
  trigger: VersionSnapshotTrigger,
  metadata?: DocumentVersionSnapshotMetadata,
) => ({
  contentHash: createSnapshotContentHash(document),
  createdAt: Date.now(),
  document: structuredClone(document),
  documentId: document.id,
  metadata,
  mode: document.mode,
  snapshotId: `snapshot:${document.id}:${Date.now()}:${trigger}`,
  trigger,
}) satisfies DocumentVersionSnapshot;

export const markDocumentVersionHistoryInitialized = (documentId: string) => {
  initializedDocumentIds.add(documentId);
};

export const createVersionHistorySnapshot = async (
  document: DocumentData,
  trigger: VersionSnapshotTrigger,
  metadata?: DocumentVersionSnapshotMetadata,
) => {
  const snapshot = createSnapshot(document, trigger, metadata);
  const { appendDocumentVersionSnapshot } = await loadVersionHistoryStore();
  await appendDocumentVersionSnapshot(snapshot, MAX_VERSION_SNAPSHOTS);
  initializedDocumentIds.add(document.id);
  return snapshot;
};

export const captureAutoSaveVersionSnapshot = async (
  document: DocumentData,
  _locale: "en" | "ko",
) => {
  if (!initializedDocumentIds.has(document.id)) {
    initializedDocumentIds.add(document.id);
    return null;
  }

  return createVersionHistorySnapshot(document, "autosave");
};

export const removeDocumentVersionHistory = async (documentId: string) => {
  const { clearDocumentVersionSnapshots } = await loadVersionHistoryStore();
  await clearDocumentVersionSnapshots(documentId);
  initializedDocumentIds.delete(documentId);
};
