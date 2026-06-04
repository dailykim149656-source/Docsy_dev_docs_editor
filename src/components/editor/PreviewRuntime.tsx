import { useCallback, useEffect, useMemo } from "react";
import { useTexValidation } from "@/hooks/useTexValidation";
import { featureFlags } from "@/lib/appProfile";
import type { DocumentData, DocumentVersionSnapshotMetadata } from "@/types/document";
import type { DocumentPatchSet } from "@/types/documentPatch";

export interface PreviewRuntimeState {
  texValidationProps: {
    canAiFix: boolean;
    compileMs: number | null;
    diagnostics: ReturnType<typeof useTexValidation>["diagnostics"];
    health: ReturnType<typeof useTexValidation>["health"];
    isAiFixing: boolean;
    isExportingPdf: boolean;
    lastValidatedAt: number | null;
    latexSource: string;
    logSummary: string;
    onAiFix: () => void;
    onCompilePdf: () => void;
    onJumpToLine: (line: number) => void;
    onRunValidation: () => void;
    previewUrl: string | null;
    sourceType: ReturnType<typeof useTexValidation>["sourceType"];
    status: ReturnType<typeof useTexValidation>["status"];
    validationEnabled: boolean;
  };
}

interface PreviewRuntimeProps {
  activeDoc: DocumentData;
  currentRenderableLatexDocument: string;
  onJumpToLatexLine: (line: number) => void;
  onLoadPatchSet: (patchSet: DocumentPatchSet) => void;
  onStateChange: (state: PreviewRuntimeState | null) => void;
  onVersionSnapshot: (document: DocumentData, metadata?: DocumentVersionSnapshotMetadata) => Promise<unknown> | unknown;
}

const PreviewRuntime = ({
  activeDoc,
  currentRenderableLatexDocument,
  onJumpToLatexLine,
  onLoadPatchSet,
  onStateChange,
  onVersionSnapshot,
}: PreviewRuntimeProps) => {
  const texValidation = useTexValidation({
    documentName: activeDoc.name,
    latexSource: activeDoc.mode === "latex"
      ? activeDoc.content
      : currentRenderableLatexDocument,
    mode: activeDoc.mode,
    onPdfExported: () => {
      void onVersionSnapshot(activeDoc, { exportFormat: "XeLaTeX PDF" });
    },
    serviceEnabled: featureFlags.remoteTexServiceEnabled,
  });
  const canAiFixTex = featureFlags.llmFeaturesEnabled
    && texValidation.validationEnabled
    && texValidation.status === "error"
    && texValidation.sourceType === "raw-latex"
    && texValidation.diagnostics.length > 0;

  const handleOpenTexAutoFixReview = useCallback(async () => {
    void onLoadPatchSet;
  }, [onLoadPatchSet]);

  const texValidationProps = useMemo(() => ({
    canAiFix: canAiFixTex,
    compileMs: texValidation.compileMs,
    diagnostics: texValidation.diagnostics,
    health: texValidation.health,
    isAiFixing: false,
    isExportingPdf: texValidation.isExportingPdf,
    lastValidatedAt: texValidation.lastValidatedAt,
    latexSource: activeDoc.mode === "latex" ? activeDoc.content : currentRenderableLatexDocument,
    logSummary: texValidation.logSummary,
    onAiFix: () => {
      void handleOpenTexAutoFixReview();
    },
    onCompilePdf: texValidation.downloadCompiledPdf,
    onJumpToLine: (line: number) => {
      if (activeDoc.mode === "latex") {
        onJumpToLatexLine(line);
      }
    },
    onRunValidation: () => {
      void texValidation.runValidation();
    },
    previewUrl: texValidation.previewUrl,
    sourceType: texValidation.sourceType,
    status: texValidation.status,
    validationEnabled: texValidation.validationEnabled,
  }), [
    activeDoc.content,
    activeDoc.mode,
    canAiFixTex,
    currentRenderableLatexDocument,
    handleOpenTexAutoFixReview,
    onJumpToLatexLine,
    texValidation.compileMs,
    texValidation.diagnostics,
    texValidation.downloadCompiledPdf,
    texValidation.health,
    texValidation.isExportingPdf,
    texValidation.lastValidatedAt,
    texValidation.logSummary,
    texValidation.previewUrl,
    texValidation.runValidation,
    texValidation.sourceType,
    texValidation.status,
    texValidation.validationEnabled,
  ]);

  useEffect(() => {
    onStateChange({
      texValidationProps,
    });
  }, [onStateChange, texValidationProps]);

  useEffect(() => () => onStateChange(null), [onStateChange]);

  return null;
};

export default PreviewRuntime;
