import type { JSONContent } from "@tiptap/core";
import { Suspense, lazy, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { AiAssistantRuntimeState } from "@/components/editor/AiAssistantRuntime";
import type { DocumentIORuntimeState } from "@/components/editor/DocumentIORuntime";
import type { DocumentSupportRuntimeState } from "@/components/editor/DocumentSupportRuntime";
import type { PreviewRuntimeState } from "@/components/editor/PreviewRuntime";
import type { WorkspaceRuntimeState } from "@/components/editor/WorkspaceRuntime";
import {
  htmlHasAdvancedContent,
  htmlHasDocumentContent,
  markdownHasAdvancedContent,
  markdownHasDocumentContent,
} from "@/components/editor/editorAdvancedContent";
import EditorWorkspace from "@/components/editor/EditorWorkspace";
import ResetDocumentsDialog from "@/components/editor/ResetDocumentsDialog";
import { getBuiltInTemplateDefinitions, type DocumentTemplate } from "@/components/editor/templateCatalog";
import type { PlainTextFindReplaceAdapter } from "@/components/editor/findReplaceTypes";
import type { KnowledgeSuggestionContext, KnowledgeSuggestionQueueItem } from "@/components/editor/sidebarFeatureTypes";
import { Button } from "@/components/ui/button";
import { useDocumentManager } from "@/hooks/useDocumentManager";
import { useEditorUiState } from "@/hooks/useEditorUiState";
import { useFormatConversion } from "@/hooks/useFormatConversion";
import { useI18n } from "@/i18n/useI18n";
import { serializeTiptapToAst } from "@/lib/ast/tiptapAst";
import { featureFlags, isWebProfile } from "@/lib/appProfile";
import {
  readAdvancedBlocksPreference,
  readDocumentToolsPreference,
  readUserProfilePreference,
  writeAdvancedBlocksPreference,
  writeDocumentToolsPreference,
  writeUserProfilePreference,
} from "@/lib/editor/webEditorPreferences";
import {
  clearPendingEditorFocusTarget,
  getPendingEditorFocusTarget,
} from "@/lib/editor/editorFocusTarget";
import { scrollToEditorFocusTarget } from "@/lib/editor/editorFocusNavigation";
import {
  getCrossFamilyModes,
  getSameFamilyModes,
} from "@/lib/editor/modeFamilies";
import {
  getActiveDocumentCompatibility,
  getDeploymentUiCapabilities,
  getUserProfileCapabilities,
  intersectEditorUiCapabilities,
  isModeAllowedInCapabilities,
} from "@/lib/editor/userProfiles";
import { createLatestDeferredTaskRunner } from "@/lib/editor/latestDeferredTask";
import { resetLocalDocumentState } from "@/lib/documents/resetLocalDocumentState";
import {
  RESTORED_SESSION_TOAST_ID,
  UNEXPECTED_RELOAD_LOST_TOAST_ID,
  UNEXPECTED_RELOAD_RECOVERED_TOAST_ID,
  showRestoredSessionToast,
  showUnexpectedReloadLostToast,
  showUnexpectedReloadRecoveredToast,
} from "@/lib/documents/restoredSessionToast";
import { getTemplateFallbackContent as getSharedTemplateFallbackContent } from "@/lib/editor/templateFallback";
import {
  captureAutoSaveVersionSnapshot,
  createVersionHistorySnapshot,
  removeDocumentVersionHistory,
} from "@/lib/history/versionHistoryActions";
import {
  MAX_IMPORT_FILE_SIZE_BYTES,
  resolveImportedDocumentOptions,
} from "@/lib/io/documentIoShared";
import type { DocumentVersionSnapshotMetadata, EditorMode, SourceSnapshots } from "@/types/document";
import type { DocumentPatchSet } from "@/types/documentPatch";
import { toast } from "sonner";

const MarkdownEditor = lazy(() => import("@/components/editor/MarkdownEditor"));
const LatexEditor = lazy(() => import("@/components/editor/LatexEditor"));
const HtmlEditor = lazy(() => import("@/components/editor/HtmlEditor"));
const JsonYamlEditor = lazy(() => import("@/components/editor/JsonYamlEditor"));
const DocumentIORuntime = lazy(() => import("@/components/editor/DocumentIORuntime"));
const DocumentSupportRuntime = lazy(() => import("@/components/editor/DocumentSupportRuntime"));
const PreviewRuntime = lazy(() => import("@/components/editor/PreviewRuntime"));

const EditorFallback = () => (
  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
    Loading editor...
  </div>
);

type PendingAiIntent =
  | { type: "open" }
  | { type: "generate-toc" }
  | {
      context?: KnowledgeSuggestionContext;
      openPatchReviewAfter?: boolean;
      queueEntryId?: string;
      targetDocumentId: string;
      type: "suggest-updates";
    };

interface SuggestionQueueEntry extends KnowledgeSuggestionQueueItem {
  patchSet?: DocumentPatchSet | null;
}

interface PendingImpactSuggestionEntry {
  context?: KnowledgeSuggestionContext;
  openPatchReviewAfter?: boolean;
  queueEntryId?: string;
  sourceDocumentId: string;
  targetDocumentId: string;
}

type PendingDocumentSupportIntent =
  | { type: "open-patch-review" }
  | { openAfterLoad?: boolean; patchSet: DocumentPatchSet; type: "load-patch-set" }
  | { patchSet: DocumentPatchSet; type: "auto-apply-patch-set" };

type PendingWorkspaceAction =
  | { type: "open-connection-dialog" }
  | { type: "open-export-dialog" }
  | { type: "open-import-dialog" }
  | { type: "save-bound-document" }
  | { type: "connect-workspace" }
  | { type: "disconnect-workspace" }
  | { fileId: string; type: "import-workspace-file" }
  | { title: string; type: "export-workspace-document" }
  | { documentId: string; type: "refresh-workspace-document" }
  | { type: "rescan-workspace-changes" };

type PendingIoAction =
  | { type: "copy-html" }
  | { type: "copy-json" }
  | { type: "copy-md" }
  | { type: "copy-share-link" }
  | { type: "copy-yaml" }
  | { type: "load-file" }
  | { type: "open-share-dialog" }
  | { type: "print" }
  | { type: "save-adoc" }
  | { type: "save-docsy" }
  | { type: "save-html" }
  | { type: "save-json" }
  | { type: "save-md" }
  | { type: "save-pdf" }
  | { type: "save-rst" }
  | { type: "save-tex" }
  | { type: "save-typst" }
  | { type: "save-yaml" };

const scheduleIdleMount = (callback: () => void) => {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    const id = window.requestIdleCallback(callback, { timeout: 1500 });
    return () => window.cancelIdleCallback(id);
  }

  const timeoutId = globalThis.setTimeout(callback, 600);
  return () => globalThis.clearTimeout(timeoutId);
};

const getDeferredEditorSyncDelay = (profileKind: "heavy" | "large" | "normal") => {
  switch (profileKind) {
    case "heavy":
      return 700;
    case "large":
      return 240;
    default:
      return 80;
  }
};

const areSourceSnapshotsEqual = (
  left: SourceSnapshots | undefined,
  right: SourceSnapshots | undefined,
) => JSON.stringify(left || {}) === JSON.stringify(right || {});

const aiIntentRequiresRichTextReadiness = (intent: PendingAiIntent) =>
  intent.type === "generate-toc" || intent.type === "suggest-updates";

