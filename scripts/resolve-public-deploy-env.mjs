import { normalizeConfiguredGoogleOAuthRedirectUri } from "../server/modules/config/publicDeploymentConfig.js";

const DEFAULTS = {
  aiMaxRequestBytes: "2097152",
  aiServiceName: "docsy",
  expectedPublicFrontendOrigin: "https://docsy.cyou",
  oauthPublishingStatus: "testing",
  region: "asia-northeast3",
  texServiceName: "docsy-tex",
  texWorkerServiceName: "docsy-tex-worker",
  vertexLocation: "asia-northeast3",
  workspaceRepositoryBackend: "file",
  workspaceScopeProfile: "restricted",
};

const shellEscape = (value) => `'${String(value ?? "").replace(/'/g, `'\\''`)}'`;

const normalizeWorkspaceRepositoryBackend = (value) => {
  const normalized = value.trim().toLowerCase();
  return normalized === "file" || normalized === "local"
    ? "file"
    : DEFAULTS.workspaceRepositoryBackend;
};

const readArgs = (argv) => {
  const parsed = {
    aiUrl: process.env.DOCSY_AI_SERVICE_URL?.trim() || "",
    target: "web",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = argv[index + 1];

    if (argument === "--target" && nextValue) {
      parsed.target = nextValue.trim();
      index += 1;
      continue;
    }

    if (argument === "--ai-url" && nextValue) {
      parsed.aiUrl = nextValue.trim();
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${argument}`);
  }

  if (parsed.target !== "ai" && parsed.target !== "web") {
    throw new Error(`Unsupported --target value: ${parsed.target}`);
  }

  return parsed;
};

const resolveDeployEnv = ({ aiUrl, target }) => {
  const expectedPublicFrontendOrigin =
    process.env.DOCSY_PUBLIC_FRONTEND_ORIGIN?.trim()
    || DEFAULTS.expectedPublicFrontendOrigin;
  const configuredAllowedOrigin = process.env.GCP_AI_ALLOWED_ORIGIN?.trim() || "";
  const configuredWorkspaceFrontendOrigin = process.env.GCP_WORKSPACE_FRONTEND_ORIGIN?.trim() || "";
  const configuredApiBaseUrl = process.env.GCP_WEB_VITE_AI_API_BASE_URL?.trim() || "";
  const configuredOAuthRedirectUri = process.env.GCP_GOOGLE_OAUTH_REDIRECT_URI?.trim() || "";
  const configuredOAuthPublishingStatus = process.env.GCP_GOOGLE_OAUTH_PUBLISHING_STATUS?.trim() || "";
  const configuredWorkspaceScopeProfile = process.env.GCP_GOOGLE_WORKSPACE_SCOPE_PROFILE?.trim() || "";
  const configuredWorkspaceScopes = process.env.GCP_GOOGLE_WORKSPACE_SCOPES?.trim() || "";
  const configuredAiMaxRequestBytes = process.env.GCP_AI_MAX_REQUEST_BYTES?.trim() || "";
  const configuredWorkspaceRepositoryBackend = process.env.GCP_WORKSPACE_REPOSITORY_BACKEND?.trim() || "";

  const frontendOrigin =
    configuredWorkspaceFrontendOrigin
    || configuredAllowedOrigin
    || expectedPublicFrontendOrigin;
  const allowedOrigin = configuredAllowedOrigin || frontendOrigin;
  const workspaceFrontendOrigin = configuredWorkspaceFrontendOrigin || allowedOrigin;
  const oauthRedirectUri = normalizeConfiguredGoogleOAuthRedirectUri(
    configuredOAuthRedirectUri || `${expectedPublicFrontendOrigin}/api/auth/google/callback`,
    workspaceFrontendOrigin,
  );
  const oauthPublishingStatus = configuredOAuthPublishingStatus || DEFAULTS.oauthPublishingStatus;
  const workspaceScopeProfile = configuredWorkspaceScopeProfile || DEFAULTS.workspaceScopeProfile;
  const workspaceScopes = configuredWorkspaceScopes;
  const aiMaxRequestBytes = configuredAiMaxRequestBytes || DEFAULTS.aiMaxRequestBytes;
  const workspaceRepositoryBackend = normalizeWorkspaceRepositoryBackend(configuredWorkspaceRepositoryBackend);
  let aiApiBaseUrl = configuredApiBaseUrl || frontendOrigin;

  if (!aiApiBaseUrl && target === "web" && aiUrl) {
    aiApiBaseUrl = aiUrl;
  }

  const routingMode =
    frontendOrigin && aiApiBaseUrl === frontendOrigin
      ? "same-origin-hosting-rewrite"
      : "split-origin";

  return {
    ALLOWED_ORIGIN: allowedOrigin,
    AI_ALLOWED_ORIGIN: allowedOrigin,
    AI_API_BASE_URL: aiApiBaseUrl,
    AI_MAX_REQUEST_BYTES: aiMaxRequestBytes,
    DEFAULT_FRONTEND_ORIGIN: expectedPublicFrontendOrigin,
    DOCSY_AI_SERVICE_NAME: process.env.DOCSY_AI_SERVICE_NAME?.trim() || DEFAULTS.aiServiceName,
    DOCSY_REGION: process.env.DOCSY_REGION?.trim() || DEFAULTS.region,
    DOCSY_TEX_SERVICE_NAME: process.env.DOCSY_TEX_SERVICE_NAME?.trim() || DEFAULTS.texServiceName,
    DOCSY_TEX_WORKER_SERVICE_NAME: process.env.DOCSY_TEX_WORKER_SERVICE_NAME?.trim() || DEFAULTS.texWorkerServiceName,
    DOCSY_VERTEX_LOCATION: process.env.DOCSY_VERTEX_LOCATION?.trim() || DEFAULTS.vertexLocation,
    EXPECTED_PUBLIC_FRONTEND_ORIGIN: expectedPublicFrontendOrigin,
    FRONTEND_ORIGIN: frontendOrigin,
    GOOGLE_OAUTH_PUBLISHING_STATUS: oauthPublishingStatus,
    GOOGLE_OAUTH_REDIRECT_URI: oauthRedirectUri,
    GOOGLE_WORKSPACE_SCOPES: workspaceScopes,
    GOOGLE_WORKSPACE_SCOPE_PROFILE: workspaceScopeProfile,
    ROUTING_MODE: routingMode,
    WORKSPACE_FRONTEND_ORIGIN: workspaceFrontendOrigin,
    WORKSPACE_REPOSITORY_BACKEND: workspaceRepositoryBackend,
  };
};

const main = () => {
  const args = readArgs(process.argv.slice(2));
  const resolved = resolveDeployEnv(args);
  const shellLines = Object.entries(resolved).map(([key, value]) => `export ${key}=${shellEscape(value)}`);
  process.stdout.write(`${shellLines.join("\n")}\n`);
};

main();
