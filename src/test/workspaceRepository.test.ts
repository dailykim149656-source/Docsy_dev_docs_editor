import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertSafeWorkspaceRepositoryPath,
  getWorkspaceRepository,
  resetWorkspaceRepositoryForTests,
  resolveWorkspaceRepositoryBackend,
  resolveWorkspaceRepositoryFilePath,
} from "../../server/modules/workspace/repository";

const ORIGINAL_ENV = {
  CLOUD_RUN_JOB: process.env.CLOUD_RUN_JOB,
  K_REVISION: process.env.K_REVISION,
  K_SERVICE: process.env.K_SERVICE,
  NODE_ENV: process.env.NODE_ENV,
  VITEST: process.env.VITEST,
  WORKSPACE_DB_PATH: process.env.WORKSPACE_DB_PATH,
  WORKSPACE_REPOSITORY_BACKEND: process.env.WORKSPACE_REPOSITORY_BACKEND,
  WORKSPACE_STATE_PATH: process.env.WORKSPACE_STATE_PATH,
};

let tempDirectoryPath: string | null = null;

const restoreEnv = (key: keyof typeof ORIGINAL_ENV) => {
  const value = ORIGINAL_ENV[key];

  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
};

afterEach(async () => {
  restoreEnv("CLOUD_RUN_JOB");
  restoreEnv("K_REVISION");
  restoreEnv("K_SERVICE");
  restoreEnv("NODE_ENV");
  restoreEnv("VITEST");
  restoreEnv("WORKSPACE_DB_PATH");
  restoreEnv("WORKSPACE_REPOSITORY_BACKEND");
  restoreEnv("WORKSPACE_STATE_PATH");

  if (tempDirectoryPath) {
    await rm(tempDirectoryPath, { force: true, recursive: true });
    tempDirectoryPath = null;
  }

  resetWorkspaceRepositoryForTests();
});

