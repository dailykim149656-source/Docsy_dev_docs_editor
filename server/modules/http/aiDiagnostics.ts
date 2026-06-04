import type { IncomingMessage } from "node:http";

export const AI_DIAGNOSTICS_TOKEN_HEADER = "x-docsy-diagnostics-token";

const isProductionLikeRuntime = (env = process.env) =>
  Boolean(env.K_SERVICE || env.NODE_ENV === "production");

const isLocalDiagnosticRequest = (request: IncomingMessage) => {
  const host = typeof request.headers.host === "string" ? request.headers.host.toLowerCase() : "";
  return host.startsWith("localhost") || host.startsWith("127.0.0.1");
};

export const sanitizeLogMessage = (message: string) =>
  message
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\S ]+/g, " ")
    .trim()
    .slice(0, 200);

export const buildPublicAiHealthPayload = ({ configured }: { configured: boolean }) => ({
  configured,
  ok: true,
});

export const buildInternalAiHealthPayload = ({
  allowedOrigins,
  configured,
  fallbackModel,
  frontendOrigin,
  googleOAuthPublishingStatus,
  googleOAuthRedirectOrigin,
  googleOAuthRedirectUri,
  googleWorkspaceScopeProfile,
  googleWorkspaceScopeRisk,
  model,
  runtimeRevision,
  runtimeService,
  workspaceAuthSuccessCriterion,
  workspaceRepositoryBackend,
  workspaceSessionCookieAcceptedNames,
  workspaceSessionCookieSecureName,
  workspaceSessionCookieSecureSameSite,
}: {
  allowedOrigins: string[];
  configured: boolean;
  fallbackModel: string | null;
  frontendOrigin: string | null;
  googleOAuthPublishingStatus: "production" | "testing";
  googleOAuthRedirectOrigin: string | null;
  googleOAuthRedirectUri: string | null;
  googleWorkspaceScopeProfile: "custom" | "reduced" | "restricted";
  googleWorkspaceScopeRisk: "basic" | "restricted" | "sensitive";
  model: string;
  runtimeRevision: string | null;
  runtimeService: string | null;
  workspaceAuthSuccessCriterion: string;
  workspaceRepositoryBackend: "file";
  workspaceSessionCookieAcceptedNames: readonly string[];
  workspaceSessionCookieSecureName: string;
  workspaceSessionCookieSecureSameSite: "Lax" | "None" | "Strict";
}) => ({
  allowedOrigins,
  configured,
  fallbackModel,
  frontendOrigin,
  googleOAuthPublishingStatus,
  googleOAuthRedirectOrigin,
  googleOAuthRedirectUri,
  googleWorkspaceScopeProfile,
  googleWorkspaceScopeRisk,
  model,
  ok: true,
  runtimeRevision,
  runtimeService,
  workspaceAuthSuccessCriterion,
  workspaceRepositoryBackend,
  workspaceSessionCookieAcceptedNames,
  workspaceSessionCookieSecureName,
  workspaceSessionCookieSecureSameSite,
});

export const isAuthorizedDiagnosticsRequest = (request: IncomingMessage, env = process.env) => {
  const configuredToken = env.AI_DIAGNOSTICS_TOKEN?.trim() || "";
  const providedToken = typeof request.headers[AI_DIAGNOSTICS_TOKEN_HEADER] === "string"
    ? request.headers[AI_DIAGNOSTICS_TOKEN_HEADER]?.trim()
    : "";

  if (configuredToken) {
    return providedToken === configuredToken;
  }

  return !isProductionLikeRuntime(env) && isLocalDiagnosticRequest(request);
};
