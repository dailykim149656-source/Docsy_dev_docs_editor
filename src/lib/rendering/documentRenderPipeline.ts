import type { JSONContent } from "@tiptap/core";
import { htmlToAsciidoc } from "@/components/editor/utils/htmlToAsciidoc";
import { htmlToRst } from "@/components/editor/utils/htmlToRst";
import { htmlToTypst } from "@/components/editor/utils/htmlToTypst";
import { latexToTypst } from "@/components/editor/utils/latexToTypst";
import { getRenderableHtml } from "@/lib/ast/getRenderableHtml";
import { getRenderableLatex } from "@/lib/ast/getRenderableLatex";
import { getRenderableMarkdown } from "@/lib/ast/getRenderableMarkdown";
import type { AstLatexRenderOptions } from "@/lib/ast/renderAstToLatex";
import { renderAstToHtml } from "@/lib/ast/renderAstToHtml";
import { renderAstToLatex } from "@/lib/ast/renderAstToLatex";
import { renderAstToMarkdown } from "@/lib/ast/renderAstToMarkdown";
import { serializeTiptapToAst } from "@/lib/ast/tiptapAst";
import { isUsableTiptapDocument } from "@/lib/ast/tiptapUsability";
import type { DocumentAst } from "@/types/documentAst";
import type { EditorMode } from "@/types/document";

export const DOCUMENT_RENDER_TARGETS = ["asciidoc", "html", "latex", "markdown", "rst", "typst"] as const;

export type DocumentRenderTarget = (typeof DOCUMENT_RENDER_TARGETS)[number];

export const DOCUMENT_RENDER_TARGET_LABELS: Record<DocumentRenderTarget, string> = {
  asciidoc: "AsciiDoc",
  html: "HTML",
  latex: "LaTeX",
  markdown: "Markdown",
  rst: "RST",
  typst: "Typst",
};

export const DOCUMENT_RENDER_TARGET_EXTENSIONS: Record<DocumentRenderTarget, string> = {
  asciidoc: ".adoc",
  html: ".html",
  latex: ".tex",
  markdown: ".md",
  rst: ".rst",
  typst: ".typ",
};

const DOCUMENT_RENDER_TARGET_MIME_TYPES: Record<DocumentRenderTarget, string> = {
  asciidoc: "text/asciidoc;charset=utf-8",
  html: "text/html;charset=utf-8",
  latex: "text/x-tex;charset=utf-8",
  markdown: "text/markdown;charset=utf-8",
  rst: "text/x-rst;charset=utf-8",
  typst: "text/plain;charset=utf-8",
};

export type DocumentRenderDiagnosticSeverity = "info" | "warning" | "error";
export type DocumentRenderSource = "ast" | "conversion" | "direct" | "fallback" | "tiptap";

export interface DocumentRenderDiagnostic {
  code: string;
  message: string;
  severity: DocumentRenderDiagnosticSeverity;
  source: DocumentRenderSource;
  target?: DocumentRenderTarget;
}

export interface DocumentRenderInput {
  ast?: DocumentAst | null;
  content: string;
  generatedAt?: number;
  html?: string;
  latex?: string;
  latexOptions?: AstLatexRenderOptions;
  markdown?: string;
  mode: EditorMode;
  tiptapJson?: JSONContent | null;
}

export interface DocumentRenderArtifact {
  cacheKey: string;
  content: string;
  diagnostics: DocumentRenderDiagnostic[];
  extension: string;
  generatedAt: number;
  mimeType: string;
  source: DocumentRenderSource;
  target: DocumentRenderTarget;
}

export type DocumentRenderArtifacts = Record<DocumentRenderTarget, DocumentRenderArtifact>;

export interface DocumentRenderResult {
  artifacts: DocumentRenderArtifacts;
  cacheKey: string;
  defaultTarget: DocumentRenderTarget;
  diagnostics: DocumentRenderDiagnostic[];
  sourceMode: EditorMode;
}

interface BaseRenderSources {
  html: string;
  htmlSource: DocumentRenderSource;
  latex: string;
  latexSource: DocumentRenderSource;
  markdown: string;
  markdownSource: DocumentRenderSource;
}

const createHash = (value: string) => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const getDefaultRenderTarget = (mode: EditorMode): DocumentRenderTarget => {
  if (mode === "markdown") {
    return "latex";
  }

  if (mode === "latex") {
    return "markdown";
  }

  return "markdown";
};

const directContentForTarget = (
  input: DocumentRenderInput,
  target: "html" | "latex" | "markdown",
) => (input.mode === target ? input.content : "");

const resolveAstFromInput = (
  input: DocumentRenderInput,
  diagnostics: DocumentRenderDiagnostic[],
): { ast: DocumentAst; source: DocumentRenderSource } | null => {
  if (input.ast) {
    return { ast: input.ast, source: "ast" };
  }

  if (!isUsableTiptapDocument(input.tiptapJson)) {
    return null;
  }

  try {
    return {
      ast: serializeTiptapToAst(input.tiptapJson as JSONContent, { throwOnUnsupported: true }),
      source: "tiptap",
    };
  } catch (error) {
    diagnostics.push({
      code: "tiptap_ast_serialize_failed",
      message: error instanceof Error ? error.message : "Unable to serialize editor document to AST.",
      severity: "warning",
      source: "tiptap",
    });
    return null;
  }
};

