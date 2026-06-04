import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/useI18n";
import type { EditorMode } from "@/types/document";
import type {
  TexDiagnostic,
  TexHealthResponse,
  TexJobStatusResponse,
  TexSourceType,
  TexValidateResponse,
} from "@/types/tex";

type TexValidationStatus = "disabled" | "idle" | "running" | "success" | "error";

interface UseTexValidationOptions {
  documentName: string;
  latexSource: string;
  mode: EditorMode;
  onPdfExported?: () => void;
  serviceEnabled?: boolean;
}

interface TexValidationState {
  compileMs: number | null;
  diagnostics: TexDiagnostic[];
  health: TexHealthResponse | null;
  lastValidatedAt: number | null;
  logSummary: string;
  previewExpiresAt: number | null;
  previewUrl: string | null;
  status: TexValidationStatus;
}

const DEBOUNCE_MS = 1500;
const PREVIEW_IDLE_MS = 5000;

const createInitialState = (): TexValidationState => ({
  compileMs: null,
  diagnostics: [],
  health: null,
  lastValidatedAt: null,
  logSummary: "",
  previewExpiresAt: null,
  previewUrl: null,
  status: "idle",
});

const hashLatexSource = async (latexSource: string) => {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(latexSource));
    return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
  }

  let hash = 0;
  for (let index = 0; index < latexSource.length; index += 1) {
    hash = ((hash << 5) - hash) + latexSource.charCodeAt(index);
    hash |= 0;
  }

  return `fallback-${hash}`;
};

const waitFor = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, ms);

    const handleAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    };

    if (signal.aborted) {
      handleAbort();
      return;
    }

    signal.addEventListener("abort", handleAbort, { once: true });
  });

export const useTexValidation = ({
  documentName,
  latexSource,
  mode,
  onPdfExported,
  serviceEnabled = true,
}: UseTexValidationOptions) => {
  const { t } = useI18n();
  const [state, setState] = useState<TexValidationState>(createInitialState);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const validationAbortControllerRef = useRef<AbortController | null>(null);
  const previewAbortControllerRef = useRef<AbortController | null>(null);
  const exportAbortControllerRef = useRef<AbortController | null>(null);
  const lastValidatedHashRef = useRef<string | null>(null);
  const lastPreviewedHashRef = useRef<string | null>(null);
  const lastPreviewExpiresAtRef = useRef<number | null>(null);
  const healthLoadedRef = useRef(false);
  const healthRef = useRef<TexHealthResponse | null>(null);
  const validationEnabled = false;
  const sourceType = useMemo<TexSourceType>(
    () => (mode === "latex" ? "raw-latex" : "generated-latex"),
    [mode],
  );

  const applyValidationResult = useCallback((result: TexValidateResponse) => {
    setState((current) => ({
      ...current,
      compileMs: result.compileMs,
      diagnostics: result.diagnostics,
      lastValidatedAt: Date.now(),
      logSummary: result.logSummary,
      status: result.ok ? "success" : "error",
    }));
  }, []);

  const applyTexJobResult = useCallback((result: TexJobStatusResponse) => {
    if (result.status === "succeeded" && result.expiresAt) {
      lastPreviewExpiresAtRef.current = result.expiresAt;
    }

    setState((current) => {
      const clearedExpiredPreview = result.status === "succeeded"
        && !result.previewUrl
        && (current.previewExpiresAt || 0) <= Date.now();

      return {
        ...current,
        ...(clearedExpiredPreview ? {
          previewExpiresAt: null,
          previewUrl: null,
        } : {}),
        compileMs: typeof result.compileMs === "number" ? result.compileMs : current.compileMs,
        diagnostics: result.diagnostics || current.diagnostics,
        lastValidatedAt: Date.now(),
        logSummary: result.error || result.logSummary || current.logSummary,
        previewExpiresAt: result.status === "succeeded" ? result.expiresAt || current.previewExpiresAt : current.previewExpiresAt,
        previewUrl: result.status === "succeeded" && result.previewUrl ? result.previewUrl : current.previewUrl,
        status: result.status === "failed"
          ? "error"
          : result.status === "succeeded"
            ? "success"
            : current.status,
      };
    });
  }, []);

  const ensureTexHealth = useCallback(async () => {
    if (healthLoadedRef.current) {
      return healthRef.current;
    }

    healthLoadedRef.current = true;
    healthRef.current = {
      configured: false,
      engine: "xelatex",
      ok: false,
    };
    setState((current) => ({
      ...current,
      compileMs: null,
      diagnostics: [],
      health: healthRef.current,
      logSummary: "",
      status: "disabled",
    }));
    return healthRef.current;
  }, []);

  const runValidation = useCallback(async (reason: "auto" | "manual") => {
    if (!validationEnabled || !latexSource.trim()) {
      setState((current) => ({
        ...current,
        compileMs: null,
        diagnostics: [],
        lastValidatedAt: null,
        logSummary: "",
        status: validationEnabled ? "idle" : "disabled",
      }));
      if (reason === "manual" && serviceEnabled) {
        toast.error(t("texValidation.unavailable"));
      }
      return;
    }
  }, [latexSource, serviceEnabled, t, validationEnabled]);

  const runPreview = useCallback(async () => {
    void latexSource;
  }, [latexSource]);

  useEffect(() => {
    if (!validationEnabled) {
      setState((current) => ({
        ...createInitialState(),
        health: current.health,
        status: "disabled",
      }));
      return;
    }

    const timeout = window.setTimeout(() => {
      void runValidation("auto");
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      validationAbortControllerRef.current?.abort();
    };
  }, [latexSource, runValidation, validationEnabled]);

  useEffect(() => {
    if (!validationEnabled || !latexSource.trim()) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void runPreview();
    }, PREVIEW_IDLE_MS);

    return () => {
      window.clearTimeout(timeout);
      previewAbortControllerRef.current?.abort();
    };
  }, [latexSource, runPreview, validationEnabled]);

  useEffect(() => {
    healthLoadedRef.current = false;
    healthRef.current = null;
    lastValidatedHashRef.current = null;
    lastPreviewedHashRef.current = null;
    lastPreviewExpiresAtRef.current = null;
    exportAbortControllerRef.current?.abort();
    setState((current) => ({
      ...createInitialState(),
      health: current.health,
      status: validationEnabled ? "idle" : "disabled",
    }));
  }, [documentName, sourceType, validationEnabled]);

  useEffect(() => () => {
    validationAbortControllerRef.current?.abort();
    previewAbortControllerRef.current?.abort();
    exportAbortControllerRef.current?.abort();
  }, []);

  const downloadCompiledPdf = useCallback(async () => {
    toast.error(t("texValidation.unavailable"));
  }, [t]);

  return {
    ...state,
    isExportingPdf,
    runValidation: () => runValidation("manual"),
    sourceType,
    validationEnabled,
    downloadCompiledPdf,
  };
};
