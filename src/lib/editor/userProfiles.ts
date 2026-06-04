import {
  documentAstHasAdvancedContent,
  documentAstHasDocumentContent,
  htmlHasAdvancedContent,
  htmlHasDocumentContent,
  markdownHasAdvancedContent,
  markdownHasDocumentContent,
  tiptapDocumentHasAdvancedContent,
  tiptapDocumentHasDocumentContent,
} from "@/components/editor/editorAdvancedContent";
import type { AppProfile } from "@/lib/appProfile";
import type { DocumentData, EditorMode } from "@/types/document";

export type EditorUserProfile = "beginner" | "advanced";

export interface EditorUiCapabilities {
  canAccessAdvancedBlocks: boolean;
  canAccessAiAssistant: boolean;
  canAccessDocumentTools: boolean;
  canAccessHistory: boolean;
  canAccessKnowledge: boolean;
  canAccessPatchReview: boolean;
  canAccessStructuredModes: boolean;
}

export interface ActiveDocumentCompatibility {
  isCompatible: boolean;
  reason: "advancedBlocks" | "documentTools" | "structuredMode" | null;
}

const FULL_CAPABILITIES: EditorUiCapabilities = {
  canAccessAdvancedBlocks: true,
  canAccessAiAssistant: true,
  canAccessDocumentTools: true,
  canAccessHistory: true,
  canAccessKnowledge: true,
  canAccessPatchReview: true,
  canAccessStructuredModes: true,
};

export const getUserProfileCapabilities = (profile: EditorUserProfile): EditorUiCapabilities => {
  if (profile === "advanced") {
    return FULL_CAPABILITIES;
  }

  return {
    canAccessAdvancedBlocks: false,
    canAccessAiAssistant: false,
    canAccessDocumentTools: false,
    canAccessHistory: false,
    canAccessKnowledge: false,
    canAccessPatchReview: false,
    canAccessStructuredModes: false,
  };
};

export const getDeploymentUiCapabilities = (_profile: AppProfile): EditorUiCapabilities => ({
  ...FULL_CAPABILITIES,
  canAccessAiAssistant: false,
});

export const intersectEditorUiCapabilities = (
  left: EditorUiCapabilities,
  right: EditorUiCapabilities,
): EditorUiCapabilities => ({
  canAccessAdvancedBlocks: left.canAccessAdvancedBlocks && right.canAccessAdvancedBlocks,
  canAccessAiAssistant: left.canAccessAiAssistant && right.canAccessAiAssistant,
  canAccessDocumentTools: left.canAccessDocumentTools && right.canAccessDocumentTools,
  canAccessHistory: left.canAccessHistory && right.canAccessHistory,
  canAccessKnowledge: left.canAccessKnowledge && right.canAccessKnowledge,
  canAccessPatchReview: left.canAccessPatchReview && right.canAccessPatchReview,
  canAccessStructuredModes: left.canAccessStructuredModes && right.canAccessStructuredModes,
});

export const isModeAllowedInCapabilities = (
  mode: EditorMode,
  capabilities: Pick<EditorUiCapabilities, "canAccessStructuredModes">,
) => capabilities.canAccessStructuredModes || (mode !== "json" && mode !== "yaml");

const collectMarkdownSources = (document: DocumentData) =>
  [document.mode === "markdown" ? document.content : null, document.sourceSnapshots?.markdown ?? null]
    .filter((value): value is string => Boolean(value));

const collectHtmlSources = (document: DocumentData) =>
  [document.mode === "html" ? document.content : null, document.sourceSnapshots?.html ?? null]
    .filter((value): value is string => Boolean(value));

const documentHasAdvancedBlocks = (document: DocumentData) => (
  tiptapDocumentHasAdvancedContent(document.tiptapJson)
  || documentAstHasAdvancedContent(document.ast)
  || collectMarkdownSources(document).some((value) => markdownHasAdvancedContent(value))
  || collectHtmlSources(document).some((value) => htmlHasAdvancedContent(value))
);

const documentHasDocumentTools = (document: DocumentData) => (
  tiptapDocumentHasDocumentContent(document.tiptapJson)
  || documentAstHasDocumentContent(document.ast)
  || collectMarkdownSources(document).some((value) => markdownHasDocumentContent(value))
  || collectHtmlSources(document).some((value) => htmlHasDocumentContent(value))
);

export const getActiveDocumentCompatibility = (
  document: DocumentData,
  capabilities: Pick<EditorUiCapabilities, "canAccessAdvancedBlocks" | "canAccessDocumentTools" | "canAccessStructuredModes">,
): ActiveDocumentCompatibility => {
  if (!isModeAllowedInCapabilities(document.mode, capabilities)) {
    return {
      isCompatible: false,
      reason: "structuredMode",
    };
  }

  if (!capabilities.canAccessAdvancedBlocks && documentHasAdvancedBlocks(document)) {
    return {
      isCompatible: false,
      reason: "advancedBlocks",
    };
  }

  if (!capabilities.canAccessDocumentTools && documentHasDocumentTools(document)) {
    return {
      isCompatible: false,
      reason: "documentTools",
    };
  }

  return {
    isCompatible: true,
    reason: null,
  };
};
