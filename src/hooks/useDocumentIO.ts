import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/useI18n";
import type {
  CreateDocumentOptions,
  DocumentData,
  DocumentVersionSnapshotMetadata,
  EditorMode,
  SourceSnapshots,
} from "@/types/document";
import { asciidocToHtml } from "@/components/editor/utils/asciidocToHtml";
import { htmlToAsciidoc } from "@/components/editor/utils/htmlToAsciidoc";
import { htmlToRst } from "@/components/editor/utils/htmlToRst";
import { htmlToTypst } from "@/components/editor/utils/htmlToTypst";
import { latexToTypst } from "@/components/editor/utils/latexToTypst";
import { rstToHtml } from "@/components/editor/utils/rstToHtml";
import { GOOGLE_FONTS_URL, PRETENDARD_STYLESHEET_URL } from "@/components/editor/fonts";
import {
  MAX_IMPORT_FILE_SIZE_BYTES,
  resolveImportedDocumentOptions,
} from "@/lib/io/documentIoShared";
import { importLatexToDocsy } from "@/lib/latex/importLatexToDocsy";
import type { DocumentPatchSet } from "@/types/documentPatch";
import type { ShareLinkInfo } from "@/types/share";
import type { SourceFileReference } from "@/types/documentAst";

export {
  MAX_IMPORT_FILE_SIZE_BYTES,
  resolveImportedDocumentOptions,
} from "@/lib/io/documentIoShared";

interface UseDocumentIOOptions {
  activeDoc: DocumentData;
  createDocument: (options?: CreateDocumentOptions) => void;
  documents: DocumentData[];
  getRenderableLatexDocument: () => Promise<string>;
  getRenderableMarkdown: () => Promise<string>;
  onPatchSetLoad?: (patchSet: DocumentPatchSet) => void;
  onVersionSnapshot?: (metadata?: DocumentVersionSnapshotMetadata) => Promise<unknown> | unknown;
  renderableEditorHtml: string;
  renderableLatexDocument: string;
  renderableMarkdown: string;
}

export interface DocumentImportState {
  error: string | null;
  fileName: string | null;
  progress: number | null;
  status: "idle" | "reading" | "error";
}

export type ImportValidationCode = "file_too_large" | "unsupported_extension";

interface ImportValidationSuccess {
  ok: true;
}

interface ImportValidationFailure {
  code: ImportValidationCode;
  ok: false;
}

export type ImportValidationResult = ImportValidationSuccess | ImportValidationFailure;

export type ClipboardExportFormat = "html" | "json" | "markdown" | "yaml";

const loadDocsyFileFormat = () => import("@/lib/docsy/fileFormat");
const loadPatchSetGuard = () => import("@/lib/patches/isDocumentPatchSet");
const loadStructuredPatchSet = () => import("@/lib/patches/applyStructuredPatchSet");

const SUPPORTED_IMPORT_EXTENSIONS = [
  ".docsy",
  ".md",
  ".markdown",
  ".txt",
  ".tex",
  ".html",
  ".htm",
  ".json",
  ".yaml",
  ".yml",
  ".adoc",
  ".asciidoc",
  ".rst",
] as const;

const createIdleImportState = (): DocumentImportState => ({
  error: null,
  fileName: null,
  progress: null,
  status: "idle",
});

const EMPTY_SHARE_LINK_INFO: ShareLinkInfo = {
  available: false,
  errorCode: null,
  expiresAt: null,
  link: null,
  shareId: null,
};

const hasSupportedImportExtension = (fileName: string) =>
  SUPPORTED_IMPORT_EXTENSIONS.some((extension) => fileName.toLowerCase().endsWith(extension));

export const validateImportFileCandidate = (file: Pick<File, "name" | "size">): ImportValidationResult => {
  if (!hasSupportedImportExtension(file.name)) {
    return {
      code: "unsupported_extension",
      ok: false,
    };
  }

  if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    return {
      code: "file_too_large",
      ok: false,
    };
  }

  return { ok: true };
};

const buildFontStylesheetLinks = () => `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${GOOGLE_FONTS_URL}" rel="stylesheet">
  <link rel="stylesheet" href="${PRETENDARD_STYLESHEET_URL}">
`;

