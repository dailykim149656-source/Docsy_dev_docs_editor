import type {
  CreateDocumentOptions,
  DocumentData,
  DocumentVersionSnapshot,
} from "@/types/document";

export type SidebarTab = "documents" | "history" | "knowledge";

export interface KnowledgeSuggestionContext {
  issueId?: string;
  issueKind?: "changed_section" | "conflicting_procedure" | "missing_section";
  issuePriority?: "high" | "low" | "medium";
  issueReason?: string;
  queueContext?: "change" | "consistency" | "impact";
  sourceDocumentId?: string;
  sourceDocumentName?: string;
  targetDocumentName?: string;
}

export interface KnowledgeSuggestionQueueItem {
  attemptCount: number;
  confidenceLabel?: "high" | "low" | "medium";
  context: "change" | "consistency" | "impact";
  errorMessage?: string;
  hasPatchSet: boolean;
  id: string;
  issueId?: string;
  issueKind?: "changed_section" | "conflicting_procedure" | "missing_section";
  issuePriority?: "high" | "low" | "medium";
  issueReason?: string;
  patchCount?: number;
  patchSetTitle?: string;
  reasonSummary?: string;
  sourceCount?: number;
  sourceDocumentId: string;
  sourceDocumentName: string;
  status: "failed" | "queued" | "ready" | "running";
  targetDocumentId: string;
  targetDocumentName: string;
  updatedAt: number;
 }

export interface HistorySidebarPanelsProps {
  activeDoc: DocumentData;
  onGenerateTocSuggestion?: () => void;
  onRestoreVersionSnapshot: (snapshotId: string) => void;
  versionHistoryReady: boolean;
  versionHistoryRestoring: boolean;
  versionHistorySnapshots: DocumentVersionSnapshot[];
  versionHistorySyncing: boolean;
}

export interface KnowledgeSidebarPanelsProps {
  activeDoc: DocumentData;
  activeDocId: string;
  createDocument: (options?: CreateDocumentOptions) => DocumentData;
  documents: DocumentData[];
  onDismissSuggestionQueueItem: (id: string) => void;
  onGenerateTocSuggestion?: () => void;
  onRefreshWorkspaceDocument?: (documentId: string) => void;
  onRescanWorkspaceSources?: () => void;
  onOpenSuggestionQueueItem: (id: string) => void;
  onRetrySuggestionQueueItem: (id: string) => void;
  onSelectDoc: (id: string) => void;
  onSuggestKnowledgeImpactUpdate?: (
    sourceDocumentId: string,
    targetDocumentId: string,
    context?: KnowledgeSuggestionContext,
  ) => void;
  onSuggestKnowledgeUpdates?: (documentId: string, context?: KnowledgeSuggestionContext) => void;
  workspaceChangedSources?: import("@/lib/knowledge/sourceFingerprint").SourceChangeRecord[];
  workspaceLastRescannedAt?: number | null;
  workspaceRescanning?: boolean;
  suggestionQueue: KnowledgeSuggestionQueueItem[];
}
