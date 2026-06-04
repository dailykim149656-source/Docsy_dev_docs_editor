import { describe, expect, it } from "vitest";
import {
  createBuildRenderPreviewCommand,
  downloadRenderArtifact,
  executeEditorCommand,
  getRenderArtifactDownloadName,
} from "@/lib/editorCommands/renderCommands";
import type { DocumentRenderArtifact } from "@/lib/rendering/documentRenderPipeline";

const createArtifact = (): DocumentRenderArtifact => ({
  cacheKey: "abc:markdown",
  content: "# Draft",
  diagnostics: [],
  extension: ".md",
  generatedAt: 1,
  mimeType: "text/markdown;charset=utf-8",
  source: "direct",
  target: "markdown",
});

describe("render commands", () => {
  it("wraps render preview building as a command", () => {
    const result = executeEditorCommand(createBuildRenderPreviewCommand({
      content: "# Draft",
      generatedAt: 1,
      markdown: "# Draft",
      mode: "markdown",
    }));

    expect(result.artifacts.markdown.content).toBe("# Draft");
    expect(result.defaultTarget).toBe("latex");
  });

  it("downloads a render artifact through an injected adapter", () => {
    const calls: string[] = [];
    const artifact = createArtifact();

    const result = downloadRenderArtifact(artifact, "Draft", {
      clickDownload: (url, fileName) => calls.push(`click:${url}:${fileName}`),
      createObjectUrl: (blob) => {
        calls.push(`blob:${blob.type}`);
        return "blob:docsy";
      },
      revokeObjectUrl: (url) => calls.push(`revoke:${url}`),
    });

    expect(result).toEqual({
      artifactTarget: "markdown",
      commandId: "render.downloadArtifact",
      fileName: "Draft.md",
    });
    expect(calls).toEqual([
      "blob:text/markdown;charset=utf-8",
      "click:blob:docsy:Draft.md",
      "revoke:blob:docsy",
    ]);
  });

  it("uses Untitled when the document name is empty", () => {
    expect(getRenderArtifactDownloadName("", createArtifact())).toBe("Untitled.md");
  });
});