export const buildExportHtml = (title: string, content: string, lang = "ko") => `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="Docsy Editor">
  <title>${title}</title>
${buildFontStylesheetLinks()}
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Pretendard', 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 16px; line-height: 1.8; color: #1a1a2e; background: #fafafa;
      max-width: 800px; margin: 0 auto; padding: 3rem 2rem;
    }
    h1 { font-size: 2.25em; font-weight: 700; margin: 2rem 0 1rem; color: #0a0a0a; letter-spacing: -0.02em; }
    h2 { font-size: 1.625em; font-weight: 600; margin: 1.75rem 0 0.75rem; color: #1a1a1a; }
    h3 { font-size: 1.25em; font-weight: 600; margin: 1.5rem 0 0.5rem; color: #2a2a2a; }
    p { margin: 0.75em 0; }
    a { color: #2563eb; text-decoration: underline; text-underline-offset: 2px; }
    a:hover { color: #1d4ed8; }
    strong { font-weight: 600; }
    em { font-style: italic; }
    ul, ol { padding-left: 1.75em; margin: 0.75em 0; }
    li { margin: 0.25em 0; }
    blockquote {
      border-left: 4px solid #e5e7eb; padding: 0.5em 1em; margin: 1.25em 0;
      color: #6b7280; background: #f9fafb; border-radius: 0 8px 8px 0;
    }
    code {
      background: #f1f5f9; padding: 0.2em 0.45em; border-radius: 4px;
      font-size: 0.875em; font-family: 'Fira Code', 'JetBrains Mono', 'D2Coding', monospace;
      color: #e11d48;
    }
    pre {
      background: #1e293b; color: #e2e8f0; padding: 1.25rem; border-radius: 8px;
      overflow-x: auto; margin: 1.25em 0; font-size: 0.875em; line-height: 1.6;
      font-family: 'Fira Code', 'JetBrains Mono', 'D2Coding', monospace;
    }
    pre code { background: none; color: inherit; padding: 0; font-size: inherit; }
    table { border-collapse: collapse; width: 100%; margin: 1.25em 0; }
    th, td { border: 1px solid #e5e7eb; padding: 10px 14px; text-align: left; }
    th { background: #f8fafc; font-weight: 600; color: #374151; }
    tr:nth-child(even) { background: #fafafa; }
    img { max-width: 100%; height: auto; border-radius: 8px; margin: 1.25em 0; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 2em 0; }
    mark { background: #fef3c7; padding: 0.1em 0.25em; border-radius: 3px; }
    sub { font-size: 0.75em; }
    sup { font-size: 0.75em; }
    div[data-type="admonition"] {
      border-left: 4px solid #3b82f6; background: rgba(59,130,246,0.06);
      border-radius: 0 8px 8px 0; padding: 0.75em 1em; margin: 1.25em 0;
    }
    div[data-admonition-color="blue"] { border-left-color: #3b82f6; background: rgba(59,130,246,0.06); }
    div[data-admonition-color="green"] { border-left-color: #22c55e; background: rgba(34,197,94,0.06); }
    div[data-admonition-color="yellow"] { border-left-color: #eab308; background: rgba(234,179,8,0.06); }
    div[data-admonition-color="red"] { border-left-color: #ef4444; background: rgba(239,68,68,0.06); }
    div[data-admonition-color="purple"] { border-left-color: #a855f7; background: rgba(168,85,247,0.06); }
    div[data-admonition-color="orange"] { border-left-color: #f97316; background: rgba(249,115,22,0.06); }
    div[data-admonition-color="teal"] { border-left-color: #14b8a6; background: rgba(20,184,166,0.06); }
    div[data-admonition-color="gray"] { border-left-color: #6b7280; background: rgba(107,114,128,0.06); }
    span[data-type="footnote-ref"] { vertical-align: super; font-size: 0.75em; font-weight: 600; color: #2563eb; cursor: pointer; }
    div[data-type="footnote-item"] { border-top: 1px solid #e5e7eb; padding: 0.5em 0; font-size: 0.9em; color: #6b7280; }
    div[data-type="footnote-item"]:first-of-type { margin-top: 2em; }
    @media (max-width: 640px) {
      body { padding: 1.5rem 1rem; font-size: 15px; }
      h1 { font-size: 1.75em; }
    }
    @media print {
      body { background: white; padding: 0; }
      pre { background: #f5f5f5; color: #1a1a1a; }
    }
  </style>
</head>
<body>
${content}
</body>
</html>`;