describe("workspace repository hardening", () => {
  it("resolves state outside the repository by default", () => {
    const localPath = resolveWorkspaceRepositoryFilePath({
      K_SERVICE: "",
      WORKSPACE_DB_PATH: "",
      WORKSPACE_STATE_PATH: "",
    } as NodeJS.ProcessEnv, "F:\\Docsy-document_editor\\markdown-muse");
    const cloudRunPath = resolveWorkspaceRepositoryFilePath({
      K_SERVICE: "docsy",
      WORKSPACE_DB_PATH: "",
      WORKSPACE_STATE_PATH: "",
    } as NodeJS.ProcessEnv, "F:\\Docsy-document_editor\\markdown-muse");

    expect(localPath).not.toContain("F:\\Docsy-document_editor\\markdown-muse");
    expect(localPath.endsWith(path.join(".docsy", "workspace-state.json"))).toBe(true);
    expect(cloudRunPath).toBe(path.resolve("F:\\Docsy-document_editor\\markdown-muse", "/tmp/docsy-workspace-state.json"));
  });

  it("uses the local file backend even when Cloud Run or legacy Firestore config is present", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(resolveWorkspaceRepositoryBackend({
      K_SERVICE: "",
      WORKSPACE_REPOSITORY_BACKEND: "",
    } as NodeJS.ProcessEnv)).toBe("file");

    expect(resolveWorkspaceRepositoryBackend({
      K_SERVICE: "docsy",
      WORKSPACE_REPOSITORY_BACKEND: "",
    } as NodeJS.ProcessEnv)).toBe("file");

    expect(resolveWorkspaceRepositoryBackend({
      K_SERVICE: "docsy",
      WORKSPACE_REPOSITORY_BACKEND: "firestore",
    } as NodeJS.ProcessEnv)).toBe("file");

    warnSpy.mockRestore();
  });

  it("rejects repo-local workspace state paths outside tests", () => {
    expect(() =>
      assertSafeWorkspaceRepositoryPath(
        "F:\\Docsy-document_editor\\markdown-muse\\.data\\docsy-workspace-state.json",
        {
          NODE_ENV: "production",
          VITEST: "false",
        } as NodeJS.ProcessEnv,
        "F:\\Docsy-document_editor\\markdown-muse",
      )).toThrow(/outside the repository/i);
  });

  it("drops persisted tokens and imported document bodies when rewriting state", async () => {
    tempDirectoryPath = await mkdtemp(path.join(tmpdir(), "docsy-workspace-state-"));
    const repositoryPath = path.join(tempDirectoryPath, "workspace-state.json");
    process.env.WORKSPACE_STATE_PATH = repositoryPath;
    process.env.WORKSPACE_REPOSITORY_BACKEND = "file";
    process.env.VITEST = "true";

    await writeFile(repositoryPath, JSON.stringify({
      authStates: {},
      connections: {
        "conn-1": {
          connectedAt: 1,
          connectionId: "conn-1",
          provider: "google_drive",
          tokens: {
            accessToken: "leaked-access-token",
            expiryDate: 123,
            idToken: "leaked-id-token",
            refreshToken: "refresh-token",
            scope: "scope-1",
            tokenType: "Bearer",
          },
          updatedAt: 1,
          user: {
            email: "user@example.com",
            sub: "sub-1",
          },
        },
      },
      importedDocuments: {
        "doc-1": {
          connectionId: "conn-1",
          content: "<p>secret imported html</p>",
          createdAt: 1,
          docsJson: { body: { content: ["secret"] } },
          documentId: "doc-1",
          fileId: "file-1",
          fileName: "Runbook",
          mimeType: "application/vnd.google-apps.document",
          updatedAt: 1,
        },
      },
      sessions: {},
      version: 1,
    }, null, 2), "utf8");

    const repository = getWorkspaceRepository();
    const connection = await repository.getConnection("conn-1");
    const importedDocument = await repository.getImportedDocument("doc-1");

    expect(connection?.tokens.accessToken).toBeUndefined();
    expect(connection?.tokens.refreshToken).toBe("refresh-token");
    expect(Object.prototype.hasOwnProperty.call(importedDocument ?? {}, "content")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(importedDocument ?? {}, "docsJson")).toBe(false);

    await repository.upsertConnection({
      ...connection!,
      updatedAt: 2,
    });
    await repository.upsertImportedDocument({
      ...importedDocument!,
      updatedAt: 2,
    });

    const rewrittenState = await readFile(repositoryPath, "utf8");

    expect(rewrittenState).not.toContain("leaked-access-token");
    expect(rewrittenState).not.toContain("leaked-id-token");
    expect(rewrittenState).not.toContain('"content":');
    expect(rewrittenState).not.toContain('"docsJson":');
  });

  it("stores shared documents and prunes expired records", async () => {
    tempDirectoryPath = await mkdtemp(path.join(tmpdir(), "docsy-shared-state-"));
    process.env.WORKSPACE_STATE_PATH = path.join(tempDirectoryPath, "workspace-state.json");
    process.env.WORKSPACE_REPOSITORY_BACKEND = "file";
    process.env.VITEST = "true";

    const repository = getWorkspaceRepository();

    await repository.upsertSharedDocument({
      compressedPayload: "compressed-payload",
      compression: "deflate-raw-base64url",
      createdAt: 100,
      expiresAt: 200,
      shareId: "share-live",
      updatedAt: 100,
    });
    await repository.upsertSharedDocument({
      compressedPayload: "expired-payload",
      compression: "deflate-raw-base64url",
      createdAt: 50,
      expiresAt: 60,
      shareId: "share-expired",
      updatedAt: 50,
    });

    expect(await repository.getSharedDocument("share-live")).toEqual({
      compressedPayload: "compressed-payload",
      compression: "deflate-raw-base64url",
      createdAt: 100,
      expiresAt: 200,
      shareId: "share-live",
      updatedAt: 100,
    });

    await repository.pruneExpired(100);

    expect(await repository.getSharedDocument("share-expired")).toBeNull();
    expect(await repository.getSharedDocument("share-live")).not.toBeNull();
  });
});