const createSuggestionQueueId = () =>
  `suggestion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const resolveSuggestionQueueContext = (
  context?: KnowledgeSuggestionContext,
): KnowledgeSuggestionQueueItem["context"] =>
  context?.queueContext || (context?.issueId ? "consistency" : "impact");

const getQueueConfidenceLabel = (
  patchSet?: DocumentPatchSet | null,
): KnowledgeSuggestionQueueItem["confidenceLabel"] => {
  if (!patchSet) {
    return undefined;
  }

  const confidenceValues = patchSet.patches
    .map((patch) => patch.confidence)
    .filter((value): value is number => typeof value === "number");

  if (confidenceValues.length === 0) {
    return undefined;
  }

  const averageConfidence = confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length;

  if (averageConfidence >= 0.85) {
    return "high";
  }

  if (averageConfidence >= 0.6) {
    return "medium";
  }

  return "low";
};

const getQueueSourceCount = (patchSet?: DocumentPatchSet | null) => {
  if (!patchSet) {
    return 0;
  }

  return new Set(
    patchSet.patches.flatMap((patch) =>
      (patch.sources || []).map((source) =>
        `${source.sourceId}:${source.chunkId || "none"}:${source.sectionId || "none"}`)),
  ).size;
};

const matchesSuggestionQueueEntry = (
  entry: SuggestionQueueEntry,
  context: KnowledgeSuggestionQueueItem["context"],
  sourceDocumentId: string,
  targetDocumentId: string,
  issueId?: string,
) =>
  entry.context === context
  && entry.sourceDocumentId === sourceDocumentId
  && entry.targetDocumentId === targetDocumentId
  && (entry.issueId || "") === (issueId || "");

const isKnowledgeIssueKind = (
  value: string | null,
): value is NonNullable<KnowledgeSuggestionContext["issueKind"]> =>
  value === "changed_section" || value === "conflicting_procedure" || value === "missing_section";

const isKnowledgeIssuePriority = (
  value: string | null,
): value is NonNullable<KnowledgeSuggestionContext["issuePriority"]> =>
  value === "high" || value === "medium" || value === "low";

const getTemplateFallbackContent = (mode: EditorMode, locale: "en" | "ko") => {
  const isKo = locale === "ko";

  switch (mode) {
    case "markdown":
      return isKo
        ? [
          "# 새 문서",
          "",
          "## 요약",
          "",
          "간단한 요약을 작성하세요.",
        ].join("\n")
        : [
          "# New Document",
          "",
          "## Summary",
          "",
          "Write a short summary.",
        ].join("\n");
    case "latex":
      return isKo
        ? [
          "\\section{요약}",
          "간단한 요약을 작성하세요.",
        ].join("\n")
        : [
          "\\section{Summary}",
          "Write a short summary.",
        ].join("\n");
    case "html":
      return isKo
        ? [
          "<h1>새 문서</h1>",
          "<h2>요약</h2>",
          "<p>간단한 요약을 작성하세요.</p>",
        ].join("\n")
        : [
          "<h1>New Document</h1>",
          "<h2>Summary</h2>",
          "<p>Write a short summary.</p>",
        ].join("\n");
    case "json":
      return JSON.stringify({ summary: isKo ? "간단한 요약을 작성하세요." : "Write a short summary." }, null, 2);
    case "yaml":
      return [
        `summary: ${isKo ? "간단한 요약을 작성하세요." : "Write a short summary."}`,
      ].join("\n");
    default:
      return "";
  }
};

const getStableTemplateFallbackContent = (mode: EditorMode, locale: "en" | "ko") => {
  const isKo = locale === "ko";

  switch (mode) {
    case "markdown":
      return isKo
        ? ["# 새 문서", "", "## 요약", "", "간단한 요약을 작성하세요."].join("\n")
        : ["# New Document", "", "## Summary", "", "Write a short summary."].join("\n");
    case "latex":
      return isKo
        ? ["\\section{요약}", "간단한 요약을 작성하세요."].join("\n")
        : ["\\section{Summary}", "Write a short summary."].join("\n");
    case "html":
      return isKo
        ? ["<h1>새 문서</h1>", "<h2>요약</h2>", "<p>간단한 요약을 작성하세요.</p>"].join("\n")
        : ["<h1>New Document</h1>", "<h2>Summary</h2>", "<p>Write a short summary.</p>"].join("\n");
    case "json":
      return JSON.stringify(
        { summary: isKo ? "간단한 요약을 작성하세요." : "Write a short summary." },
        null,
        2,
      );
    case "yaml":
      return `summary: ${isKo ? "간단한 요약을 작성하세요." : "Write a short summary."}`;
    default:
      return "";
  }
};

const templateRequiresDocumentFeatures = (mode: EditorMode, content: string) => {
  switch (mode) {
    case "markdown":
      return markdownHasDocumentContent(content);
    case "html":
      return htmlHasDocumentContent(content);
    default:
      return false;
  }
};

const templateRequiresAdvancedBlocks = (mode: EditorMode, content: string) => {
  switch (mode) {
    case "markdown":
      return markdownHasAdvancedContent(content);
    case "html":
      return htmlHasAdvancedContent(content);
    default:
      return false;
  }
};

const Index = () => {
  const { locale, t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { shareId } = useParams<{ shareId?: string }>();
  const isE2E = searchParams.get("e2e") === "1";
  const [activeEditor, setActiveEditor] = useState<TiptapEditor | null>(null);
  const [pendingImpactSuggestions, setPendingImpactSuggestions] = useState<PendingImpactSuggestionEntry[]>([]);
  const [plainTextSearchAdapter, setPlainTextSearchAdapter] = useState<PlainTextFindReplaceAdapter | null>(null);
  const [userProfile, setUserProfile] = useState(() => readUserProfilePreference(featureFlags.defaultUserProfile));
  const llmFeaturesEnabled = featureFlags.llmFeaturesEnabled;
  const remoteShareEnabled = featureFlags.remoteShareEnabled;
  const remoteTexServiceEnabled = featureFlags.remoteTexServiceEnabled;
  const remoteWorkspaceEnabled = featureFlags.remoteWorkspaceEnabled;
  const [advancedBlocksPreference, setAdvancedBlocksPreference] = useState(() =>
    featureFlags.advancedBlocksOnInitialMount || readAdvancedBlocksPreference(),
  );
  const [documentToolsPreference, setDocumentToolsPreference] = useState(() =>
    featureFlags.documentToolsOnInitialMount || readDocumentToolsPreference(),
  );
  const [aiRuntimeEnabled, setAiRuntimeEnabled] = useState(() => featureFlags.aiOnInitialMount);
  const [aiRuntimeState, setAiRuntimeState] = useState<AiAssistantRuntimeState | null>(null);
  const [pendingAiIntent, setPendingAiIntent] = useState<PendingAiIntent | null>(null);
  const [ioRuntimeEnabled, setIoRuntimeEnabled] = useState(false);
  const [ioRuntimeState, setIoRuntimeState] = useState<DocumentIORuntimeState | null>(null);
  const [pendingIoAction, setPendingIoAction] = useState<PendingIoAction | null>(null);
  const [documentSupportRuntimeEnabled, setDocumentSupportRuntimeEnabled] = useState(false);
  const [documentSupportRuntimeState, setDocumentSupportRuntimeState] = useState<DocumentSupportRuntimeState | null>(null);
  const [pendingDocumentSupportIntent, setPendingDocumentSupportIntent] = useState<PendingDocumentSupportIntent | null>(null);
  const [previewRuntimeState, setPreviewRuntimeState] = useState<PreviewRuntimeState | null>(null);
  const [workspaceRuntimeEnabled, setWorkspaceRuntimeEnabled] = useState(false);
  const [workspaceRuntimeState, setWorkspaceRuntimeState] = useState<WorkspaceRuntimeState | null>(null);
  const [pendingWorkspaceAction, setPendingWorkspaceAction] = useState<PendingWorkspaceAction | null>(null);
  const [suggestionQueue, setSuggestionQueue] = useState<SuggestionQueueEntry[]>([]);
  const [historyEnabled, setHistoryEnabled] = useState(() => featureFlags.historyOnInitialMount);
  const [knowledgeEnabled, setKnowledgeEnabled] = useState(() => featureFlags.knowledgeOnInitialMount);
  const [structuredModesVisible, setStructuredModesVisible] = useState(() => featureFlags.structuredModesVisibleOnInitialMount);
  const [documentResetVersion, setDocumentResetVersion] = useState(0);
  const [resetDocumentsDialogOpen, setResetDocumentsDialogOpen] = useState(false);
  const [isResettingDocuments, setIsResettingDocuments] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [workspaceConnectionOpen, setWorkspaceConnectionOpen] = useState(false);
  const [workspaceExportOpen, setWorkspaceExportOpen] = useState(false);
  const [workspaceImportOpen, setWorkspaceImportOpen] = useState(false);
  const [pendingLatexSourceLine, setPendingLatexSourceLine] = useState<number | null>(null);
  const shellFileInputRef = useRef<HTMLInputElement | null>(null);
  const {
    activeDoc,
    activeDocId,
    autoSaveState,
    bumpEditorKey,
    closeDocument,
    createDocument,
    deleteDocument,
    documents,
    editorKey,
    handleContentChange,
    hasRestoredDocuments,
    isRecovering,
    recoveryFailure,
    renameDocument,
    resetDocuments,
    selectDocument,
    unexpectedReloadState,
    updateDocument,
    updateActiveDoc,
  } = useDocumentManager();
  const lastCapturedAutoSaveAtRef = useRef<number | null>(null);
  const pendingWorkspaceAuthRedirectRef = useRef<string | null>(null);
  const {
    closeFindReplace,
    closePreview,
    countWithSpaces,
    findReplaceOpen,
    isDark,
    isFullscreen,
    openShortcuts,
    openTemplateDialog,
    previewOpen,
    setShortcutsOpen,
    setTemplateOpen,
    shortcutsOpen,
    templateOpen,
    toggleCountMode,
    toggleFullscreen,
    togglePreview,
    toggleTheme,
  } = useEditorUiState();
  const {
    currentRenderableHtml,
    currentRenderableLatex,
    currentRenderableLatexDocument,
    currentRenderableMarkdown,
    documentPerformanceProfile,
    flushSecondaryRenderables,
    getFreshRenderableLatexDocument,
    getFreshRenderableMarkdown,
    handleModeChange,
    secondaryConversionsPending,
    setLiveEditorHtml,
    textStats,
  } = useFormatConversion({
    activeEditor,
    activeDoc,
    activeDocId,
    bumpEditorKey,
    countWithSpaces,
    editorKey,
    updateActiveDoc,
  });
  const currentActiveDocIdRef = useRef(activeDoc.id);
  const astSyncRunnerRef = useRef(createLatestDeferredTaskRunner());
  const sourceSnapshotSyncRunnerRef = useRef(createLatestDeferredTaskRunner());
  const richTextSeedRef = useRef<{
    initialContent?: string;
    initialHtmlOverride?: string;
    initialTiptapDoc?: JSONContent;
    revision: string;
  } | null>(null);
  const richTextSeedRevision = `${activeDoc.id}:${editorKey}`;

  if (!richTextSeedRef.current || richTextSeedRef.current.revision !== richTextSeedRevision) {
    richTextSeedRef.current = {
      initialContent: activeDoc.content || undefined,
      initialHtmlOverride: activeDoc.sourceSnapshots?.html,
      initialTiptapDoc: activeDoc.tiptapJson || undefined,
      revision: richTextSeedRevision,
    };
  }

  const richTextSeed = richTextSeedRef.current;

  useEffect(() => {
    currentActiveDocIdRef.current = activeDoc.id;
  }, [activeDoc.id]);

  useEffect(() => () => {
    astSyncRunnerRef.current.cancel();
    sourceSnapshotSyncRunnerRef.current.cancel();
  }, []);
  const deploymentCapabilities = useMemo(
    () => getDeploymentUiCapabilities(featureFlags.profile),
    [],
  );
  const effectiveCapabilities = useMemo(
    () => intersectEditorUiCapabilities(deploymentCapabilities, getUserProfileCapabilities(userProfile)),
    [deploymentCapabilities, userProfile],
  );
  const {
    canAccessAdvancedBlocks,
    canAccessAiAssistant,
    canAccessDocumentTools,
    canAccessHistory,
    canAccessKnowledge,
    canAccessPatchReview,
    canAccessStructuredModes,
  } = effectiveCapabilities;
  const handleUserProfileChange = useCallback((nextProfile: "beginner" | "advanced") => {
    setUserProfile(nextProfile);
    writeUserProfilePreference(nextProfile);
  }, []);
  const recordVersionSnapshot = useCallback((
    document: typeof activeDoc,
    trigger: "autosave" | "export" | "patch_apply",
    metadata?: DocumentVersionSnapshotMetadata,
  ) => createVersionHistorySnapshot(document, trigger, metadata), []);
  const requestPatchReviewOpen = useCallback(() => {
    if (!canAccessPatchReview) {
      return;
    }

    if (documentSupportRuntimeState) {
      documentSupportRuntimeState.openPatchReview();
      return;
    }

    setDocumentSupportRuntimeEnabled(true);
    setPendingDocumentSupportIntent({ type: "open-patch-review" });
  }, [canAccessPatchReview, documentSupportRuntimeState]);
  const requestPatchSetLoad = useCallback((nextPatchSet: DocumentPatchSet) => {
    if (!canAccessPatchReview) {
      return;
    }

    if (documentSupportRuntimeState) {
      documentSupportRuntimeState.loadPatchSet(nextPatchSet);
      return;
    }

    setDocumentSupportRuntimeEnabled(true);
    setPendingDocumentSupportIntent({
      patchSet: nextPatchSet,
      type: "load-patch-set",
    });
  }, [canAccessPatchReview, documentSupportRuntimeState]);
  const requestPatchSetAutoApply = useCallback(async (nextPatchSet: DocumentPatchSet) => {
    if (!canAccessPatchReview) {
      return false;
    }

    if (documentSupportRuntimeState) {
      return documentSupportRuntimeState.autoApplyPatchSet(nextPatchSet);
    }

    setDocumentSupportRuntimeEnabled(true);
    setPendingDocumentSupportIntent({
      patchSet: nextPatchSet,
      type: "auto-apply-patch-set",
    });
    return true;
  }, [canAccessPatchReview, documentSupportRuntimeState]);
  const openPatchReview = requestPatchReviewOpen;
  const loadPatchSet = requestPatchSetLoad;
  const ensureWorkspaceRuntime = useCallback((pendingAction?: PendingWorkspaceAction) => {
    if (!remoteWorkspaceEnabled) {
      return;
    }

    setWorkspaceRuntimeEnabled(true);

    if (pendingAction) {
      setPendingWorkspaceAction(pendingAction);
    }
  }, [remoteWorkspaceEnabled]);
  const ensureIoRuntime = useCallback((pendingAction?: PendingIoAction) => {
    setIoRuntimeEnabled(true);

    if (pendingAction) {
      setPendingIoAction(pendingAction);
    }
  }, []);
  const workspaceSyncing = remoteWorkspaceEnabled ? workspaceRuntimeState?.isSyncing ?? false : false;
  const workspaceExporting = remoteWorkspaceEnabled ? workspaceRuntimeState?.isExporting ?? false : false;
  const fileInputRef = ioRuntimeState?.fileInputRef ?? shellFileInputRef;
  const importState = ioRuntimeState?.importState ?? {
    error: null,
    fileName: null,
    progress: null,
    status: "idle" as const,
  };
  const shareLinkInfo = ioRuntimeState?.shareLinkInfo ?? {
    available: false,
    errorCode: null,
    expiresAt: null,
    link: null,
    shareId: null,
  };
  const handleCopyHtml = useCallback(() => {
    if (ioRuntimeState) {
      void ioRuntimeState.handleCopyHtml();
      return;
    }

    ensureIoRuntime({ type: "copy-html" });
  }, [ensureIoRuntime, ioRuntimeState]);
  const handleCopyJson = useCallback(() => {
    if (ioRuntimeState) {
      void ioRuntimeState.handleCopyJson();
      return;
    }

    ensureIoRuntime({ type: "copy-json" });
  }, [ensureIoRuntime, ioRuntimeState]);
  const handleCopyMd = useCallback(() => {
    if (ioRuntimeState) {
      void ioRuntimeState.handleCopyMd();
      return;
    }

    ensureIoRuntime({ type: "copy-md" });
  }, [ensureIoRuntime, ioRuntimeState]);
  const handleCopyShareLink = useCallback(() => {
    if (!remoteShareEnabled) {
      return;
    }

    if (ioRuntimeState) {
      void ioRuntimeState.handleCopyShareLink();
      return;
    }

    ensureIoRuntime({ type: "copy-share-link" });
  }, [ensureIoRuntime, ioRuntimeState, remoteShareEnabled]);
  const handleCopyYaml = useCallback(() => {
    if (ioRuntimeState) {
      void ioRuntimeState.handleCopyYaml();
      return;
    }

    ensureIoRuntime({ type: "copy-yaml" });
  }, [ensureIoRuntime, ioRuntimeState]);
  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    ioRuntimeState?.handleFileChange(event);
  }, [ioRuntimeState]);
  const handleLoad = useCallback(() => {
    if (ioRuntimeState) {
      ioRuntimeState.handleLoad();
      return;
    }

    ensureIoRuntime({ type: "load-file" });
  }, [ensureIoRuntime, ioRuntimeState]);
  const handlePrint = useCallback(() => {
    if (ioRuntimeState) {
      ioRuntimeState.handlePrint();
      return;
    }

    ensureIoRuntime({ type: "print" });
  }, [ensureIoRuntime, ioRuntimeState]);
  const handleSaveAdoc = useCallback(() => {
    if (ioRuntimeState) {
      void ioRuntimeState.handleSaveAdoc();
      return;
    }

    ensureIoRuntime({ type: "save-adoc" });
  }, [ensureIoRuntime, ioRuntimeState]);
  const handleSaveDocsy = useCallback(() => {
    if (ioRuntimeState) {
      void ioRuntimeState.handleSaveDocsy();
      return;
    }

    ensureIoRuntime({ type: "save-docsy" });
  }, [ensureIoRuntime, ioRuntimeState]);
  const handleSaveHtml = useCallback(() => {
    if (ioRuntimeState) {
      void ioRuntimeState.handleSaveHtml();
      return;
    }

    ensureIoRuntime({ type: "save-html" });
  }, [ensureIoRuntime, ioRuntimeState]);
  const handleSaveJson = useCallback(() => {
    if (ioRuntimeState) {
      void ioRuntimeState.handleSaveJson();
      return;
    }

    ensureIoRuntime({ type: "save-json" });
  }, [ensureIoRuntime, ioRuntimeState]);
  const handleSaveMd = useCallback(() => {
    if (ioRuntimeState) {
      void ioRuntimeState.handleSaveMd();
      return;
    }

    ensureIoRuntime({ type: "save-md" });
  }, [ensureIoRuntime, ioRuntimeState]);
  const handleSavePdf = useCallback(() => {
    if (ioRuntimeState) {
      void ioRuntimeState.handleSavePdf();
      return;
    }

    ensureIoRuntime({ type: "save-pdf" });
  }, [ensureIoRuntime, ioRuntimeState]);
  const handleSaveRst = useCallback(() => {
    if (ioRuntimeState) {
      void ioRuntimeState.handleSaveRst();
      return;
    }

    ensureIoRuntime({ type: "save-rst" });
  }, [ensureIoRuntime, ioRuntimeState]);
  const handleSaveTex = useCallback(() => {
    if (ioRuntimeState) {
      void ioRuntimeState.handleSaveTex();
      return;
    }

    ensureIoRuntime({ type: "save-tex" });
  }, [ensureIoRuntime, ioRuntimeState]);
  const handleSaveTypst = useCallback(() => {
    if (ioRuntimeState) {
      void ioRuntimeState.handleSaveTypst();
      return;
    }

    ensureIoRuntime({ type: "save-typst" });
  }, [ensureIoRuntime, ioRuntimeState]);
  const handleSaveYaml = useCallback(() => {
    if (ioRuntimeState) {
      void ioRuntimeState.handleSaveYaml();
      return;
    }

    ensureIoRuntime({ type: "save-yaml" });
  }, [ensureIoRuntime, ioRuntimeState]);
  const handleOpenShare = useCallback(() => {
    if (!remoteShareEnabled) {
      return;
    }

    if (ioRuntimeState) {
      void ioRuntimeState.prepareShareLink().finally(() => setShareDialogOpen(true));
      return;
    }

    ensureIoRuntime({ type: "open-share-dialog" });
  }, [ensureIoRuntime, ioRuntimeState, remoteShareEnabled]);
  const syncDocument = useCallback(async (
    document: typeof activeDoc,
    options?: {
      markdown?: string;
    },
  ) => {
    if (!remoteWorkspaceEnabled) {
      return null;
    }

    if (!workspaceRuntimeState) {
      ensureWorkspaceRuntime();
      return null;
    }

    return workspaceRuntimeState.syncDocument(document, options);
  }, [ensureWorkspaceRuntime, remoteWorkspaceEnabled, workspaceRuntimeState]);
  const refetchWorkspaceFiles = useCallback(() => {
    if (!remoteWorkspaceEnabled) {
      return;
    }

    if (workspaceRuntimeState) {
      void workspaceRuntimeState.refetchFiles();
      return;
    }

    ensureWorkspaceRuntime();
  }, [ensureWorkspaceRuntime, remoteWorkspaceEnabled, workspaceRuntimeState]);
  const setWorkspaceFileQuery = useCallback((value: string) => {
    if (!remoteWorkspaceEnabled) {
      return;
    }

    if (workspaceRuntimeState) {
      workspaceRuntimeState.setQuery(value);
      return;
    }

    ensureWorkspaceRuntime();
  }, [ensureWorkspaceRuntime, remoteWorkspaceEnabled, workspaceRuntimeState]);
  const closePatchReview = useCallback(() => {
    documentSupportRuntimeState?.closePatchReview();
  }, [documentSupportRuntimeState]);
  const clearPatchSet = useCallback(() => {
    documentSupportRuntimeState?.clearPatchSet();
  }, [documentSupportRuntimeState]);
  const handleAcceptPatch = useCallback((patch: import("@/types/documentPatch").DocumentPatch) => {
    documentSupportRuntimeState?.handleAcceptPatch(patch);
  }, [documentSupportRuntimeState]);
  const handleAcceptPatches = useCallback((patchIds: string[]) => {
    documentSupportRuntimeState?.handleAcceptPatches(patchIds);
  }, [documentSupportRuntimeState]);
  const handleEditPatch = useCallback((
    patch: import("@/types/documentPatch").DocumentPatch,
    suggestedText: string,
  ) => {
    documentSupportRuntimeState?.handleEditPatch(patch, suggestedText);
  }, [documentSupportRuntimeState]);
  const handleRejectPatch = useCallback((patch: import("@/types/documentPatch").DocumentPatch) => {
    documentSupportRuntimeState?.handleRejectPatch(patch);
  }, [documentSupportRuntimeState]);
  const handleRejectPatches = useCallback((patchIds: string[]) => {
    documentSupportRuntimeState?.handleRejectPatches(patchIds);
  }, [documentSupportRuntimeState]);
  const applyReviewedPatches = useCallback(async () => {
    await documentSupportRuntimeState?.applyReviewedPatches();
  }, [documentSupportRuntimeState]);
  const restoreVersionSnapshot = useCallback(async (snapshotId: string) => {
    await documentSupportRuntimeState?.restoreVersionSnapshot(snapshotId);
  }, [documentSupportRuntimeState]);
  const acceptedPatchCount = documentSupportRuntimeState?.acceptedPatchCount ?? 0;
  const patchCount = documentSupportRuntimeState?.patchCount ?? 0;
  const lastApplyReport = documentSupportRuntimeState?.lastApplyReport ?? null;
  const patchReviewOpen = documentSupportRuntimeState?.patchReviewOpen ?? false;
  const patchSet = documentSupportRuntimeState?.patchSet ?? null;
  const versionHistoryReady = documentSupportRuntimeState?.versionHistoryReady ?? false;
  const versionHistoryRestoring = documentSupportRuntimeState?.versionHistoryRestoring ?? false;
  const versionHistorySnapshots = documentSupportRuntimeState?.versionHistorySnapshots ?? [];
  const versionHistorySyncing = documentSupportRuntimeState?.versionHistorySyncing ?? false;

  useEffect(() => {
    setPendingLatexSourceLine(null);
  }, [activeDoc.id, activeDoc.mode]);
  const workspaceConnected = remoteWorkspaceEnabled ? workspaceRuntimeState?.connected ?? false : false;
  const connectivityDiagnostic = remoteWorkspaceEnabled ? workspaceRuntimeState?.connectivityDiagnostic ?? null : null;
  const workspaceAuthError = remoteWorkspaceEnabled ? workspaceRuntimeState?.authError ?? null : null;
  const workspaceConnecting = remoteWorkspaceEnabled ? workspaceRuntimeState?.isConnecting ?? false : false;
  const workspaceDisconnecting = remoteWorkspaceEnabled ? workspaceRuntimeState?.isDisconnecting ?? false : false;
  const workspaceAuthLoading = remoteWorkspaceEnabled ? workspaceRuntimeState?.isAuthLoading ?? false : false;
  const workspaceSession = remoteWorkspaceEnabled && workspaceRuntimeState?.session ? workspaceRuntimeState.session : {
    connected: false,
    provider: null,
    user: null,
  };
  const workspaceFiles = remoteWorkspaceEnabled ? workspaceRuntimeState?.files ?? [] : [];
  const workspaceImporting = remoteWorkspaceEnabled ? workspaceRuntimeState?.isImporting ?? false : false;
  const workspaceFilesLoading = remoteWorkspaceEnabled
    ? workspaceRuntimeState
      ? workspaceRuntimeState.isFilesLoading
      : workspaceImportOpen
    : false;
  const workspaceFilesRefreshing = remoteWorkspaceEnabled ? workspaceRuntimeState?.isRefreshingFiles ?? false : false;
  const workspaceFileQuery = remoteWorkspaceEnabled ? workspaceRuntimeState?.query ?? "" : "";
  const workspaceChangesError = remoteWorkspaceEnabled ? workspaceRuntimeState?.changesError ?? null : null;
  const workspaceRefreshingDocument = remoteWorkspaceEnabled ? workspaceRuntimeState?.isRefreshingDocument ?? false : false;
  const workspaceChangesRescanning = remoteWorkspaceEnabled ? workspaceRuntimeState?.isRescanning ?? false : false;
  const workspaceLastRescannedAt = remoteWorkspaceEnabled ? workspaceRuntimeState?.lastRescannedAt ?? null : null;
  const remoteChangedSources = remoteWorkspaceEnabled ? workspaceRuntimeState?.remoteChangedSources ?? [] : [];
  const activeDocumentCompatibility = useMemo(
    () => getActiveDocumentCompatibility(activeDoc, effectiveCapabilities),
    [activeDoc, effectiveCapabilities],
  );
  const sameFamilyModes = useMemo(
    () => getSameFamilyModes(activeDoc.mode),
    [activeDoc.mode],
  );
  const availableModes = useMemo(() => {
    const filteredModes = sameFamilyModes.filter((mode) => isModeAllowedInCapabilities(mode, effectiveCapabilities));
    return filteredModes.length > 0 ? filteredModes : [activeDoc.mode];
  }, [activeDoc.mode, effectiveCapabilities, sameFamilyModes]);
  const crossFamilyModes = useMemo(
    () => getCrossFamilyModes(activeDoc.mode).filter((mode) => isModeAllowedInCapabilities(mode, effectiveCapabilities)),
    [activeDoc.mode, effectiveCapabilities],
  );
  const documentFeaturesEnabled = canAccessDocumentTools && documentToolsPreference;
  const advancedBlocksEnabled = canAccessAdvancedBlocks && advancedBlocksPreference;
  const canEnableDocumentFeatures = canAccessDocumentTools
    && activeDocumentCompatibility.isCompatible
    && activeDoc.mode !== "json"
    && activeDoc.mode !== "yaml";
  const canEnableAdvancedBlocks = canAccessAdvancedBlocks
    && activeDocumentCompatibility.isCompatible
    && activeDoc.mode !== "json"
    && activeDoc.mode !== "yaml";

  const enableStructuredModes = useCallback(() => {
    if (!canAccessStructuredModes) {
      return;
    }

    setStructuredModesVisible(true);
  }, [canAccessStructuredModes]);

  const enableAdvancedBlocks = useCallback(() => {
    if (!canAccessAdvancedBlocks) {
      return;
    }

    setAdvancedBlocksPreference(true);
    writeAdvancedBlocksPreference(true);
  }, [canAccessAdvancedBlocks]);
  const enableDocumentFeatures = useCallback(() => {
    if (!canAccessDocumentTools) {
      return;
    }

    setDocumentToolsPreference(true);
    writeDocumentToolsPreference(true);
  }, [canAccessDocumentTools]);
  const canOpenTemplates = useMemo(() => getBuiltInTemplateDefinitions().some((template) => {
    const templateContent = template.content.trim().length > 0 || template.id === "blank-markdown"
      ? template.content
      : getSharedTemplateFallbackContent(template.mode, locale);

    return isModeAllowedInCapabilities(template.mode, effectiveCapabilities)
      && (!templateRequiresDocumentFeatures(template.mode, templateContent) || canAccessDocumentTools)
      && (!templateRequiresAdvancedBlocks(template.mode, templateContent) || canAccessAdvancedBlocks);
  }), [canAccessAdvancedBlocks, canAccessDocumentTools, effectiveCapabilities, locale]);
  const richTextAvailable = activeDoc.mode === "markdown" || activeDoc.mode === "latex" || activeDoc.mode === "html";
  const resetDocumentsDisabled = isResettingDocuments
    || importState.status === "reading"
    || workspaceImporting
    || workspaceExporting
    || workspaceSyncing
    || Boolean(aiRuntimeState?.busyAction)
    || Boolean(aiRuntimeState?.liveAgent.isSubmitting);
  const getDocumentNameById = useCallback((documentId: string) =>
    documents.find((document) => document.id === documentId)?.name || t("common.untitled"), [documents, t]);
  const updateSuggestionQueueEntry = useCallback((
    entryId: string,
    updater: (entry: SuggestionQueueEntry) => SuggestionQueueEntry,
  ) => {
    setSuggestionQueue((current) => current.map((entry) => (
      entry.id === entryId ? updater(entry) : entry
    )));
  }, []);

  const runAiIntent = useCallback(async (intent: PendingAiIntent) => {
    if (!llmFeaturesEnabled) {
      return;
    }

    if (!aiRuntimeState) {
      return;
    }

    if (intent.type === "open") {
      aiRuntimeState.setAssistantOpen(true);
      return;
    }

    if (intent.type === "generate-toc") {
      await aiRuntimeState.generateTocSuggestion();
      aiRuntimeState.setAssistantOpen(true);
      return;
    }

    if (intent.queueEntryId) {
      updateSuggestionQueueEntry(intent.queueEntryId, (entry) => ({
        ...entry,
        errorMessage: undefined,
        status: "running",
        updatedAt: Date.now(),
      }));
    }

    try {
      const result = await aiRuntimeState.suggestUpdatesFromDocument(intent.targetDocumentId, intent.context);

      if (intent.queueEntryId) {
        updateSuggestionQueueEntry(intent.queueEntryId, (entry) => ({
          ...entry,
          confidenceLabel: getQueueConfidenceLabel(result?.patchSet),
          errorMessage: result && result.patchCount === 0 ? t("hooks.ai.noDiff") : undefined,
          hasPatchSet: Boolean(result?.patchSet && (result.patchCount || 0) > 0),
          patchCount: result?.patchCount,
          patchSet: result?.patchSet || null,
          patchSetTitle: result?.patchSetTitle,
          sourceCount: getQueueSourceCount(result?.patchSet),
          status: "ready",
          updatedAt: Date.now(),
        }));
      }

    } catch (error) {
      if (intent.queueEntryId) {
        updateSuggestionQueueEntry(intent.queueEntryId, (entry) => ({
          ...entry,
          errorMessage: error instanceof Error ? error.message : t("hooks.ai.updateFailed"),
          hasPatchSet: false,
          patchSet: null,
          status: "failed",
          updatedAt: Date.now(),
        }));
      }

      throw error;
    }
  }, [aiRuntimeState, llmFeaturesEnabled, t, updateSuggestionQueueEntry]);

  const requestAiIntent = useCallback((intent: PendingAiIntent) => {
    if (!canAccessAiAssistant || !llmFeaturesEnabled) {
      return;
    }

    const richTextReady = !aiIntentRequiresRichTextReadiness(intent)
      || Boolean(activeEditor);

    if (aiRuntimeState && richTextReady) {
      void runAiIntent(intent);
      return;
    }

    setAiRuntimeEnabled(true);
    setPendingAiIntent(intent);
  }, [activeEditor, aiRuntimeState, canAccessAiAssistant, llmFeaturesEnabled, runAiIntent]);
  const handleTogglePreview = useCallback(() => {
    if (previewOpen) {
      togglePreview();
      return;
    }

    void flushSecondaryRenderables().finally(() => {
      togglePreview();
    });
  }, [flushSecondaryRenderables, previewOpen, togglePreview]);
  const queueKnowledgeSuggestion = useCallback(({
    context,
    forceQueue = false,
    openPatchReviewAfter = false,
    queueEntryId,
    sourceDocumentId,
    targetDocumentId,
  }: {
    context?: KnowledgeSuggestionContext;
    forceQueue?: boolean;
    openPatchReviewAfter?: boolean;
    queueEntryId?: string;
    sourceDocumentId: string;
    targetDocumentId: string;
  }) => {
    if (!canAccessKnowledge || !llmFeaturesEnabled) {
      return;
    }

    const sourceDocumentName = getDocumentNameById(sourceDocumentId);
    const targetDocumentName = getDocumentNameById(targetDocumentId);
    const nextContext: KnowledgeSuggestionContext | undefined = context
      ? {
        ...context,
        sourceDocumentId,
        sourceDocumentName: context.sourceDocumentName || sourceDocumentName,
        targetDocumentName: context.targetDocumentName || targetDocumentName,
      }
      : {
        queueContext: "impact",
        sourceDocumentId,
          sourceDocumentName,
          targetDocumentName,
        };
    const queueContext = resolveSuggestionQueueContext(nextContext);
    const existingEntry = suggestionQueue.find((entry) =>
      matchesSuggestionQueueEntry(
        entry,
        queueContext,
        sourceDocumentId,
        targetDocumentId,
        nextContext?.issueId,
      ));
    const entryId = queueEntryId || existingEntry?.id || createSuggestionQueueId();
    const reasonSummary = nextContext?.issueReason
      || (queueContext === "consistency"
        ? t("knowledge.healthNextMissing")
        : queueContext === "change"
          ? t("knowledge.changeMonitoringQueueReason", {
            source: sourceDocumentName,
            target: targetDocumentName,
          })
          : t("knowledge.impactNeedsAttention", { count: 1 }));

    setSuggestionQueue((current) => {
      const nextEntry: SuggestionQueueEntry = {
        attemptCount: (existingEntry?.attemptCount || 0) + 1,
        context: queueContext,
        errorMessage: undefined,
        hasPatchSet: false,
        id: entryId,
        issueId: nextContext.issueId,
        issueKind: nextContext.issueKind,
        issuePriority: nextContext.issuePriority,
        issueReason: nextContext.issueReason,
        patchCount: undefined,
        patchSet: null,
        patchSetTitle: undefined,
        reasonSummary,
        sourceCount: undefined,
        sourceDocumentId,
        sourceDocumentName,
        status: "queued",
        targetDocumentId,
        targetDocumentName,
        updatedAt: Date.now(),
      };

      return [
        nextEntry,
        ...current.filter((entry) => entry.id !== entryId),
      ].slice(0, 12);
    });

    if (!forceQueue && activeDoc.id === sourceDocumentId) {
      requestAiIntent({
        context: nextContext,
        openPatchReviewAfter,
        queueEntryId: entryId,
        targetDocumentId,
        type: "suggest-updates",
      });
      return;
    }

    setPendingImpactSuggestions((current) => [
      ...current.filter((entry) => entry.queueEntryId !== entryId),
      {
        context: nextContext,
        openPatchReviewAfter,
        queueEntryId: entryId,
        sourceDocumentId,
        targetDocumentId,
      },
    ]);
  }, [activeDoc.id, canAccessKnowledge, getDocumentNameById, llmFeaturesEnabled, requestAiIntent, suggestionQueue, t]);
  const suggestionQueueItems = useMemo(
    () => suggestionQueue.map(({ patchSet: _patchSet, ...entry }) => entry),
    [suggestionQueue],
  );
  const handleOpenSuggestionQueueItem = useCallback((entryId: string) => {
    const entry = suggestionQueue.find((queueEntry) => queueEntry.id === entryId);

    if (!entry?.patchSet || !entry.hasPatchSet) {
      return;
    }

    loadPatchSet(entry.patchSet);
  }, [loadPatchSet, suggestionQueue]);
  const handleDismissSuggestionQueueItem = useCallback((entryId: string) => {
    setSuggestionQueue((current) => current.filter((entry) => entry.id !== entryId));
  }, []);
  const handleRetrySuggestionQueueItem = useCallback((entryId: string) => {
    const entry = suggestionQueue.find((queueEntry) => queueEntry.id === entryId);

    if (!entry) {
      return;
    }

    queueKnowledgeSuggestion({
      context: {
        issueId: entry.issueId,
        issueKind: entry.issueKind,
        issuePriority: entry.issuePriority,
        issueReason: entry.issueReason,
        queueContext: entry.context,
        sourceDocumentId: entry.sourceDocumentId,
        sourceDocumentName: entry.sourceDocumentName,
        targetDocumentName: entry.targetDocumentName,
      },
      queueEntryId: entry.id,
      sourceDocumentId: entry.sourceDocumentId,
      targetDocumentId: entry.targetDocumentId,
    });
  }, [queueKnowledgeSuggestion, suggestionQueue]);
  const clearWorkspaceAuthParams = useCallback(() => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("workspaceAuth");
      next.delete("workspaceAuthError");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const clearKnowledgeActionParams = useCallback(() => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);

      [
        "knowledgeAction",
        "context",
        "source",
        "target",
        "issueId",
        "issueKind",
        "issuePriority",
        "issueReason",
      ].forEach((key) => next.delete(key));

      return next;
    }, { replace: true });
  }, [setSearchParams]);
  useEffect(() => {
    if (!remoteWorkspaceEnabled) {
      return;
    }

    if (searchParams.get("workspaceAuth") || searchParams.get("workspaceAuthError") || aiRuntimeEnabled) {
      setWorkspaceRuntimeEnabled(true);
    }
  }, [aiRuntimeEnabled, remoteWorkspaceEnabled, searchParams]);

  useEffect(() => {
    if (!remoteWorkspaceEnabled) {
      return;
    }

    if (workspaceRuntimeEnabled || !documents.some((document) => document.workspaceBinding)) {
      return;
    }

    return scheduleIdleMount(() => {
      setWorkspaceRuntimeEnabled(true);
    });
  }, [documents, remoteWorkspaceEnabled, workspaceRuntimeEnabled]);

  useEffect(() => {
    if (!ioRuntimeState || !pendingIoAction) {
      return;
    }

    switch (pendingIoAction.type) {
      case "copy-html":
        void ioRuntimeState.handleCopyHtml();
        break;
      case "copy-json":
        void ioRuntimeState.handleCopyJson();
        break;
      case "copy-md":
        void ioRuntimeState.handleCopyMd();
        break;
      case "copy-share-link":
        if (remoteShareEnabled) {
          void ioRuntimeState.handleCopyShareLink();
        }
        break;
      case "copy-yaml":
        void ioRuntimeState.handleCopyYaml();
        break;
      case "load-file":
        ioRuntimeState.handleLoad();
        break;
      case "open-share-dialog":
        if (remoteShareEnabled) {
          void ioRuntimeState.prepareShareLink().finally(() => setShareDialogOpen(true));
        }
        break;
      case "print":
        ioRuntimeState.handlePrint();
        break;
      case "save-adoc":
        void ioRuntimeState.handleSaveAdoc();
        break;
      case "save-docsy":
        void ioRuntimeState.handleSaveDocsy();
        break;
      case "save-html":
        void ioRuntimeState.handleSaveHtml();
        break;
      case "save-json":
        void ioRuntimeState.handleSaveJson();
        break;
      case "save-md":
        void ioRuntimeState.handleSaveMd();
        break;
      case "save-pdf":
        void ioRuntimeState.handleSavePdf();
        break;
      case "save-rst":
        void ioRuntimeState.handleSaveRst();
        break;
      case "save-tex":
        void ioRuntimeState.handleSaveTex();
        break;
      case "save-typst":
        void ioRuntimeState.handleSaveTypst();
        break;
      case "save-yaml":
        void ioRuntimeState.handleSaveYaml();
        break;
      default:
        break;
    }

    setPendingIoAction(null);
  }, [ioRuntimeState, pendingIoAction, remoteShareEnabled]);

  const resolveActiveWorkspaceMarkdown = useCallback(async () => {
    if (activeDoc.mode === "json" || activeDoc.mode === "yaml") {
      return activeDoc.content;
    }

    return getFreshRenderableMarkdown();
  }, [activeDoc.content, activeDoc.mode, getFreshRenderableMarkdown]);

  const executeWorkspaceAction = useCallback(async (action: PendingWorkspaceAction) => {
    if (!remoteWorkspaceEnabled) {
      return;
    }

    const runtime = workspaceRuntimeState;

    if (!runtime) {
      return;
    }

    switch (action.type) {
      case "open-connection-dialog":
        setWorkspaceConnectionOpen(true);
        return;
      case "open-export-dialog":
        if (!runtime.connected) {
          setWorkspaceConnectionOpen(true);
          return;
        }

        if (activeDoc.mode === "json" || activeDoc.mode === "yaml" || activeDoc.workspaceBinding) {
          toast.error(t("hooks.workspace.exportUnavailable"));
          return;
        }

        setWorkspaceExportOpen(true);
        return;
      case "open-import-dialog":
        if (!runtime.connected) {
          setWorkspaceConnectionOpen(true);
          return;
        }

        setWorkspaceImportOpen(true);
        return;
      case "save-bound-document": {
        if (!activeDoc.workspaceBinding) {
          return;
        }

        const result = await runtime.syncDocument(activeDoc, {
          markdown: await resolveActiveWorkspaceMarkdown(),
        });

        if (!result) {
          return;
        }

        if (result.warnings.length > 0) {
          toast.warning(result.warnings[0]);
          return;
        }

        toast.success(t("hooks.workspace.saveSuccess"));
        return;
      }
      case "connect-workspace": {
        const returnTo = typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : "/editor";
        await runtime.openGoogleConnect(returnTo);
        return;
      }
      case "disconnect-workspace":
        await runtime.disconnect();
        toast.success(t("hooks.workspace.disconnected"));
        return;
      case "import-workspace-file": {
        const result = await runtime.importFile({ fileId: action.fileId });
        createDocument(resolveImportedDocumentOptions({
          activeDocId,
          documents,
          importedDocument: result.document,
        }));
        setWorkspaceImportOpen(false);
        toast.success(t("hooks.workspace.importSuccess", {
          name: result.document.name || "Google document",
        }));
        return;
      }
      case "export-workspace-document": {
        const result = await runtime.exportDocument(activeDoc, {
          markdown: await resolveActiveWorkspaceMarkdown(),
          title: action.title,
        });
        setWorkspaceExportOpen(false);
        if (result.warnings.length > 0) {
          toast.warning(result.warnings[0]);
          return;
        }
        toast.success(t("hooks.workspace.exportSuccess", {
          name: action.title.trim() || activeDoc.name || t("common.untitled"),
        }));
        return;
      }
      case "refresh-workspace-document":
        await runtime.refreshDocument(action.documentId);
        toast.success(t("hooks.workspace.refreshSuccess"));
        return;
      case "rescan-workspace-changes": {
        const result = await runtime.rescan();
        if (result.changes.length === 0) {
          toast.info(t("hooks.workspace.rescanNone"));
          return;
        }
        toast.warning(t("hooks.workspace.rescanDetected", {
          count: result.changes.length,
          suffix: result.changes.length === 1 ? "" : "s",
        }));
        return;
      }
      default:
        return;
    }
  }, [activeDoc, activeDocId, createDocument, documents, remoteWorkspaceEnabled, resolveActiveWorkspaceMarkdown, t, workspaceRuntimeState]);

  useEffect(() => {
    if (!workspaceRuntimeState || !pendingWorkspaceAction) {
      return;
    }

    void executeWorkspaceAction(pendingWorkspaceAction)
      .catch((error) => {
        const message = error instanceof Error ? error.message : t("hooks.workspace.saveFailed");
        toast.error(message);
      })
      .finally(() => {
        setPendingWorkspaceAction(null);
      });
  }, [executeWorkspaceAction, pendingWorkspaceAction, t, workspaceRuntimeState]);
  const workspaceErrorMessage = useMemo(() => {
    if (!(workspaceRuntimeState?.authError instanceof Error)) {
      return null;
    }

    if (workspaceRuntimeState.authError.message.includes("Workspace API is not reachable")) {
      return t("hooks.workspace.apiUnreachable", {
        target: workspaceRuntimeState.connectivityDiagnostic?.target || "/api",
      });
    }

    return workspaceRuntimeState.authError.message;
  }, [t, workspaceRuntimeState]);
  const workspaceExportErrorMessage = remoteWorkspaceEnabled && workspaceRuntimeState?.exportError instanceof Error ? workspaceRuntimeState.exportError.message : null;
  const workspaceImportErrorMessage = remoteWorkspaceEnabled && workspaceRuntimeState?.filesError instanceof Error ? workspaceRuntimeState.filesError.message : null;
  const workspaceChangesErrorMessage = remoteWorkspaceEnabled && workspaceRuntimeState?.changesError instanceof Error ? workspaceRuntimeState.changesError.message : null;
  const workspaceExportEnabled = remoteWorkspaceEnabled && activeDoc.mode !== "json" && activeDoc.mode !== "yaml" && !activeDoc.workspaceBinding;
  const handleOpenWorkspaceConnection = useCallback(() => {
    if (!remoteWorkspaceEnabled) {
      return;
    }

    setWorkspaceRuntimeEnabled(true);
    setWorkspaceConnectionOpen(true);
  }, [remoteWorkspaceEnabled]);
  const handleOpenWorkspaceExport = useCallback(() => {
    if (!remoteWorkspaceEnabled) {
      return;
    }

    if (!workspaceRuntimeState) {
      ensureWorkspaceRuntime({ type: "open-export-dialog" });
      return;
    }

    void executeWorkspaceAction({ type: "open-export-dialog" });
  }, [ensureWorkspaceRuntime, executeWorkspaceAction, remoteWorkspaceEnabled, workspaceRuntimeState]);
  const handleOpenWorkspaceImport = useCallback(() => {
    if (!remoteWorkspaceEnabled) {
      return;
    }

    if (!workspaceRuntimeState) {
      ensureWorkspaceRuntime({ type: "open-import-dialog" });
      return;
    }

    void executeWorkspaceAction({ type: "open-import-dialog" });
  }, [ensureWorkspaceRuntime, executeWorkspaceAction, remoteWorkspaceEnabled, workspaceRuntimeState]);
  const handleConnectWorkspace = useCallback(() => {
    if (!remoteWorkspaceEnabled) {
      return;
    }

    if (!workspaceRuntimeState) {
      ensureWorkspaceRuntime({ type: "connect-workspace" });
      return;
    }

    void executeWorkspaceAction({ type: "connect-workspace" }).catch((error) => {
      const message = error instanceof Error ? error.message : t("hooks.workspace.authStartFailed");
      toast.error(message);
    });
  }, [ensureWorkspaceRuntime, executeWorkspaceAction, remoteWorkspaceEnabled, t, workspaceRuntimeState]);
  const handleDisconnectWorkspace = useCallback(() => {
    if (!remoteWorkspaceEnabled) {
      return;
    }

    if (!workspaceRuntimeState) {
      ensureWorkspaceRuntime({ type: "disconnect-workspace" });
      return;
    }

    void executeWorkspaceAction({ type: "disconnect-workspace" }).catch((error) => {
      const message = error instanceof Error ? error.message : t("hooks.workspace.disconnectFailed");
      toast.error(message);
    });
  }, [ensureWorkspaceRuntime, executeWorkspaceAction, remoteWorkspaceEnabled, t, workspaceRuntimeState]);
  const importWorkspaceDocumentById = useCallback(async (fileId: string) => {
    if (!remoteWorkspaceEnabled) {
      return null;
    }

    if (!workspaceRuntimeState) {
      ensureWorkspaceRuntime({ fileId, type: "import-workspace-file" });
      return null;
    }

    await executeWorkspaceAction({ fileId, type: "import-workspace-file" });
    return null;
  }, [ensureWorkspaceRuntime, executeWorkspaceAction, remoteWorkspaceEnabled, workspaceRuntimeState]);
  const handleImportWorkspaceFile = useCallback((fileId: string) => {
    void importWorkspaceDocumentById(fileId).catch((error) => {
      const message = error instanceof Error ? error.message : t("hooks.workspace.importFailed");
      toast.error(message);
    });
  }, [importWorkspaceDocumentById, t]);
  const handleExportWorkspaceDocument = useCallback((title: string) => {
    if (!remoteWorkspaceEnabled) {
      return;
    }

    if (!workspaceRuntimeState) {
      ensureWorkspaceRuntime({ title, type: "export-workspace-document" });
      return;
    }

    void executeWorkspaceAction({ title, type: "export-workspace-document" })
      .catch((error) => {
        const message = error instanceof Error ? error.message : t("hooks.workspace.exportFailed");
        toast.error(message);
      });
  }, [ensureWorkspaceRuntime, executeWorkspaceAction, remoteWorkspaceEnabled, t, workspaceRuntimeState]);
  const handleSaveWorkspaceDocument = useCallback(() => {
    if (!remoteWorkspaceEnabled) {
      return;
    }

    if (!activeDoc.workspaceBinding) {
      return;
    }

    if (!workspaceRuntimeState) {
      ensureWorkspaceRuntime({ type: "save-bound-document" });
      return;
    }

    void executeWorkspaceAction({ type: "save-bound-document" })
      .catch((error) => {
        const message = error instanceof Error ? error.message : t("hooks.workspace.saveFailed");
        toast.error(message);
      });
  }, [activeDoc.workspaceBinding, ensureWorkspaceRuntime, executeWorkspaceAction, remoteWorkspaceEnabled, t, workspaceRuntimeState]);
  const handleRescanWorkspaceChanges = useCallback(() => {
    if (!remoteWorkspaceEnabled) {
      return;
    }

    if (!workspaceRuntimeState) {
      ensureWorkspaceRuntime({ type: "rescan-workspace-changes" });
      return;
    }

    void executeWorkspaceAction({ type: "rescan-workspace-changes" })
      .catch((error) => {
        const message = error instanceof Error ? error.message : t("hooks.workspace.rescanFailed");
        toast.error(message);
      });
  }, [ensureWorkspaceRuntime, executeWorkspaceAction, remoteWorkspaceEnabled, t, workspaceRuntimeState]);
  const handleRefreshWorkspaceDocument = useCallback((documentId: string) => {
    if (!remoteWorkspaceEnabled) {
      return;
    }

    if (!workspaceRuntimeState) {
      ensureWorkspaceRuntime({ documentId, type: "refresh-workspace-document" });
      return;
    }

    void executeWorkspaceAction({ documentId, type: "refresh-workspace-document" })
      .catch((error) => {
        const message = error instanceof Error ? error.message : t("hooks.workspace.refreshFailed");
        toast.error(message);
      });
  }, [ensureWorkspaceRuntime, executeWorkspaceAction, remoteWorkspaceEnabled, t, workspaceRuntimeState]);

  useEffect(() => {
    if (activeDoc.mode === "json" || activeDoc.mode === "yaml") {
      setActiveEditor(null);
      return;
    }

    setPlainTextSearchAdapter(null);
  }, [activeDoc.mode]);

  useEffect(() => {
    const e2eWindow = window as Window & {
      __docsyE2E?: {
        hasFontSizeCommand: () => boolean;
        openPatchReview: (nextPatchSet: DocumentPatchSet) => boolean;
        selectText: (value: string) => boolean;
      };
    };

    if (!isE2E) {
      delete e2eWindow.__docsyE2E;
      return;
    }

    e2eWindow.__docsyE2E = {
      hasFontSizeCommand: () =>
        Boolean(activeEditor && typeof activeEditor.commands.setFontSize === "function"),
      openPatchReview: (nextPatchSet) => {
        if (!nextPatchSet) {
          return false;
        }

        loadPatchSet(nextPatchSet);
        return true;
      },
      selectText: (value: string) => {
        if (!activeEditor || !value) {
          return false;
        }

        let editorDom: HTMLElement;
        try {
          editorDom = activeEditor.view.dom;
        } catch {
          return false;
        }

        const walker = document.createTreeWalker(editorDom, NodeFilter.SHOW_TEXT);
        let textNode: Node | null = null;

        while (walker.nextNode()) {
          if (walker.currentNode.textContent?.includes(value)) {
            textNode = walker.currentNode;
            break;
          }
        }

        if (!textNode) {
          return false;
        }

        const text = textNode.textContent ?? "";
        const start = text.indexOf(value);
        if (start < 0) {
          return false;
        }

        const from = activeEditor.view.posAtDOM(textNode, start);
        const to = activeEditor.view.posAtDOM(textNode, start + value.length);
        activeEditor.commands.setTextSelection({ from, to });
        return true;
      },
    };

    return () => {
      delete e2eWindow.__docsyE2E;
    };
  }, [activeEditor, isE2E, loadPatchSet]);

  useEffect(() => {
    if (!documentSupportRuntimeState || !pendingDocumentSupportIntent) {
      return;
    }

    if (pendingDocumentSupportIntent.type === "open-patch-review") {
      documentSupportRuntimeState.openPatchReview();
    } else if (pendingDocumentSupportIntent.type === "auto-apply-patch-set") {
      void documentSupportRuntimeState.autoApplyPatchSet(pendingDocumentSupportIntent.patchSet);
    } else {
      documentSupportRuntimeState.loadPatchSet(pendingDocumentSupportIntent.patchSet);
    }

    setPendingDocumentSupportIntent(null);
  }, [documentSupportRuntimeState, pendingDocumentSupportIntent]);

  useEffect(() => {
    if (!llmFeaturesEnabled) {
      setPendingAiIntent(null);
      return;
    }

    if (!aiRuntimeState || !pendingAiIntent) {
      return;
    }

    if (
      aiIntentRequiresRichTextReadiness(pendingAiIntent)
      && (!activeEditor || currentRenderableMarkdown.trim().length === 0)
    ) {
      return;
    }

    void runAiIntent(pendingAiIntent);
    setPendingAiIntent(null);
  }, [activeEditor, aiRuntimeState, currentRenderableMarkdown, llmFeaturesEnabled, pendingAiIntent, runAiIntent]);

  useEffect(() => {
    if (!remoteWorkspaceEnabled || !workspaceErrorMessage) {
      return;
    }

    toast.error(workspaceErrorMessage, {
      id: "workspace-auth-startup-error",
    });
  }, [remoteWorkspaceEnabled, workspaceErrorMessage]);

  const resolveWorkspaceAuthErrorMessage = useCallback((authError: string) => {
    switch (authError) {
      case "oauth_callback_failed":
        return t("hooks.workspace.authErrors.oauth_callback_failed");
      case "workspace_auth_expired":
        return t("hooks.workspace.authErrors.workspace_auth_expired");
      case "workspace_auth_forbidden":
        return t("hooks.workspace.authErrors.workspace_auth_forbidden");
      case "workspace_provider_error":
        return t("hooks.workspace.authErrors.workspace_provider_error");
      default:
        return authError;
    }
  }, [t]);

  useEffect(() => {
    if (!remoteWorkspaceEnabled) {
      if (searchParams.get("workspaceAuth") || searchParams.get("workspaceAuthError")) {
        clearWorkspaceAuthParams();
      }
      return;
    }

    const authResult = searchParams.get("workspaceAuth");
    const authError = searchParams.get("workspaceAuthError");
    const authMarker = authResult
      ? `result:${authResult}`
      : authError
        ? `error:${authError}`
        : null;

    if (!authMarker) {
      pendingWorkspaceAuthRedirectRef.current = null;
      return;
    }

    if (!workspaceRuntimeState) {
      setWorkspaceRuntimeEnabled(true);
      return;
    }

    if (pendingWorkspaceAuthRedirectRef.current === authMarker) {
      return;
    }

    pendingWorkspaceAuthRedirectRef.current = authMarker;
    let cancelled = false;

    const finalizeWorkspaceAuthRedirect = async () => {
      try {
        if (authResult === "connected") {
          const refetchResult = await workspaceRuntimeState.refetchAuth();

          if (cancelled) {
            return;
          }

          if (refetchResult.data?.connected) {
            toast.success(t("hooks.workspace.connected"));
          } else {
            toast.error(t("hooks.workspace.authErrors.oauth_callback_failed"));
            setWorkspaceConnectionOpen(true);
          }
        } else if (authError) {
          toast.error(resolveWorkspaceAuthErrorMessage(authError));
          setWorkspaceConnectionOpen(true);
        }
      } catch {
        if (cancelled) {
          return;
        }

        toast.error(t("hooks.workspace.authErrors.oauth_callback_failed"));
        setWorkspaceConnectionOpen(true);
      } finally {
        if (!cancelled) {
          clearWorkspaceAuthParams();
          pendingWorkspaceAuthRedirectRef.current = null;
        }
      }
    };

    void finalizeWorkspaceAuthRedirect();

    return () => {
      cancelled = true;
    };
  }, [clearWorkspaceAuthParams, remoteWorkspaceEnabled, resolveWorkspaceAuthErrorMessage, searchParams, t, workspaceRuntimeState]);

  useEffect(() => {
    if ((workspaceRuntimeState || !remoteWorkspaceEnabled) && !workspaceConnected && workspaceImportOpen) {
      setWorkspaceImportOpen(false);
    }
  }, [remoteWorkspaceEnabled, workspaceConnected, workspaceImportOpen, workspaceRuntimeState]);

  useEffect(() => {
    if ((workspaceRuntimeState || !remoteWorkspaceEnabled) && !workspaceConnected && workspaceExportOpen) {
      setWorkspaceExportOpen(false);
    }
  }, [remoteWorkspaceEnabled, workspaceConnected, workspaceExportOpen, workspaceRuntimeState]);

  useEffect(() => {
    if (!workspaceImportOpen && workspaceFileQuery) {
      setWorkspaceFileQuery("");
    }
  }, [setWorkspaceFileQuery, workspaceFileQuery, workspaceImportOpen]);

  useEffect(() => {
    if (!remoteWorkspaceEnabled || !workspaceChangesErrorMessage) {
      return;
    }

    toast.error(workspaceChangesErrorMessage);
  }, [remoteWorkspaceEnabled, workspaceChangesErrorMessage]);

  useEffect(() => {
    if (searchParams.get("knowledgeAction") !== "suggest-updates") {
      return;
    }

    if (!llmFeaturesEnabled) {
      clearKnowledgeActionParams();
      return;
    }

    const sourceDocumentId = searchParams.get("source");
    const targetDocumentId = searchParams.get("target");
    const rawContext = searchParams.get("context");
    const rawIssueKind = searchParams.get("issueKind");
    const rawIssuePriority = searchParams.get("issuePriority");

    if (!sourceDocumentId || !targetDocumentId) {
      clearKnowledgeActionParams();
      return;
    }

    const nextContext: KnowledgeSuggestionContext | undefined = rawContext === "consistency"
      ? {
        issueId: searchParams.get("issueId") || undefined,
        issueKind: isKnowledgeIssueKind(rawIssueKind)
          ? rawIssueKind
          : undefined,
        issuePriority: isKnowledgeIssuePriority(rawIssuePriority)
          ? rawIssuePriority
          : undefined,
        issueReason: searchParams.get("issueReason") || undefined,
        queueContext: "consistency",
      }
      : rawContext === "change"
        ? { queueContext: "change" }
        : rawContext === "impact"
          ? { queueContext: "impact" }
      : undefined;

    queueKnowledgeSuggestion({
      context: nextContext,
      openPatchReviewAfter: true,
      sourceDocumentId,
      targetDocumentId,
    });

    clearKnowledgeActionParams();
  }, [clearKnowledgeActionParams, llmFeaturesEnabled, queueKnowledgeSuggestion, searchParams]);

  const handleFileNameChange = useCallback((name: string) => {
    updateActiveDoc({ name });
  }, [updateActiveDoc]);

  const handleTiptapChange = useCallback((tiptapJson: JSONContent | null) => {
    if (!tiptapJson) {
      return;
    }

    const documentId = activeDoc.id;
    const syncDelay = getDeferredEditorSyncDelay(documentPerformanceProfile.kind);

    startTransition(() => {
      updateActiveDoc({
        storageKind: "docsy",
        tiptapJson,
      });
    });

    astSyncRunnerRef.current.schedule(() => {
      if (currentActiveDocIdRef.current !== documentId) {
        return;
      }

      try {
        const ast = serializeTiptapToAst(tiptapJson, {
          documentNodeId: `doc-${documentId}`,
          throwOnUnsupported: false,
        });

        startTransition(() => {
          if (currentActiveDocIdRef.current !== documentId) {
            return;
          }

          updateActiveDoc({
            ast,
            storageKind: "docsy",
          });
        });
      } catch (error) {
        void error;
      }
    }, syncDelay);
  }, [activeDoc.id, documentPerformanceProfile.kind, updateActiveDoc]);
  const handleModeChangeWithCapabilities = useCallback((mode: EditorMode) => {
    if (!isModeAllowedInCapabilities(mode, effectiveCapabilities)) {
      return;
    }

    handleModeChange(mode);
  }, [effectiveCapabilities, handleModeChange]);

  const handleNewDoc = useCallback((mode: EditorMode = "markdown") => {
    if (!isModeAllowedInCapabilities(mode, effectiveCapabilities)) {
      return;
    }

    if (mode === "json" || mode === "yaml") {
      enableStructuredModes();
    }

    createDocument({ mode });
  }, [createDocument, effectiveCapabilities, enableStructuredModes]);
  const handleDeleteDoc = useCallback((id: string) => {
    deleteDocument(id);
    void removeDocumentVersionHistory(id);
  }, [deleteDocument]);

  const handleRequestResetDocuments = useCallback(() => {
    if (resetDocumentsDisabled) {
      toast.info(t("resetDocuments.busy"));
      return;
    }

    setResetDocumentsDialogOpen(true);
  }, [resetDocumentsDisabled, t]);

  const handleResetDocuments = useCallback(async () => {
    if (resetDocumentsDisabled) {
      toast.info(t("resetDocuments.busy"));
      return;
    }

    setIsResettingDocuments(true);

    try {
      await resetLocalDocumentState();
      resetDocuments();
      closeFindReplace();
      closePreview();
      setPendingAiIntent(null);
      setPendingImpactSuggestions([]);
      setSuggestionQueue([]);
      setPendingLatexSourceLine(null);
      setShareDialogOpen(false);
      setWorkspaceExportOpen(false);
      setWorkspaceImportOpen(false);
      setDocumentResetVersion((version) => version + 1);
      setResetDocumentsDialogOpen(false);
      toast.dismiss(RESTORED_SESSION_TOAST_ID);
      toast.success(t("resetDocuments.done"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("resetDocuments.failed"));
    } finally {
      setIsResettingDocuments(false);
    }
  }, [closeFindReplace, closePreview, resetDocuments, resetDocumentsDisabled, t]);

  const handleTemplateSelect = useCallback((template: DocumentTemplate) => {
    const fallbackContent = getSharedTemplateFallbackContent(template.mode, locale);
    const selectedContent = template.content.trim().length > 0 || template.id === "blank-markdown"
      ? template.content
      : fallbackContent;

    if (
      !isModeAllowedInCapabilities(template.mode, effectiveCapabilities)
      || (!canAccessDocumentTools && templateRequiresDocumentFeatures(template.mode, selectedContent))
      || (!canAccessAdvancedBlocks && templateRequiresAdvancedBlocks(template.mode, selectedContent))
    ) {
      return;
    }

    if (templateRequiresDocumentFeatures(template.mode, selectedContent)) {
      enableDocumentFeatures();
    }

    if (templateRequiresAdvancedBlocks(template.mode, selectedContent)) {
      enableAdvancedBlocks();
    }

    createDocument({
      content: selectedContent,
      mode: template.mode,
      name: template.name,
      sourceSnapshots: {
        [template.mode]: selectedContent,
      },
      storageKind: "docsy",
      tiptapJson: null,
    });
    toast.success(t("toasts.templateApplied"));
  }, [createDocument, effectiveCapabilities, enableAdvancedBlocks, enableDocumentFeatures, locale, t]);

  useEffect(() => {
    if (activeDocumentCompatibility.isCompatible) {
      return;
    }

    setActiveEditor(null);
    setPlainTextSearchAdapter(null);
  }, [activeDocumentCompatibility.isCompatible]);

  useEffect(() => {
    if (unexpectedReloadState?.kind === "lost") {
      toast.dismiss(RESTORED_SESSION_TOAST_ID);
      toast.dismiss(UNEXPECTED_RELOAD_RECOVERED_TOAST_ID);
      showUnexpectedReloadLostToast({ t });
      return;
    }

    if (unexpectedReloadState?.kind === "recovered" && hasRestoredDocuments) {
      toast.dismiss(RESTORED_SESSION_TOAST_ID);
      toast.dismiss(UNEXPECTED_RELOAD_LOST_TOAST_ID);
      showUnexpectedReloadRecoveredToast({
        buildChanged: unexpectedReloadState.buildChanged,
        disabled: resetDocumentsDisabled,
        navigationType: unexpectedReloadState.navigationType,
        onStartFresh: () => {
          setResetDocumentsDialogOpen(true);
        },
        t,
      });
      return;
    }

    if (!hasRestoredDocuments) {
      toast.dismiss(RESTORED_SESSION_TOAST_ID);
      toast.dismiss(UNEXPECTED_RELOAD_LOST_TOAST_ID);
      toast.dismiss(UNEXPECTED_RELOAD_RECOVERED_TOAST_ID);
      return;
    }

    showRestoredSessionToast({
      disabled: resetDocumentsDisabled,
      onStartFresh: () => {
        setResetDocumentsDialogOpen(true);
      },
      t,
    });

    return () => {
      toast.dismiss(RESTORED_SESSION_TOAST_ID);
      toast.dismiss(UNEXPECTED_RELOAD_LOST_TOAST_ID);
      toast.dismiss(UNEXPECTED_RELOAD_RECOVERED_TOAST_ID);
    };
  }, [hasRestoredDocuments, resetDocumentsDisabled, t, unexpectedReloadState]);

  useEffect(() => {
    if (autoSaveState.status !== "saved" || !autoSaveState.lastSavedAt) {
      return;
    }

    if (lastCapturedAutoSaveAtRef.current === autoSaveState.lastSavedAt) {
      return;
    }

    lastCapturedAutoSaveAtRef.current = autoSaveState.lastSavedAt;
    void captureAutoSaveVersionSnapshot(activeDoc, locale);
  }, [activeDoc, autoSaveState.lastSavedAt, autoSaveState.status, locale]);

  useEffect(() => {
    const nextPendingSuggestion = pendingImpactSuggestions[0];

    if (!nextPendingSuggestion) {
      return;
    }

    if (activeDoc.id !== nextPendingSuggestion.sourceDocumentId) {
      selectDocument(nextPendingSuggestion.sourceDocumentId);
      return;
    }

    if (activeDoc.mode === "json" || activeDoc.mode === "yaml") {
      toast.error("Impact suggestions currently require a rich-text source document.");
      setPendingImpactSuggestions((current) => current.slice(1));
      return;
    }

    requestAiIntent({
      context: nextPendingSuggestion.context,
      openPatchReviewAfter: nextPendingSuggestion.openPatchReviewAfter,
      queueEntryId: nextPendingSuggestion.queueEntryId,
      targetDocumentId: nextPendingSuggestion.targetDocumentId,
      type: "suggest-updates",
    });
    setPendingImpactSuggestions((current) => current.slice(1));
  }, [activeDoc.id, activeDoc.mode, pendingImpactSuggestions, requestAiIntent, selectDocument]);

  useEffect(() => {
    const nextSourceSnapshots = activeDoc.mode === "json" || activeDoc.mode === "yaml"
      ? {
        ...(activeDoc.sourceSnapshots || {}),
        [activeDoc.mode]: activeDoc.content,
      }
      : {
        ...(activeDoc.sourceSnapshots || {}),
        html: currentRenderableHtml,
        latex: currentRenderableLatex,
        markdown: currentRenderableMarkdown,
        [activeDoc.mode]: activeDoc.content,
      };

    if (activeDoc.storageKind === "docsy" && areSourceSnapshotsEqual(activeDoc.sourceSnapshots, nextSourceSnapshots)) {
      return;
    }

    const documentId = activeDoc.id;

    sourceSnapshotSyncRunnerRef.current.schedule(() => {
      if (currentActiveDocIdRef.current !== documentId) {
        return;
      }

      startTransition(() => {
        if (currentActiveDocIdRef.current !== documentId) {
          return;
        }

        updateActiveDoc({
          sourceSnapshots: nextSourceSnapshots,
          storageKind: "docsy",
        });
      });
    }, getDeferredEditorSyncDelay(documentPerformanceProfile.kind));

    return () => {
      sourceSnapshotSyncRunnerRef.current.cancel();
    };
  }, [
    activeDoc.id,
    activeDoc.content,
    activeDoc.mode,
    activeDoc.sourceSnapshots,
    activeDoc.storageKind,
    currentRenderableHtml,
    currentRenderableLatex,
    currentRenderableMarkdown,
    documentPerformanceProfile.kind,
    updateActiveDoc,
  ]);

  useEffect(() => {
    const target = getPendingEditorFocusTarget();

    if (!target || target.documentId !== activeDoc.id) {
      return;
    }

    if (target.kind !== "section" && target.kind !== "image") {
      clearPendingEditorFocusTarget();
      return;
    }

    let attempts = 0;
    let timer: number | null = null;

    const tryScroll = () => {
      attempts += 1;

      if (scrollToEditorFocusTarget(target, activeDoc.ast) || attempts >= 12) {
        clearPendingEditorFocusTarget();
        return;
      }

      timer = window.setTimeout(tryScroll, 160);
    };

    timer = window.setTimeout(tryScroll, 80);

    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [activeDoc.ast, activeDoc.id, activeDoc.mode, activeEditor, currentRenderableHtml, editorKey]);
  const activeDocumentCompatibilityDescriptionKey = activeDocumentCompatibility.reason === "structuredMode"
    ? "editorGuard.descriptionStructured"
    : activeDocumentCompatibility.reason === "advancedBlocks"
      ? "editorGuard.descriptionAdvancedBlocks"
      : "editorGuard.descriptionDocumentTools";

  const renderEditor = useCallback(() => {
    if (!activeDocumentCompatibility.isCompatible) {
      return (
        <div className="flex h-full items-center justify-center p-6">
          <div
            className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-sm"
            data-testid="editor-profile-guard"
          >
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">{t("editorGuard.title")}</h2>
              <p className="text-sm text-muted-foreground">
                {t(activeDocumentCompatibilityDescriptionKey)}
              </p>
            </div>
            <div className="mt-4">
              <Button onClick={() => handleUserProfileChange("advanced")} type="button">
                {t("editorGuard.action")}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (activeDoc.mode === "markdown") {
      return (
        <Suspense fallback={<EditorFallback />}>
          <MarkdownEditor
            advancedBlocksEnabled={advancedBlocksEnabled}
            canEnableAdvancedBlocks={canEnableAdvancedBlocks}
            canEnableDocumentFeatures={canEnableDocumentFeatures}
            documentFeaturesEnabled={documentFeaturesEnabled}
            key={`${activeDoc.id}:${editorKey}`}
            initialContent={richTextSeed.initialContent}
            initialTiptapDoc={richTextSeed.initialTiptapDoc}
            onContentChange={handleContentChange}
            onEnableAdvancedBlocks={enableAdvancedBlocks}
            onEnableDocumentFeatures={enableDocumentFeatures}
            onEditorReady={setActiveEditor}
            onHtmlChange={setLiveEditorHtml}
            seedRevision={richTextSeed.revision}
            onTiptapChange={handleTiptapChange}
          />
        </Suspense>
      );
    }

    if (activeDoc.mode === "latex") {
      return (
        <Suspense fallback={<EditorFallback />}>
          <LatexEditor
            advancedBlocksEnabled={advancedBlocksEnabled}
            canEnableAdvancedBlocks={canEnableAdvancedBlocks}
            canEnableDocumentFeatures={canEnableDocumentFeatures}
            documentFeaturesEnabled={documentFeaturesEnabled}
            initialHtmlOverride={richTextSeed.initialHtmlOverride}
            key={`${activeDoc.id}:${editorKey}`}
            initialContent={richTextSeed.initialContent}
            initialTiptapDoc={richTextSeed.initialTiptapDoc}
            onContentChange={handleContentChange}
            onEnableAdvancedBlocks={enableAdvancedBlocks}
            onEnableDocumentFeatures={enableDocumentFeatures}
            onEditorReady={setActiveEditor}
            onHtmlChange={setLiveEditorHtml}
            onSourceLineTargetApplied={() => setPendingLatexSourceLine(null)}
            seedRevision={richTextSeed.revision}
            onTiptapChange={handleTiptapChange}
            sourceLineTarget={pendingLatexSourceLine}
          />
        </Suspense>
      );
    }

    if (activeDoc.mode === "json" || activeDoc.mode === "yaml") {
      return (
        <Suspense fallback={<EditorFallback />}>
          <JsonYamlEditor
            key={`${activeDoc.id}:${editorKey}`}
            initialContent={activeDoc.content}
            mode={activeDoc.mode}
            onContentChange={handleContentChange}
            onModeChange={handleModeChangeWithCapabilities}
            onPlainTextSearchAdapterReady={setPlainTextSearchAdapter}
          />
        </Suspense>
      );
    }

    return (
      <Suspense fallback={<EditorFallback />}>
        <HtmlEditor
          advancedBlocksEnabled={advancedBlocksEnabled}
          canEnableAdvancedBlocks={canEnableAdvancedBlocks}
          canEnableDocumentFeatures={canEnableDocumentFeatures}
          documentFeaturesEnabled={documentFeaturesEnabled}
          key={`${activeDoc.id}:${editorKey}`}
          initialContent={richTextSeed.initialContent}
          initialTiptapDoc={richTextSeed.initialTiptapDoc}
          onContentChange={handleContentChange}
          onEnableAdvancedBlocks={enableAdvancedBlocks}
          onEnableDocumentFeatures={enableDocumentFeatures}
          onEditorReady={setActiveEditor}
          onHtmlChange={setLiveEditorHtml}
          seedRevision={richTextSeed.revision}
          onTiptapChange={handleTiptapChange}
        />
      </Suspense>
    );
  }, [activeDoc.id, activeDoc.mode, activeDocumentCompatibility.isCompatible, activeDocumentCompatibilityDescriptionKey, advancedBlocksEnabled, canEnableAdvancedBlocks, canEnableDocumentFeatures, documentFeaturesEnabled, editorKey, enableAdvancedBlocks, enableDocumentFeatures, handleContentChange, handleModeChangeWithCapabilities, handleTiptapChange, handleUserProfileChange, richTextSeed, setLiveEditorHtml, t]);
  const aiUnavailableMessage = useMemo(() => {
    if (workspaceRuntimeState?.apiHealth && !workspaceRuntimeState.apiHealth.configured) {
      return "Gemini가 연결되어 있지 않습니다.";
    }

    return aiRuntimeState?.liveAgent.latestStatus?.message || null;
  }, [aiRuntimeState?.liveAgent.latestStatus?.message, workspaceRuntimeState?.apiHealth]);
  void aiUnavailableMessage;

  const documentSupportRuntimeActive = canAccessPatchReview
    && (documentSupportRuntimeEnabled || (canAccessHistory && historyEnabled));
  const patchReviewDialogProps = {
    acceptedPatchCount,
    hasPendingWorkspaceSync: documentSupportRuntimeState?.hasPendingWorkspaceSync ?? false,
    onAccept: handleAcceptPatch,
    onAcceptSelected: handleAcceptPatches,
    onApply: applyReviewedPatches,
    onClear: clearPatchSet,
    onEdit: handleEditPatch,
    lastApplyReport,
    onLoadPatchSet: handleLoad,
    onOpenChange: (open: boolean) => {
      if (!open) {
        closePatchReview();
        return;
      }

      openPatchReview();
    },
    onRefreshLinkedDocument: remoteWorkspaceEnabled && activeDoc.workspaceBinding
      ? () => {
        clearPatchSet();
        handleRefreshWorkspaceDocument(activeDoc.id);
      }
      : undefined,
    onReject: handleRejectPatch,
    onRejectSelected: handleRejectPatches,
    onRetryWorkspaceSync: documentSupportRuntimeState?.retryWorkspaceSync,
    open: canAccessPatchReview ? patchReviewOpen : false,
    patchSet,
    workspaceLinked: remoteWorkspaceEnabled && activeDoc.workspaceBinding?.provider === "google_drive",
    workspaceSyncError: remoteWorkspaceEnabled ? activeDoc.workspaceBinding?.syncError : undefined,
    workspaceSyncPending: workspaceSyncing,
    workspaceSyncWarnings: remoteWorkspaceEnabled ? activeDoc.workspaceBinding?.syncWarnings : undefined,
  };
  const historySidebarProps = {
    activeDoc,
    onGenerateTocSuggestion: canAccessAiAssistant && llmFeaturesEnabled
      ? () => {
        requestAiIntent({ type: "generate-toc" });
      }
      : undefined,
    onRestoreVersionSnapshot: (snapshotId: string) => {
      void restoreVersionSnapshot(snapshotId);
    },
    versionHistoryReady,
    versionHistoryRestoring,
    versionHistorySnapshots,
    versionHistorySyncing,
  };
  const previewTexValidationProps = remoteTexServiceEnabled
    ? previewOpen
      && secondaryConversionsPending
      && documentPerformanceProfile.kind !== "normal"
      ? undefined
      : previewRuntimeState?.texValidationProps
    : undefined;
  const showRecoveryLoadingScreen = Boolean(isRecovering && documents.length === 0);
  const showRecoveryScreen = Boolean(recoveryFailure && documents.length === 0);

  if (showRecoveryLoadingScreen) {
    return (
      <div className="flex h-[100svh] items-center justify-center bg-background px-6">
        <div className="w-full max-w-xl rounded-2xl border border-border/60 bg-card p-8 text-center shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {t("recovery.loadingLabel")}
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-foreground">
            {t("recovery.loadingTitle")}
          </h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            {t("recovery.loadingDescription")}
          </p>
        </div>
      </div>
    );
  }

  if (showRecoveryScreen) {
    return (
      <>
        <div className="flex h-[100svh] items-center justify-center bg-background px-6 py-10">
        <div className="w-full max-w-2xl rounded-2xl border border-destructive/30 bg-card p-8 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-destructive">
            {t("recovery.failedLabel")}
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-foreground">
            {t("toasts.unexpectedReloadLost")}
          </h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            {t("recovery.failedDescription")}
          </p>
          <div className="mt-5 rounded-xl border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground">
              <div>{t("recovery.hintsLabel")}: {recoveryFailure.hadRecoveryHints ? "yes" : "no"}</div>
              <div>{t("recovery.sourceLabel")}: {recoveryFailure.source}</div>
              <div>{t("recovery.candidateCount")}: {recoveryFailure.candidateCount}</div>
              <div>{t("recovery.navigationLabel")}: {unexpectedReloadState?.navigationType || "unknown"}</div>
          </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  setResetDocumentsDialogOpen(true);
                }}
              >
                {t("resetDocuments.action")}
              </Button>
              <Button
                onClick={() => {
                  handleNewDoc();
                }}
                variant="outline"
              >
                {t("newDocument")}
              </Button>
            </div>
          </div>
        </div>
        <ResetDocumentsDialog
          isSubmitting={isResettingDocuments}
          onConfirm={() => {
            void handleResetDocuments();
          }}
          onOpenChange={setResetDocumentsDialogOpen}
          open={resetDocumentsDialogOpen}
        />
      </>
    );
  }

  return (
    <>
      {documentSupportRuntimeActive && (
        <Suspense fallback={null}>
          <DocumentSupportRuntime
            activeDoc={activeDoc}
            activeEditor={activeEditor}
            bumpEditorKey={bumpEditorKey}
            historyEnabled={canAccessHistory && historyEnabled}
            onStateChange={setDocumentSupportRuntimeState}
            onVersionSnapshot={(document, metadata) => recordVersionSnapshot(document, "patch_apply", metadata)}
            onWorkspaceSync={syncDocument}
            setLiveEditorHtml={setLiveEditorHtml}
            updateActiveDoc={updateActiveDoc}
          />
        </Suspense>
      )}
      {previewOpen && (
        <Suspense fallback={null}>
          <PreviewRuntime
            activeDoc={activeDoc}
            currentRenderableLatexDocument={currentRenderableLatexDocument}
            onJumpToLatexLine={setPendingLatexSourceLine}
            onLoadPatchSet={loadPatchSet}
            onStateChange={setPreviewRuntimeState}
            onVersionSnapshot={(document, metadata) => recordVersionSnapshot(document, "export", metadata)}
          />
        </Suspense>
      )}
      {ioRuntimeEnabled && (
        <Suspense fallback={null}>
          <DocumentIORuntime
            activeDoc={activeDoc}
            createDocument={createDocument}
            documents={documents}
            getRenderableLatexDocument={getFreshRenderableLatexDocument}
            getRenderableMarkdown={getFreshRenderableMarkdown}
            onPatchSetLoad={loadPatchSet}
            onStateChange={setIoRuntimeState}
            onVersionSnapshot={(metadata) => recordVersionSnapshot(activeDoc, "export", metadata)}
            renderableEditorHtml={currentRenderableHtml}
            renderableLatexDocument={currentRenderableLatexDocument}
            renderableMarkdown={currentRenderableMarkdown}
          />
        </Suspense>
      )}
      <EditorWorkspace
        activeMode={activeDoc.mode}
        fileInputRef={fileInputRef}
        findReplaceProps={{
          editor: activeEditor,
          onClose: closeFindReplace,
          open: findReplaceOpen,
          plainTextAdapter: plainTextSearchAdapter,
        }}
        headerProps={{
          countWithSpaces,
          autoSaveState,
          fileName: activeDoc.name,
          importState,
          isDark,
          isFullscreen,
          loadFileTitle: t("header.loadFileHint", {
            size: `${Math.round(MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024))}MB`,
          }),
          availableModes,
          crossFamilyModes,
          mode: activeDoc.mode,
          onCreateDocument: handleNewDoc,
          onOpenAiAssistant: canAccessAiAssistant
            ? () => requestAiIntent({ type: "open" })
            : undefined,
          onRequestResetDocuments: handleRequestResetDocuments,
          onOpenStructuredModes: canAccessStructuredModes ? enableStructuredModes : undefined,
          onOpenWorkspaceConnection: remoteWorkspaceEnabled ? handleOpenWorkspaceConnection : undefined,
          onOpenWorkspaceExport: remoteWorkspaceEnabled ? handleOpenWorkspaceExport : undefined,
          onOpenWorkspaceImport: remoteWorkspaceEnabled ? handleOpenWorkspaceImport : undefined,
          onSaveWorkspaceDocument: remoteWorkspaceEnabled ? handleSaveWorkspaceDocument : undefined,
          onOpenShare: remoteShareEnabled ? handleOpenShare : undefined,
          onCopyHtml: handleCopyHtml,
          onCopyJson: handleCopyJson,
          onCopyMd: handleCopyMd,
          onCopyShareLink: remoteShareEnabled ? handleCopyShareLink : undefined,
          onCopyYaml: handleCopyYaml,
          onFileNameChange: handleFileNameChange,
          onLoad: handleLoad,
          onModeChange: handleModeChangeWithCapabilities,
          onOpenPatchReview: canAccessPatchReview ? openPatchReview : undefined,
          onOpenShortcuts: openShortcuts,
          onPrint: handlePrint,
          onUserProfileChange: handleUserProfileChange,
          patchCount,
          onSaveAdoc: handleSaveAdoc,
          onSaveDocsy: handleSaveDocsy,
          onSaveHtml: handleSaveHtml,
          onSaveJson: handleSaveJson,
          onSaveMd: handleSaveMd,
          onSavePdf: handleSavePdf,
          onSaveRst: handleSaveRst,
          onSaveTex: handleSaveTex,
          onSaveTypst: handleSaveTypst,
          onSaveYaml: handleSaveYaml,
          onToggleCountMode: toggleCountMode,
          onToggleFullscreen: toggleFullscreen,
          onTogglePreview: handleTogglePreview,
          onToggleTheme: toggleTheme,
          previewOpen,
          resetDocumentsDisabled,
          showStructuredModeAction: false,
          textStats,
          userProfile,
          workspaceBinding: remoteWorkspaceEnabled ? activeDoc.workspaceBinding : undefined,
          workspaceConnected,
          workspaceConnectionPending: workspaceConnecting || workspaceDisconnecting || workspaceAuthLoading,
          workspaceExportEnabled,
          workspaceExportPending: workspaceExporting,
          workspaceImportPending: workspaceImporting || workspaceFilesLoading,
          workspaceSyncPending: workspaceSyncing,
        }}
        onFileChange={handleFileChange}
        patchReviewDialogProps={patchReviewDialogProps}
        previewOpen={previewOpen}
        previewProps={{
          editorHtml: currentRenderableHtml,
          editorLatex: currentRenderableLatexDocument,
          editorMarkdown: currentRenderableMarkdown,
          editorMode: activeDoc.mode,
          fileName: activeDoc.name,
          onClose: closePreview,
          rawContent: activeDoc.content,
          texValidationProps: previewTexValidationProps,
        }}
        renderEditor={renderEditor}
        shortcutsModalProps={{ onOpenChange: setShortcutsOpen, open: shortcutsOpen }}
          sidebarProps={{
            activeDoc,
            activeDocId,
            capabilities: {
              canAccessHistory,
              canAccessKnowledge,
              canAccessStructuredModes,
            },
            createDocument,
            documents,
            historyEnabled,
            historyProps: historySidebarProps,
            knowledgeEnabled,
            knowledgePanelResetKey: documentResetVersion,
            knowledgeProps: {
              onDismissSuggestionQueueItem: handleDismissSuggestionQueueItem,
              onGenerateTocSuggestion: canAccessAiAssistant && llmFeaturesEnabled
                ? () => {
                  requestAiIntent({ type: "generate-toc" });
                }
                : undefined,
              onRefreshWorkspaceDocument: remoteWorkspaceEnabled ? handleRefreshWorkspaceDocument : undefined,
              onRescanWorkspaceSources: remoteWorkspaceEnabled ? handleRescanWorkspaceChanges : undefined,
              onOpenSuggestionQueueItem: handleOpenSuggestionQueueItem,
              onRetrySuggestionQueueItem: handleRetrySuggestionQueueItem,
              onSuggestKnowledgeImpactUpdate: llmFeaturesEnabled
                ? (
                  sourceDocumentId: string,
                  targetDocumentId: string,
                  context?: KnowledgeSuggestionContext,
                ) => {
                  queueKnowledgeSuggestion({ context, sourceDocumentId, targetDocumentId });
                }
                : undefined,
              onSuggestKnowledgeUpdates: llmFeaturesEnabled
                ? (documentId: string, context?: KnowledgeSuggestionContext) => {
                  queueKnowledgeSuggestion({
                    context,
                    sourceDocumentId: activeDoc.id,
                    targetDocumentId: documentId,
                  });
                }
                : undefined,
              suggestionQueue: suggestionQueueItems,
              workspaceChangedSources: remoteWorkspaceEnabled ? remoteChangedSources : [],
              workspaceLastRescannedAt: remoteWorkspaceEnabled ? workspaceLastRescannedAt : null,
              workspaceRescanning: remoteWorkspaceEnabled && (workspaceChangesRescanning || workspaceRefreshingDocument),
            },
            onDeleteDoc: handleDeleteDoc,
            onActivateHistory: () => {
              if (canAccessHistory) {
                setHistoryEnabled(true);
              }
            },
            onActivateKnowledge: () => {
              if (canAccessKnowledge) {
                setKnowledgeEnabled(true);
              }
            },
            onNewDoc: handleNewDoc,
            onOpenStructuredModes: canAccessStructuredModes ? enableStructuredModes : undefined,
            onOpenTemplates: canOpenTemplates ? openTemplateDialog : undefined,
            onRenameDoc: renameDocument,
            onSelectDoc: selectDocument,
            showStructuredCreateAction: canAccessStructuredModes && isWebProfile && !structuredModesVisible,
          }}
        tabsProps={{
          activeDocId,
          documents,
          onCloseDoc: closeDocument,
          onNewDoc: () => handleNewDoc(),
          onResetDocuments: handleRequestResetDocuments,
          onSelectDoc: selectDocument,
          resetDocumentsDisabled,
        }}
        templateDialogProps={{
          onOpenChange: setTemplateOpen,
          onSelect: handleTemplateSelect,
          open: templateOpen,
          templateFilter: (template) => {
            const templateContent = template.content.trim().length > 0 || template.id === "blank-markdown"
              ? template.content
              : getSharedTemplateFallbackContent(template.mode, locale);

            return isModeAllowedInCapabilities(template.mode, effectiveCapabilities)
              && (!templateRequiresDocumentFeatures(template.mode, templateContent) || canAccessDocumentTools)
              && (!templateRequiresAdvancedBlocks(template.mode, templateContent) || canAccessAdvancedBlocks);
          },
        }}
      />
      <ResetDocumentsDialog
        isSubmitting={isResettingDocuments}
        onConfirm={() => {
          void handleResetDocuments();
        }}
        onOpenChange={setResetDocumentsDialogOpen}
        open={resetDocumentsDialogOpen}
      />
    </>
  );
};

export default Index;
