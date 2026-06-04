import { describe, expect, it } from "vitest";
import { buildDocumentRenderResult, getDefaultRenderTarget } from "@/lib/rendering/documentRenderPipeline";
import { koreanLongHtmlFixture, koreanLongMarkdownFixture } from "@/test/fixtures/renderingDocuments.fixture";
import { technicalDocumentFixture } from "@/test/fixtures/technicalDocument.fixture";

describe("document render pipeline", () => {
  it("builds render artifacts from a supported TipTap technical document", () => {
    const result = buildDocumentRenderResult({
      content: "# fallback",
      generatedAt: 1,
      mode: "markdown",
      tiptapJson: technicalDocumentFixture,
    });

    expect(result.defaultTarget).toBe("latex");
    expect(result.artifacts.markdown.content).toContain("# System Overview");
    expect(result.artifacts.html.content).toContain('data-type="mermaid"');
    expect(result.artifacts.latex.content).toContain("% begin-mermaid");
    expect(result.artifacts.asciidoc.content).toContain("[source,mermaid]");
    expect(result.artifacts.rst.content).toContain(".. code-block:: mermaid");
    expect(result.artifacts.typst.content).toContain("// Mermaid diagram");
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toHaveLength(0);
  });

  it("reports diagnostics and keeps direct fallbacks when TipTap serialization fails", () => {
    const result = buildDocumentRenderResult({
      content: "# fallback",
      generatedAt: 1,
      html: "<h1>Fallback</h1>",
      markdown: "# Fallback",
      mode: "markdown",
      tiptapJson: {
        type: "doc",
        content: [{ type: "unsupportedNode", text: "unsupported" }],
      },
    });

    expect(result.artifacts.markdown.content).toBe("# Fallback");
    expect(result.artifacts.html.content).toBe("<h1>Fallback</h1>");
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "tiptap_ast_serialize_failed",
          severity: "warning",
        }),
      ]),
    );
  });

  it("keeps Korean long-document fixture content available for export conversions", () => {
    const result = buildDocumentRenderResult({
      content: koreanLongMarkdownFixture,
      generatedAt: 1,
      html: koreanLongHtmlFixture,
      markdown: koreanLongMarkdownFixture,
      mode: "markdown",
    });

    expect(result.cacheKey).toMatch(/^[0-9a-f]{8}$/);
    expect(result.artifacts.markdown.content).toContain("한국어 렌더 회귀");
    expect(result.artifacts.html.content).toContain("한글 입력");
    expect(result.artifacts.asciidoc.content).toContain("[source,mermaid]");
    expect(result.artifacts.typst.content).toContain("E=mc^2");
  });

  it("selects preview target defaults from the source mode", () => {
    expect(getDefaultRenderTarget("markdown")).toBe("latex");
    expect(getDefaultRenderTarget("latex")).toBe("markdown");
    expect(getDefaultRenderTarget("html")).toBe("markdown");
  });
});
