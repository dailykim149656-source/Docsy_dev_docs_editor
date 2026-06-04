import { describe, expect, it } from "vitest";
import {
  AI_DIAGNOSTICS_TOKEN_HEADER,
  buildInternalAiHealthPayload,
  buildPublicAiHealthPayload,
  isAuthorizedDiagnosticsRequest,
  sanitizeLogMessage,
} from "../../server/modules/http/aiDiagnostics";

describe("aiDiagnostics", () => {
  it("builds a minimal public health payload", () => {
    expect(buildPublicAiHealthPayload({ configured: true })).toEqual({
      configured: true,
      ok: true,
    });
  });

  it("authorizes internal diagnostics with an explicit token", () => {
    expect(isAuthorizedDiagnosticsRequest({
      headers: {
        [AI_DIAGNOSTICS_TOKEN_HEADER]: "secret-token",
      },
    } as never, {
      AI_DIAGNOSTICS_TOKEN: "secret-token",
      K_SERVICE: "docsy",
    })).toBe(true);

    expect(isAuthorizedDiagnosticsRequest({
      headers: {
        [AI_DIAGNOSTICS_TOKEN_HEADER]: "wrong-token",
      },
    } as never, {
      AI_DIAGNOSTICS_TOKEN: "secret-token",
      K_SERVICE: "docsy",
    })).toBe(false);
  });

  it("sanitizes multi-line log messages and preserves internal health detail shape", () => {
    expect(sanitizeLogMessage("first line\nsecond line\tthird")).toBe("first line second line third");
    expect(buildInternalAiHealthPayload({
      allowedOrigins: ["https://app.docsy.dev"],
      configured: true,
      fallbackModel: "gemini-2.5-flash-lite",
      frontendOrigin: "https://app.docsy.dev",
      googleOAuthPublishingStatus: "testing",
      googleOAuthRedirectOrigin: "https://app.docsy.dev",
      googleOAuthRedirectUri: "https://app.docsy.dev/api/auth/google/callback",
      googleWorkspaceScopeProfile: "restricted",
      googleWorkspaceScopeRisk: "restricted",
      model: "gemini-2.5-flash",
      runtimeRevision: "docsy-00129-gsw",
      runtimeService: "docsy",
      workspaceAuthSuccessCriterion: "/api/auth/session returns connected=true",
      workspaceRepositoryBackend: "file",
      workspaceSessionCookieAcceptedNames: ["__session", "__Host-docsy-workspace-session", "docsy_workspace_session"],
      workspaceSessionCookieSecureName: "__session",
      workspaceSessionCookieSecureSameSite: "None",
    })).toMatchObject({
      allowedOrigins: ["https://app.docsy.dev"],
      fallbackModel: "gemini-2.5-flash-lite",
      frontendOrigin: "https://app.docsy.dev",
      googleOAuthRedirectOrigin: "https://app.docsy.dev",
      googleOAuthRedirectUri: "https://app.docsy.dev/api/auth/google/callback",
      model: "gemini-2.5-flash",
      ok: true,
      runtimeRevision: "docsy-00129-gsw",
      runtimeService: "docsy",
      workspaceAuthSuccessCriterion: "/api/auth/session returns connected=true",
      workspaceRepositoryBackend: "file",
      workspaceSessionCookieSecureName: "__session",
      workspaceSessionCookieSecureSameSite: "None",
    });
  });
});