const resolveBaseSources = (
  input: DocumentRenderInput,
  diagnostics: DocumentRenderDiagnostic[],
): BaseRenderSources => {
  const astResult = resolveAstFromInput(input, diagnostics);

  if (astResult) {
    try {
      return {
        html: renderAstToHtml(astResult.ast),
        htmlSource: astResult.source,
        latex: renderAstToLatex(astResult.ast, input.latexOptions),
        latexSource: astResult.source,
        markdown: renderAstToMarkdown(astResult.ast),
        markdownSource: astResult.source,
      };
    } catch (error) {
      diagnostics.push({
        code: "ast_render_failed",
        message: error instanceof Error ? error.message : "Unable to render AST.",
        severity: "error",
        source: astResult.source,
      });
    }
  }

  const fallbackHtml = input.html ?? directContentForTarget(input, "html");
  const fallbackLatex = input.latex ?? directContentForTarget(input, "latex");
  const fallbackMarkdown = input.markdown ?? directContentForTarget(input, "markdown");

  if (isUsableTiptapDocument(input.tiptapJson)) {
    return {
      html: getRenderableHtml(input.tiptapJson, fallbackHtml),
      htmlSource: "fallback",
      latex: getRenderableLatex(input.tiptapJson, fallbackLatex, input.latexOptions),
      latexSource: "fallback",
      markdown: getRenderableMarkdown(input.tiptapJson, fallbackMarkdown),
      markdownSource: "fallback",
    };
  }

  return {
    html: fallbackHtml,
    htmlSource: fallbackHtml ? "direct" : "fallback",
    latex: fallbackLatex,
    latexSource: fallbackLatex ? "direct" : "fallback",
    markdown: fallbackMarkdown,
    markdownSource: fallbackMarkdown ? "direct" : "fallback",
  };
};

const createArtifact = (
  target: DocumentRenderTarget,
  content: string,
  source: DocumentRenderSource,
  generatedAt: number,
  cacheKey: string,
  diagnostics: DocumentRenderDiagnostic[],
): DocumentRenderArtifact => ({
  cacheKey: `${cacheKey}:${target}`,
  content,
  diagnostics: diagnostics.filter((diagnostic) => !diagnostic.target || diagnostic.target === target),
  extension: DOCUMENT_RENDER_TARGET_EXTENSIONS[target],
  generatedAt,
  mimeType: DOCUMENT_RENDER_TARGET_MIME_TYPES[target],
  source,
  target,
});

export const buildDocumentRenderCacheKey = (input: DocumentRenderInput) => createHash([
  input.mode,
  input.content,
  input.html ?? "",
  input.latex ?? "",
  input.markdown ?? "",
  input.ast ? JSON.stringify(input.ast) : "",
  input.tiptapJson ? JSON.stringify(input.tiptapJson) : "",
].join("\u001f"));

export const buildDocumentRenderResult = (input: DocumentRenderInput): DocumentRenderResult => {
  const diagnostics: DocumentRenderDiagnostic[] = [];
  const cacheKey = buildDocumentRenderCacheKey(input);
  const generatedAt = input.generatedAt ?? Date.now();
  const base = resolveBaseSources(input, diagnostics);
  const typstSource = input.mode === "latex" ? input.content : base.html;

  if (!base.html && (input.mode === "markdown" || input.mode === "latex")) {
    diagnostics.push({
      code: "html_source_missing",
      message: "HTML source was not available, so HTML-derived export targets may be empty.",
      severity: "warning",
      source: "fallback",
    });
  }

  const artifacts: DocumentRenderArtifacts = {
    asciidoc: createArtifact("asciidoc", htmlToAsciidoc(base.html), "conversion", generatedAt, cacheKey, diagnostics),
    html: createArtifact("html", base.html, base.htmlSource, generatedAt, cacheKey, diagnostics),
    latex: createArtifact("latex", base.latex, base.latexSource, generatedAt, cacheKey, diagnostics),
    markdown: createArtifact("markdown", base.markdown, base.markdownSource, generatedAt, cacheKey, diagnostics),
    rst: createArtifact("rst", htmlToRst(base.html), "conversion", generatedAt, cacheKey, diagnostics),
    typst: createArtifact(
      "typst",
      input.mode === "latex" ? latexToTypst(typstSource) : htmlToTypst(typstSource),
      "conversion",
      generatedAt,
      cacheKey,
      diagnostics,
    ),
  };

  return {
    artifacts,
    cacheKey,
    defaultTarget: getDefaultRenderTarget(input.mode),
    diagnostics,
    sourceMode: input.mode,
  };
};