export const buildPrintHtml = (title: string, content: string, lang = "ko") => `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title>
${buildFontStylesheetLinks()}
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<style>@media print{body{margin:0;padding:40px;background:white!important;color:black!important}*{color-adjust:exact;-webkit-print-color-adjust:exact}}body{max-width:800px;margin:0 auto;padding:40px;font-family:'Pretendard','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic','Inter',sans-serif;font-size:14px;line-height:1.7;color:#1a1a1a;background:white}h1{font-size:2em;font-weight:700;margin:1.5em 0 .5em}h2{font-size:1.5em;font-weight:600;margin:1.2em 0 .4em}h3{font-size:1.25em;font-weight:600;margin:1em 0 .3em}p{margin:.5em 0}ul,ol{padding-left:1.5em;margin:.5em 0}blockquote{border-left:3px solid #ddd;padding-left:1em;color:#666;margin:1em 0}code{background:#f5f5f5;padding:.15em .4em;border-radius:3px;font-size:.9em;font-family:'Fira Code','JetBrains Mono','D2Coding',monospace}pre{background:#f5f5f5;padding:1em;border-radius:6px;overflow-x:auto;font-family:'Fira Code','JetBrains Mono','D2Coding',monospace}pre code{background:none;padding:0;font-family:inherit}table{border-collapse:collapse;width:100%;margin:1em 0}th,td{border:1px solid #ddd;padding:8px 12px;text-align:left}th{background:#f9f9f9;font-weight:600}img{max-width:100%;height:auto;margin:1em 0}hr{border:none;border-top:1px solid #ddd;margin:1.5em 0}mark{background:#fff3bf;padding:.1em .2em;border-radius:2px}a{color:#1971c2}</style></head><body>${content}</body></html>`;

const waitForPrintWindowReady = async (windowRef: Window) => {
  if (windowRef.document.readyState !== "complete") {
    await new Promise<void>((resolve) => {
      windowRef.addEventListener("load", () => resolve(), { once: true });
    });
  }

  const fontSet = windowRef.document.fonts;

  if (fontSet) {
    try {
      await Promise.race([
        fontSet.ready,
        new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
      ]);
    } catch (error) {
      void error;
    }
  }

  await new Promise<void>((resolve) => window.setTimeout(resolve, 150));
};

export const buildClipboardExportContent = async ({
  activeDoc,
  format,
  renderableEditorHtml,
  renderableMarkdown,
}: {
  activeDoc: Pick<DocumentData, "content" | "mode">;
  format: ClipboardExportFormat;
  renderableEditorHtml: string;
  renderableMarkdown: string;
}) => {
  if (format === "markdown") {
    return activeDoc.mode === "markdown" ? activeDoc.content : renderableMarkdown;
  }

  if (format === "html") {
    return renderableEditorHtml;
  }

  if (format === "json") {
    if (activeDoc.mode === "json") {
      return activeDoc.content;
    }

    const { parseStructuredPatchDocument, serializeStructuredContent } = await loadStructuredPatchSet();
    const parsed = parseStructuredPatchDocument(activeDoc.content, "yaml");
    return serializeStructuredContent(parsed, "json");
  }

  if (activeDoc.mode === "yaml") {
    return activeDoc.content;
  }

  const { parseStructuredPatchDocument, serializeStructuredContent } = await loadStructuredPatchSet();
  const parsed = parseStructuredPatchDocument(activeDoc.content, "json");
  return serializeStructuredContent(parsed, "yaml");
};

export const buildShareLinkInfo = async (
  _document: DocumentData,
): Promise<ShareLinkInfo> => {
  return {
    ...EMPTY_SHARE_LINK_INFO,
    errorCode: "server_unavailable",
  };
};

