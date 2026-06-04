import {
  buildDocumentRenderResult,
  type DocumentRenderArtifact,
  type DocumentRenderInput,
  type DocumentRenderResult,
} from "@/lib/rendering/documentRenderPipeline";

export interface EditorCommand<TResult> {
  id: string;
  execute: () => TResult;
}

export interface DownloadRenderArtifactResult {
  artifactTarget: DocumentRenderArtifact["target"];
  commandId: "render.downloadArtifact";
  fileName: string;
}

interface DownloadAdapter {
  clickDownload: (url: string, fileName: string) => void;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
}

export const createBuildRenderPreviewCommand = (
  input: DocumentRenderInput,
): EditorCommand<DocumentRenderResult> => ({
  id: "render.buildPreview",
  execute: () => buildDocumentRenderResult(input),
});

export const executeEditorCommand = <TResult>(command: EditorCommand<TResult>) => command.execute();

export const getRenderArtifactDownloadName = (
  fileName: string,
  artifact: Pick<DocumentRenderArtifact, "extension">,
) => `${fileName || "Untitled"}${artifact.extension}`;

const defaultDownloadAdapter: DownloadAdapter = {
  clickDownload: (url, fileName) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
  },
  createObjectUrl: (blob) => URL.createObjectURL(blob),
  revokeObjectUrl: (url) => URL.revokeObjectURL(url),
};

export const downloadRenderArtifact = (
  artifact: DocumentRenderArtifact,
  fileName: string,
  adapter: DownloadAdapter = defaultDownloadAdapter,
): DownloadRenderArtifactResult => {
  const downloadName = getRenderArtifactDownloadName(fileName, artifact);
  const blob = new Blob([artifact.content], { type: artifact.mimeType });
  const url = adapter.createObjectUrl(blob);

  try {
    adapter.clickDownload(url, downloadName);
  } finally {
    adapter.revokeObjectUrl(url);
  }

  return {
    artifactTarget: artifact.target,
    commandId: "render.downloadArtifact",
    fileName: downloadName,
  };
};
