import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { HttpError } from "../http/http";

export type TexArtifactMode = "export" | "preview";

interface StoredLocalArtifact {
  buffer: Buffer;
  contentDisposition: string;
  createdAt: number;
  expiresAt: number;
}

export interface StoredTexArtifact {
  expiresAt: number;
  storageBackend: "local" | "unavailable";
  url?: string;
}

const DEFAULT_ARTIFACT_TTL_SECONDS = 15 * 60;
const DEFAULT_LOCAL_ARTIFACT_CAP = 24;

const localArtifactStore = new Map<string, StoredLocalArtifact>();

const getArtifactPublicBaseUrl = () => process.env.TEX_PREVIEW_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") || "";
const getArtifactTtlSeconds = () => {
  const configured = Number(process.env.TEX_PREVIEW_URL_TTL_SECONDS || DEFAULT_ARTIFACT_TTL_SECONDS);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_ARTIFACT_TTL_SECONDS;
};

const getArtifactTtlMs = () => getArtifactTtlSeconds() * 1000;

const isLoopbackHost = (host: string) => {
  const normalized = host.trim().toLowerCase();
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "[::1]"
    || normalized.startsWith("localhost:")
    || normalized.startsWith("127.0.0.1:")
    || normalized.startsWith("[::1]:");
};

const pruneExpiredLocalArtifacts = () => {
  const now = Date.now();

  for (const [artifactId, artifact] of localArtifactStore.entries()) {
    if (artifact.expiresAt <= now) {
      localArtifactStore.delete(artifactId);
    }
  }

  if (localArtifactStore.size <= DEFAULT_LOCAL_ARTIFACT_CAP) {
    return;
  }

  const oldestEntries = [...localArtifactStore.entries()]
    .sort((left, right) => left[1].createdAt - right[1].createdAt)
    .slice(0, Math.max(0, localArtifactStore.size - DEFAULT_LOCAL_ARTIFACT_CAP));

  for (const [artifactId] of oldestEntries) {
    localArtifactStore.delete(artifactId);
  }
};

const getArtifactFileName = (mode: TexArtifactMode, documentName?: string) => {
  const baseName = (documentName || (mode === "preview" ? "preview" : "document"))
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || (mode === "preview" ? "preview" : "document");

  return `${baseName}.pdf`;
};

const buildContentDisposition = (mode: TexArtifactMode, documentName?: string) => {
  const fileName = getArtifactFileName(mode, documentName);
  return `${mode === "preview" ? "inline" : "attachment"}; filename="${fileName}"`;
};

const buildLocalArtifactBaseUrl = (request: IncomingMessage) => {
  const configured = getArtifactPublicBaseUrl();
  if (configured) {
    return configured;
  }

  const host = request.headers.host?.trim() || "";
  const forwardedProto = typeof request.headers["x-forwarded-proto"] === "string"
    ? request.headers["x-forwarded-proto"].split(",")[0]?.trim()
    : "";
  const protocol = forwardedProto || (isLoopbackHost(host) ? "http" : "https");

  if (!host || !isLoopbackHost(host)) {
    return null;
  }

  return `${protocol}://${host}`;
};

const storeLocalArtifact = ({
  documentName,
  mode,
  pdfBuffer,
  request,
}: {
  documentName?: string;
  mode: TexArtifactMode;
  pdfBuffer: Buffer;
  request: IncomingMessage;
}): StoredTexArtifact => {
  const baseUrl = buildLocalArtifactBaseUrl(request);

  if (!baseUrl) {
    return {
      expiresAt: Date.now() + getArtifactTtlMs(),
      storageBackend: "unavailable",
    };
  }

  pruneExpiredLocalArtifacts();

  const artifactId = randomUUID();
  const expiresAt = Date.now() + getArtifactTtlMs();
  localArtifactStore.set(artifactId, {
    buffer: Buffer.from(pdfBuffer),
    contentDisposition: buildContentDisposition(mode, documentName),
    createdAt: Date.now(),
    expiresAt,
  });

  return {
    expiresAt,
    storageBackend: "local",
    url: `${baseUrl}/artifacts/${artifactId}`,
  };
};

export const storeTexArtifactPdf = async ({
  documentName,
  mode,
  pdfBuffer,
  request,
}: {
  documentName?: string;
  mode: TexArtifactMode;
  pdfBuffer: Buffer;
  request: IncomingMessage;
}): Promise<StoredTexArtifact> => {
  return storeLocalArtifact({ documentName, mode, pdfBuffer, request });
};

export const consumeLocalTexArtifact = (artifactId: string) => {
  pruneExpiredLocalArtifacts();
  const artifact = localArtifactStore.get(artifactId);

  if (!artifact) {
    throw new HttpError(404, "Compiled PDF artifact not found or expired.");
  }

  if (artifact.expiresAt <= Date.now()) {
    localArtifactStore.delete(artifactId);
    throw new HttpError(404, "Compiled PDF artifact not found or expired.");
  }

  return artifact;
};