export const useDocumentIO = ({
  activeDoc,
  createDocument,
  documents,
  getRenderableLatexDocument,
  getRenderableMarkdown,
  onPatchSetLoad,
  onVersionSnapshot,
  renderableEditorHtml,
  renderableLatexDocument,
  renderableMarkdown,
}: UseDocumentIOOptions) => {
  const { locale, t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<DocumentImportState>(createIdleImportState);
  const [shareLinkInfo, setShareLinkInfo] = useState<ShareLinkInfo>(EMPTY_SHARE_LINK_INFO);

  const buildSourceFileReference = useCallback((
    fileName: string,
    sourceFormat: string,
    importedAt: number,
  ): SourceFileReference => ({
    fileName,
    importedAt,
    sourceFormat,
    sourceId: `${fileName}:${importedAt}`,
  }), []);

  useEffect(() => {
    setShareLinkInfo(EMPTY_SHARE_LINK_INFO);
  }, [activeDoc.content, activeDoc.id, activeDoc.mode, activeDoc.updatedAt]);

  const downloadFile = useCallback((content: string, ext: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activeDoc.name || "Untitled"}${ext}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [activeDoc.name]);

  const copyToClipboard = useCallback(async (content: string, formatLabel: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success(t("hooks.io.copiedToClipboard", { format: formatLabel }));
    } catch {
      toast.error(t("hooks.io.copyFailed", { format: formatLabel }));
    }
  }, [t]);

  const copyExportFormat = useCallback(async (format: ClipboardExportFormat, formatLabel: string) => {
    try {
      const nextRenderableMarkdown = format === "markdown"
        ? await getRenderableMarkdown()
        : renderableMarkdown;
      const content = await buildClipboardExportContent({
        activeDoc,
        format,
        renderableEditorHtml,
        renderableMarkdown: nextRenderableMarkdown,
      });
      await copyToClipboard(content, formatLabel);
      void onVersionSnapshot?.({ exportFormat: formatLabel });
    } catch {
      toast.error(t("hooks.io.copyFailed", { format: formatLabel }));
    }
  }, [activeDoc, copyToClipboard, getRenderableMarkdown, onVersionSnapshot, renderableEditorHtml, renderableMarkdown, t]);

  const prepareShareLink = useCallback(async () => {
    if (shareLinkInfo.available && shareLinkInfo.link) {
      return shareLinkInfo;
    }

    const info = await buildShareLinkInfo(activeDoc);
    setShareLinkInfo(info);
    return info;
  }, [activeDoc, shareLinkInfo]);

  const getShareErrorMessage = useCallback((info: ShareLinkInfo) => {
    switch (info.errorCode) {
      case "payload_too_large":
        return t("hooks.io.shareTooLarge");
      case "server_unavailable":
        return t("hooks.io.shareServerUnavailable");
      default:
        return t("hooks.io.shareCreateFailed");
    }
  }, [t]);

  const handleCopyShareLink = useCallback(async () => {
    const nextShareLinkInfo = await prepareShareLink();
    const shareLink = nextShareLinkInfo.link;

    if (!shareLink) {
      toast.error(getShareErrorMessage(nextShareLinkInfo));
      return;
    }

    try {
      await navigator.clipboard.writeText(shareLink);
      void onVersionSnapshot?.({ exportFormat: "Share link" });
      toast.success(t("hooks.io.shareCopied"));
    } catch {
      toast.error(t("hooks.io.shareCopyFailed"));
    }
  }, [getShareErrorMessage, onVersionSnapshot, prepareShareLink, t]);

  const handleSaveMd = useCallback(async () => {
    const markdownContent = activeDoc.mode === "markdown"
      ? activeDoc.content
      : await getRenderableMarkdown();
    downloadFile(markdownContent, ".md", "text/markdown");
    void onVersionSnapshot?.({ exportFormat: "Markdown" });
  }, [activeDoc.content, activeDoc.mode, downloadFile, getRenderableMarkdown, onVersionSnapshot]);

  const handleCopyMd = useCallback(() => {
    void copyExportFormat("markdown", "Markdown");
  }, [copyExportFormat]);

  const handleSaveDocsy = useCallback(async () => {
    const { buildDocsyFileFromDocumentData, serializeDocsyFile } = await loadDocsyFileFormat();
    downloadFile(serializeDocsyFile(buildDocsyFileFromDocumentData(activeDoc)), ".docsy", "application/json");
    void onVersionSnapshot?.({ exportFormat: "Docsy" });
    toast.success(t("toasts.savedDocsy"));
  }, [activeDoc, downloadFile, onVersionSnapshot, t]);

  const handleSaveTex = useCallback(async () => {
    const latexDocument = await getRenderableLatexDocument();
    downloadFile(latexDocument, ".tex", "application/x-tex");
    void onVersionSnapshot?.({ exportFormat: "LaTeX" });
    toast.success(t("hooks.io.latexSaved"));
  }, [downloadFile, getRenderableLatexDocument, onVersionSnapshot, t]);

  const handleSaveJson = useCallback(() => {
    downloadFile(activeDoc.content, ".json", "application/json");
    void onVersionSnapshot?.({ exportFormat: "JSON" });
  }, [activeDoc.content, downloadFile, onVersionSnapshot]);

  const handleSaveYaml = useCallback(() => {
    downloadFile(activeDoc.content, ".yaml", "text/yaml");
    void onVersionSnapshot?.({ exportFormat: "YAML" });
  }, [activeDoc.content, downloadFile, onVersionSnapshot]);

  const handleSaveTypst = useCallback(() => {
    const typstContent = activeDoc.mode === "latex"
      ? latexToTypst(activeDoc.content)
      : htmlToTypst(renderableEditorHtml);

    downloadFile(typstContent, ".typ", "text/plain");
    void onVersionSnapshot?.({ exportFormat: "Typst" });
    toast.success(t("hooks.io.typstSaved"));
  }, [activeDoc.content, activeDoc.mode, downloadFile, onVersionSnapshot, renderableEditorHtml, t]);

  const handleSaveAdoc = useCallback(() => {
    downloadFile(htmlToAsciidoc(renderableEditorHtml), ".adoc", "text/plain");
    void onVersionSnapshot?.({ exportFormat: "AsciiDoc" });
    toast.success(t("hooks.io.adocSaved"));
  }, [downloadFile, onVersionSnapshot, renderableEditorHtml, t]);

  const handleSaveRst = useCallback(() => {
    downloadFile(htmlToRst(renderableEditorHtml), ".rst", "text/x-rst");
    void onVersionSnapshot?.({ exportFormat: "RST" });
    toast.success(t("hooks.io.rstSaved"));
  }, [downloadFile, onVersionSnapshot, renderableEditorHtml, t]);

  const handleSaveHtml = useCallback(() => {
    downloadFile(buildExportHtml(activeDoc.name || "Untitled", renderableEditorHtml, locale), ".html", "text/html");
    void onVersionSnapshot?.({ exportFormat: "HTML" });
    toast.success(t("hooks.io.htmlSaved"));
  }, [activeDoc.name, downloadFile, locale, onVersionSnapshot, renderableEditorHtml, t]);

  const handleCopyHtml = useCallback(() => {
    void copyExportFormat("html", "HTML");
  }, [copyExportFormat]);

  const handleCopyJson = useCallback(() => {
    void copyExportFormat("json", "JSON");
  }, [copyExportFormat]);

  const handleCopyYaml = useCallback(() => {
    void copyExportFormat("yaml", "YAML");
  }, [copyExportFormat]);

  const getEditorHtmlForPrint = useCallback(() => {
    if (activeDoc.mode === "json" || activeDoc.mode === "yaml") {
      return "";
    }

    return renderableEditorHtml;
  }, [activeDoc.mode, renderableEditorHtml]);

  const handleSavePdf = useCallback(() => {
    const printDocument = async () => {
      const content = getEditorHtmlForPrint();

      if (!content) {
        return;
      }

      const windowRef = window.open("", "_blank");

      if (!windowRef) {
        return;
      }

      windowRef.document.write(buildPrintHtml(activeDoc.name || "Untitled", content, locale));
      windowRef.document.close();
      await waitForPrintWindowReady(windowRef);
      void onVersionSnapshot?.({ exportFormat: "PDF" });
      windowRef.focus();
      windowRef.print();
    };

    void printDocument();
  }, [activeDoc.name, getEditorHtmlForPrint, locale, onVersionSnapshot]);

  const handleLoad = useCallback(() => {
    if (importState.status === "reading") {
      return;
    }

    fileInputRef.current?.click();
  }, [importState.status]);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const validation = validateImportFileCandidate(file);

    if (!validation.ok) {
      const validationCode = "code" in validation ? validation.code : "file_too_large";
      const message = validationCode === "unsupported_extension"
        ? t("hooks.io.importUnsupportedType")
        : t("hooks.io.importFileTooLarge", {
          size: `${Math.round(MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024))}MB`,
        });

      setImportState({
        error: message,
        fileName: file.name,
        progress: null,
        status: "error",
      });
      toast.error(message);
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    setImportState({
      error: null,
      fileName: file.name,
      progress: 0,
      status: "reading",
    });

    reader.onprogress = (progressEvent) => {
      if (!progressEvent.lengthComputable) {
        return;
      }

      setImportState((previousState) => previousState.status !== "reading"
        ? previousState
        : {
          ...previousState,
          progress: Math.max(1, Math.min(99, Math.round((progressEvent.loaded / progressEvent.total) * 100))),
        });
    };

    reader.onerror = () => {
      const message = t("hooks.io.importReadFailed", { name: file.name });

      setImportState({
        error: message,
        fileName: file.name,
        progress: null,
        status: "error",
      });
      toast.error(message);
      event.target.value = "";
    };

    reader.onload = (loadEvent) => {
      const processLoadedFile = async () => {
        try {
          const content = loadEvent.target?.result as string;
          const lowerName = file.name.toLowerCase();
          const name = file.name.replace(/\.(docsy|md|markdown|txt|tex|html|htm|json|yaml|yml|adoc|asciidoc|rst)$/i, "");
          const importedAt = Date.now();
          let mode: EditorMode = "markdown";
          let finalContent = content;
          let sourceFormat = "markdown";
          let sourceSnapshots: SourceSnapshots | undefined;
          let importedLatexResult: ReturnType<typeof importLatexToDocsy> | null = null;

          if (lowerName.endsWith(".docsy")) {
            const { buildDocumentDataFromDocsyFile, parseDocsyFile } = await loadDocsyFileFormat();
            const parsed = parseDocsyFile(content);
            createDocument(resolveImportedDocumentOptions({
              activeDocId: activeDoc.id,
              documents,
              importedDocument: buildDocumentDataFromDocsyFile(parsed),
            }));
            setImportState(createIdleImportState());
            toast.success(t("hooks.io.loadedDocument", { name: parsed.document.name }));
            event.target.value = "";
            return;
          }

          if (lowerName.endsWith(".tex")) {
            mode = "latex";
            sourceFormat = "latex";
            const importedLatex = importLatexToDocsy(content);
            importedLatexResult = importedLatex;
            sourceSnapshots = {
              html: importedLatex.html,
              latex: content,
            };
          } else if (lowerName.endsWith(".html") || lowerName.endsWith(".htm")) {
            mode = "html";
            sourceFormat = "html";
          } else if (lowerName.endsWith(".json")) {
            try {
              const parsed = JSON.parse(content) as unknown;
              const { isDocumentPatchSet } = await loadPatchSetGuard();

              if (onPatchSetLoad && isDocumentPatchSet(parsed)) {
                onPatchSetLoad(parsed);
                setImportState(createIdleImportState());
                event.target.value = "";
                return;
              }
            } catch (error) {
              void error;
            }

            mode = "json";
            sourceFormat = "json";
          } else if (lowerName.endsWith(".yaml") || lowerName.endsWith(".yml")) {
            mode = "yaml";
            sourceFormat = "yaml";
          } else if (lowerName.endsWith(".adoc") || lowerName.endsWith(".asciidoc")) {
            mode = "html";
            finalContent = asciidocToHtml(content);
            sourceFormat = "asciidoc";
            sourceSnapshots = {
              asciidoc: content,
              html: finalContent,
            };
            toast.info(t("hooks.io.adocConverted"));
          } else if (lowerName.endsWith(".rst")) {
            mode = "html";
            finalContent = rstToHtml(content);
            sourceFormat = "rst";
            sourceSnapshots = {
              html: finalContent,
              rst: content,
            };
            toast.info(t("hooks.io.rstConverted"));
          } else {
            sourceFormat = "markdown";
          }

          createDocument(resolveImportedDocumentOptions({
            activeDocId: activeDoc.id,
            documents,
            importedDocument: {
            content: finalContent,
            metadata: {
              ...(importedLatexResult ? { latexRoundtrip: importedLatexResult.metadata } : {}),
              sourceFiles: [buildSourceFileReference(file.name, sourceFormat, importedAt)],
              title: name,
            },
            mode,
            name,
            sourceSnapshots,
            },
          }));
          setImportState(createIdleImportState());
          toast.success(t("hooks.io.loadedDocument", { name }));
        } catch (error) {
          const message = error instanceof Error ? error.message : t("hooks.io.importParseFailed", { name: file.name });

          setImportState({
            error: message,
            fileName: file.name,
            progress: null,
            status: "error",
          });
          toast.error(message);
        } finally {
          event.target.value = "";
        }
      };

      void processLoadedFile();
    };

    reader.readAsText(file);
  }, [activeDoc.id, buildSourceFileReference, createDocument, documents, onPatchSetLoad, t]);

  return {
    fileInputRef,
    importState,
    prepareShareLink,
    shareLinkInfo,
    handleCopyHtml,
    handleCopyJson,
    handleCopyMd,
    handleCopyShareLink,
    handleCopyYaml,
    handleFileChange,
    handleLoad,
    handlePrint: handleSavePdf,
    handleSaveAdoc,
    handleSaveDocsy,
    handleSaveHtml,
    handleSaveJson,
    handleSaveMd,
    handleSavePdf,
    handleSaveRst,
    handleSaveTex,
    handleSaveTypst,
    handleSaveYaml,
  };
};
