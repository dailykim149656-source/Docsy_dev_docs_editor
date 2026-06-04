const LOCALHOST_HOSTNAMES = new Set(["127.0.0.1", "0.0.0.0", "localhost"]);
const MANAGED_GOOGLE_HOST_SUFFIXES = [".firebaseapp.com", ".run.app", ".web.app"];
const DISCOURAGED_DYNAMIC_DNS_SUFFIXES = [".duckdns.org"];
export const GOOGLE_OAUTH_CALLBACK_PATH = "/api/auth/google/callback";

const RESTRICTED_DRIVE_SCOPES = new Set([
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.apps.readonly",
  "https://www.googleapis.com/auth/drive.meet.readonly",
  "https://www.googleapis.com/auth/drive.metadata",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/drive.photos.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.scripts",
]);

const SENSITIVE_WORKSPACE_SCOPES = new Set([
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive.appdata",
  "https://www.googleapis.com/auth/drive.file",
]);

export const GOOGLE_WORKSPACE_SCOPE_PROFILES = Object.freeze({
  reduced: Object.freeze([
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/documents",
  ]),
  restricted: Object.freeze([
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
    "https://www.googleapis.com/auth/documents",
  ]),
});

const splitList = (value) => (value || "")
  .split(",")
  .flatMap((part) => part.split(/\s+/))
  .map((part) => part.trim())
  .filter((part) => part.length > 0);

const parseOptionalBooleanFlag = (value) => {
  const trimmed = value?.trim().toLowerCase() || "";

  if (!trimmed) {
    return null;
  }

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  return "invalid";
};

export const normalizeConfiguredOrigin = (value) => {
  const trimmed = value?.trim() || "";

  if (!trimmed || trimmed === "*") {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);

    if (url.pathname === "/" && !url.search && !url.hash) {
      return url.origin;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
};

export const parseConfiguredAllowedOrigins = (value) => (value || "")
  .split(",")
  .map((part) => normalizeConfiguredOrigin(part))
  .filter((part) => part.length > 0);

const resolveUrlAgainstOrigin = (value, origin) => {
  if (!origin || origin === "*") {
    return value;
  }

  try {
    return new URL(value, `${origin}/`).toString();
  } catch {
    return value;
  }
};

export const normalizeConfiguredGoogleOAuthRedirectUri = (value, frontendOrigin = "") => {
  const trimmed = value?.trim() || "";

  if (!trimmed) {
    return "";
  }

  const normalizedFrontendOrigin = normalizeConfiguredOrigin(frontendOrigin);

  if (trimmed === "/") {
    return resolveUrlAgainstOrigin(GOOGLE_OAUTH_CALLBACK_PATH, normalizedFrontendOrigin);
  }

  try {
    const url = new URL(trimmed);

    if (!url.search && !url.hash) {
      if (url.pathname === "/") {
        return `${url.origin}${GOOGLE_OAUTH_CALLBACK_PATH}`;
      }

      if (url.pathname === GOOGLE_OAUTH_CALLBACK_PATH) {
        return `${url.origin}${GOOGLE_OAUTH_CALLBACK_PATH}`;
      }
    }

    return trimmed;
  } catch {
    return resolveUrlAgainstOrigin(trimmed, normalizedFrontendOrigin);
  }
};

const isLocalhostHost = (hostname) => LOCALHOST_HOSTNAMES.has(hostname.trim().toLowerCase());

const usesManagedGoogleHost = (hostname) => MANAGED_GOOGLE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));

const usesDiscouragedDynamicDnsHost = (hostname) =>
  DISCOURAGED_DYNAMIC_DNS_SUFFIXES.some((suffix) => hostname.endsWith(suffix));

export const normalizeGoogleOAuthPublishingStatus = (value) =>
  value?.trim().toLowerCase() === "production" ? "production" : "testing";

export const normalizeGoogleWorkspaceScopeProfile = (value) =>
  value?.trim().toLowerCase() === "reduced" ? "reduced" : "restricted";

export const classifyGoogleWorkspaceScopeRisk = (scopes) => {
  if (scopes.some((scope) => RESTRICTED_DRIVE_SCOPES.has(scope))) {
    return "restricted";
  }

  if (scopes.some((scope) => SENSITIVE_WORKSPACE_SCOPES.has(scope))) {
    return "sensitive";
  }

  return "basic";
};

const parseUrl = (value, fieldName, errors) => {
  if (!value) {
    return null;
  }

  try {
    return new URL(value);
  } catch {
    errors.push(`${fieldName} must be an absolute URL. Received "${value}".`);
    return null;
  }
};

const validateOriginOnlyUrl = (url, fieldName, errors) => {
  if (!url) {
    return;
  }

  if (url.pathname !== "/" || url.search || url.hash) {
    errors.push(`${fieldName} must be an origin without path, query, or hash. Received "${url.toString()}".`);
  }
};

const isNonLocalAbsoluteOrigin = (value) => {
  if (!value || value === "*") {
    return false;
  }

  try {
    const url = new URL(value);
    return !isLocalhostHost(url.hostname);
  } catch {
    return true;
  }
};

const pushDynamicDnsMessage = ({ bucket, fieldName, hostname, publishingStatus }) => {
  const message = `${fieldName} uses dynamic DNS host "${hostname}". DuckDNS can work for testing, but it is not recommended for external production branding review.`;

  if (publishingStatus === "production") {
    bucket.push(message);
    return;
  }

  bucket.push(message);
};

const normalizeWorkspaceRepositoryBackend = (value) => {
  const normalized = value?.trim().toLowerCase() || "";
  if (normalized === "local") {
    return "file";
  }

  return normalized === "file" || normalized === "firestore" ? normalized : "";
};

const readUrlOrigin = (value) => {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
};

export const readPublicDeploymentConfig = (env = process.env) => {
  const publishingStatus = normalizeGoogleOAuthPublishingStatus(env.GOOGLE_OAUTH_PUBLISHING_STATUS);
  const configuredAllowedOrigins = env.AI_ALLOWED_ORIGIN?.trim() || "*";
  const allowedOrigins = parseConfiguredAllowedOrigins(configuredAllowedOrigins);
  const browserApiBaseUrl = normalizeConfiguredOrigin(env.VITE_AI_API_BASE_URL);
  const frontendOrigin = normalizeConfiguredOrigin(env.WORKSPACE_FRONTEND_ORIGIN);
  const googleClientId = env.GOOGLE_CLIENT_ID?.trim() || "";
  const explicitWorkspaceRepositoryBackend = normalizeWorkspaceRepositoryBackend(env.WORKSPACE_REPOSITORY_BACKEND);
  const workspaceRepositoryBackend = explicitWorkspaceRepositoryBackend || "file";
  const redirectUri = normalizeConfiguredGoogleOAuthRedirectUri(
    env.GOOGLE_OAUTH_REDIRECT_URI,
    frontendOrigin,
  );
  const redirectOrigin = readUrlOrigin(redirectUri);
  const explicitScopes = splitList(env.GOOGLE_WORKSPACE_SCOPES);
  const scopeProfile = normalizeGoogleWorkspaceScopeProfile(env.GOOGLE_WORKSPACE_SCOPE_PROFILE);
  const requestedScopes = explicitScopes.length > 0
    ? explicitScopes
    : [...GOOGLE_WORKSPACE_SCOPE_PROFILES[scopeProfile]];
  const texAllowRawDocumentRaw = env.TEX_ALLOW_RAW_DOCUMENT?.trim() || "";
  const texAllowAllPackagesRaw = env.TEX_ALLOW_ALL_PACKAGES?.trim() || "";
  const texAllowRestrictedCommandsRaw = env.TEX_ALLOW_RESTRICTED_COMMANDS?.trim() || "";
  const texAllowedPackages = splitList(env.TEX_ALLOWED_PACKAGES);
  const texAllowRawDocument = parseOptionalBooleanFlag(texAllowRawDocumentRaw);
  const texAllowAllPackages = parseOptionalBooleanFlag(texAllowAllPackagesRaw);
  const texAllowRestrictedCommands = parseOptionalBooleanFlag(texAllowRestrictedCommandsRaw);
  const hasTexPolicy = Boolean(
    texAllowRawDocumentRaw
    || texAllowAllPackagesRaw
    || texAllowRestrictedCommandsRaw
    || texAllowedPackages.length > 0,
  );

  return {
    allowedOrigins,
    browserApiBaseUrl,
    configuredAllowedOrigins,
    explicitScopeProfile: env.GOOGLE_WORKSPACE_SCOPE_PROFILE?.trim() || "",
    explicitScopes,
    frontendOrigin,
    googleClientId,
    hasExplicitWorkspaceRepositoryBackend: Boolean(explicitWorkspaceRepositoryBackend),
    hasBrowserApiBaseUrl: Boolean(env.VITE_AI_API_BASE_URL?.trim()),
    oauthEnabled: Boolean(googleClientId || redirectUri || frontendOrigin),
    publishingStatus,
    redirectOrigin,
    redirectUri,
    requestedScopes,
    scopeProfile,
    hasTexPolicy,
    texAllowedPackages,
    texAllowAllPackages,
    texAllowAllPackagesRaw,
    texAllowRawDocument,
    texAllowRawDocumentRaw,
    texAllowRestrictedCommands,
    texAllowRestrictedCommandsRaw,
    workspaceRepositoryBackend,
  };
};

export const readPublicDeploymentValidationOptions = (env = process.env) => ({
  expectedHostedFrontendOrigin: normalizeConfiguredOrigin(env.PUBLIC_DEPLOY_EXPECTED_FRONTEND_ORIGIN),
});

export const validatePublicDeploymentConfig = (config, options = {}) => {
  const errors = [];
  const warnings = [];
  const notes = [];
  const expectedHostedFrontendOrigin = normalizeConfiguredOrigin(options.expectedHostedFrontendOrigin);
  const expectedHostedFrontendUrl = parseUrl(
    expectedHostedFrontendOrigin,
    "PUBLIC_DEPLOY_EXPECTED_FRONTEND_ORIGIN",
    errors,
  );
  validateOriginOnlyUrl(expectedHostedFrontendUrl, "PUBLIC_DEPLOY_EXPECTED_FRONTEND_ORIGIN", errors);
  const enforceHostedFrontendExpectation = Boolean(expectedHostedFrontendOrigin && expectedHostedFrontendUrl);

  if (config.texAllowRawDocument === "invalid") {
    errors.push(`TEX_ALLOW_RAW_DOCUMENT must be "true" or "false". Received "${config.texAllowRawDocumentRaw}".`);
  }

  if (config.texAllowAllPackages === "invalid") {
    errors.push(`TEX_ALLOW_ALL_PACKAGES must be "true" or "false". Received "${config.texAllowAllPackagesRaw}".`);
  }

  if (config.texAllowRestrictedCommands === "invalid") {
    errors.push(`TEX_ALLOW_RESTRICTED_COMMANDS must be "true" or "false". Received "${config.texAllowRestrictedCommandsRaw}".`);
  }

  if (config.hasTexPolicy) {
    notes.push(`TeX raw document compilation is ${config.texAllowRawDocument === true ? "enabled" : config.texAllowRawDocument === false ? "disabled" : "unset"}.`);
    notes.push(`TeX package policy is ${config.texAllowAllPackages === true ? "allow-all" : config.texAllowAllPackages === false ? "allowlist" : "unset"}.`);
    notes.push(`TeX restricted command policy is ${config.texAllowRestrictedCommands === true ? "enabled" : config.texAllowRestrictedCommands === false ? "blocked" : "unset"}.`);

    if (config.texAllowAllPackages === true) {
      notes.push("TeX package allowlist enforcement is disabled for this deployment.");
    } else if (config.texAllowedPackages.length > 0) {
      notes.push(`TeX allowed package count: ${config.texAllowedPackages.length}.`);
    } else {
      warnings.push("TEX_ALLOWED_PACKAGES is unset. Deployments should pin the TeX package allowlist explicitly.");
    }

    if (config.texAllowRawDocument === false) {
      errors.push("TEX_ALLOW_RAW_DOCUMENT must be true for the repo's public/demo LaTeX deployments. Leaving it false causes the runtime error: \"Raw LaTeX document compilation is disabled for this deployment. Submit document body content instead of a full preamble/document wrapper.\"");
    }

    if (config.texAllowAllPackages !== true) {
      errors.push("TEX_ALLOW_ALL_PACKAGES must be true for the repo's public/demo LaTeX deployments. Leaving it false keeps package allowlist rejections active for raw user-authored LaTeX.");
    }

    if (config.texAllowRestrictedCommands === true) {
      warnings.push("TEX_ALLOW_RESTRICTED_COMMANDS=true enables dangerous file and process primitives. Keep it false for public/demo deployments.");
    }
  }

  for (const allowedOrigin of config.allowedOrigins) {
    if (allowedOrigin === "*") {
      continue;
    }

    const allowedOriginUrl = parseUrl(allowedOrigin, "AI_ALLOWED_ORIGIN", errors);
    validateOriginOnlyUrl(allowedOriginUrl, "AI_ALLOWED_ORIGIN", errors);
  }

  const browserApiUrl = parseUrl(config.browserApiBaseUrl, "VITE_AI_API_BASE_URL", errors);
  const frontendUrl = parseUrl(config.frontendOrigin, "WORKSPACE_FRONTEND_ORIGIN", errors);
  const redirectUrl = parseUrl(config.redirectUri, "GOOGLE_OAUTH_REDIRECT_URI", errors);

  validateOriginOnlyUrl(browserApiUrl, "VITE_AI_API_BASE_URL", errors);
  validateOriginOnlyUrl(frontendUrl, "WORKSPACE_FRONTEND_ORIGIN", errors);

  if (config.oauthEnabled) {
    if (!config.googleClientId) {
      errors.push("GOOGLE_CLIENT_ID must be set when Google OAuth is enabled.");
    }

    if (!config.frontendOrigin) {
      errors.push("WORKSPACE_FRONTEND_ORIGIN must be set when Google OAuth is enabled.");
    }

    if (!config.redirectUri) {
      errors.push("GOOGLE_OAUTH_REDIRECT_URI must be set when Google OAuth is enabled.");
    }
  } else {
    notes.push("Google OAuth is disabled because GOOGLE_CLIENT_ID, WORKSPACE_FRONTEND_ORIGIN, and GOOGLE_OAUTH_REDIRECT_URI are all empty.");
  }

  const hasNonLocalDeploymentTarget = (
    (frontendUrl && !isLocalhostHost(frontendUrl.hostname.toLowerCase()))
    || (redirectUrl && !isLocalhostHost(redirectUrl.hostname.toLowerCase()))
    || config.allowedOrigins.some((origin) => isNonLocalAbsoluteOrigin(origin))
  );

  if (config.allowedOrigins.includes("*") && hasNonLocalDeploymentTarget) {
    errors.push("AI_ALLOWED_ORIGIN must not contain \"*\" outside local development.");
  } else if (config.publishingStatus === "production" && config.allowedOrigins.includes("*")) {
    errors.push("AI_ALLOWED_ORIGIN must not contain \"*\" when GOOGLE_OAUTH_PUBLISHING_STATUS=production.");
  }

  if (frontendUrl) {
    const hostname = frontendUrl.hostname.toLowerCase();

    if (config.publishingStatus === "production") {
      if (frontendUrl.protocol !== "https:") {
        errors.push("WORKSPACE_FRONTEND_ORIGIN must use https in production.");
      }

      if (isLocalhostHost(hostname)) {
        errors.push("WORKSPACE_FRONTEND_ORIGIN must not point to localhost in production.");
      }
    }

    if (usesManagedGoogleHost(hostname)) {
      const message = `WORKSPACE_FRONTEND_ORIGIN uses managed Google host "${hostname}". Use a verified custom domain instead of "${config.frontendOrigin}".`;
      if (config.publishingStatus === "production" || enforceHostedFrontendExpectation) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    }

    if (usesDiscouragedDynamicDnsHost(hostname)) {
      pushDynamicDnsMessage({
        bucket: warnings,
        fieldName: "WORKSPACE_FRONTEND_ORIGIN",
        hostname,
        publishingStatus: config.publishingStatus,
      });
    }
  }

  if (redirectUrl) {
    const hostname = redirectUrl.hostname.toLowerCase();

    if (config.publishingStatus === "production") {
      if (redirectUrl.protocol !== "https:") {
        errors.push("GOOGLE_OAUTH_REDIRECT_URI must use https in production.");
      }

      if (isLocalhostHost(hostname)) {
        errors.push("GOOGLE_OAUTH_REDIRECT_URI must not point to localhost in production.");
      }
    }

    if (redirectUrl.pathname !== GOOGLE_OAUTH_CALLBACK_PATH) {
      errors.push(`GOOGLE_OAUTH_REDIRECT_URI must end with ${GOOGLE_OAUTH_CALLBACK_PATH}. Received "${redirectUrl.pathname}".`);
    }

    if (usesManagedGoogleHost(hostname)) {
      const message = `GOOGLE_OAUTH_REDIRECT_URI uses managed Google host "${hostname}". Use a verified custom API domain instead of "${config.redirectUri}".`;
      if (config.publishingStatus === "production" || enforceHostedFrontendExpectation) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    }

    if (usesDiscouragedDynamicDnsHost(hostname)) {
      pushDynamicDnsMessage({
        bucket: warnings,
        fieldName: "GOOGLE_OAUTH_REDIRECT_URI",
        hostname,
        publishingStatus: config.publishingStatus,
      });
    }
  }

  if (config.hasBrowserApiBaseUrl && browserApiUrl) {
    const hostname = browserApiUrl.hostname.toLowerCase();

    if (config.publishingStatus === "production") {
      if (browserApiUrl.protocol !== "https:") {
        errors.push("VITE_AI_API_BASE_URL must use https in production.");
      }

      if (isLocalhostHost(hostname)) {
        errors.push("VITE_AI_API_BASE_URL must not point to localhost in production.");
      }
    }

    if (usesManagedGoogleHost(hostname)) {
      const message = `VITE_AI_API_BASE_URL uses managed Google host "${hostname}". Use the verified frontend custom domain for browser API calls instead of "${config.browserApiBaseUrl}".`;
      if (config.publishingStatus === "production" || enforceHostedFrontendExpectation) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    }

    if (usesDiscouragedDynamicDnsHost(hostname)) {
      pushDynamicDnsMessage({
        bucket: warnings,
        fieldName: "VITE_AI_API_BASE_URL",
        hostname,
        publishingStatus: config.publishingStatus,
      });
    }
  }

  if (config.frontendOrigin && !config.allowedOrigins.includes("*") && !config.allowedOrigins.includes(config.frontendOrigin)) {
    errors.push("AI_ALLOWED_ORIGIN must include WORKSPACE_FRONTEND_ORIGIN so browser credentials can be sent correctly.");
  }

  if (enforceHostedFrontendExpectation) {
    const expectedOrigin = expectedHostedFrontendUrl.origin;
    const expectedRedirectUri = `${expectedOrigin}${GOOGLE_OAUTH_CALLBACK_PATH}`;

    if (!config.allowedOrigins.includes("*") && !config.allowedOrigins.includes(expectedOrigin)) {
      errors.push(`AI_ALLOWED_ORIGIN must include PUBLIC_DEPLOY_EXPECTED_FRONTEND_ORIGIN "${expectedOrigin}".`);
    }

    if (config.frontendOrigin && frontendUrl && frontendUrl.origin !== expectedOrigin) {
      errors.push(`WORKSPACE_FRONTEND_ORIGIN must match PUBLIC_DEPLOY_EXPECTED_FRONTEND_ORIGIN "${expectedOrigin}" for the hosted Firebase rewrite deployment.`);
    }

    if (config.redirectUri && redirectUrl && config.redirectUri !== expectedRedirectUri) {
      errors.push(`GOOGLE_OAUTH_REDIRECT_URI must be "${expectedRedirectUri}" for the hosted Firebase rewrite deployment.`);
    }

    if (config.hasBrowserApiBaseUrl && browserApiUrl && browserApiUrl.origin !== expectedOrigin) {
      errors.push(`VITE_AI_API_BASE_URL must match PUBLIC_DEPLOY_EXPECTED_FRONTEND_ORIGIN "${expectedOrigin}" for same-origin browser API calls.`);
    }

    notes.push(`Public deploy expectation pins the hosted frontend origin to ${expectedOrigin}.`);
  }

  if (config.workspaceRepositoryBackend === "firestore") {
    errors.push("WORKSPACE_REPOSITORY_BACKEND=firestore is no longer supported. Docsy now uses the local file-backed workspace repository; set WORKSPACE_REPOSITORY_BACKEND=file or leave it unset.");
  }

  if (hasNonLocalDeploymentTarget && config.oauthEnabled && config.workspaceRepositoryBackend !== "firestore") {
    notes.push("Google Workspace state uses the local file-backed repository. Set WORKSPACE_STATE_PATH or WORKSPACE_DB_PATH to a writable local persistence path for this runtime.");
  }

  if (frontendUrl && redirectUrl) {
    if (frontendUrl.origin === redirectUrl.origin) {
      notes.push("GOOGLE_OAUTH_REDIRECT_URI matches WORKSPACE_FRONTEND_ORIGIN for the recommended same-origin Hosting rewrite deployment.");
    } else {
      warnings.push("GOOGLE_OAUTH_REDIRECT_URI does not share the WORKSPACE_FRONTEND_ORIGIN origin. This repo recommends a single custom frontend domain that proxies /api/** to Cloud Run.");
    }
  }

  if (config.hasBrowserApiBaseUrl && browserApiUrl && frontendUrl) {
    if (browserApiUrl.origin === frontendUrl.origin) {
      notes.push("VITE_AI_API_BASE_URL matches WORKSPACE_FRONTEND_ORIGIN for same-origin browser API calls.");
    } else {
      warnings.push("VITE_AI_API_BASE_URL does not match WORKSPACE_FRONTEND_ORIGIN. This repo recommends same-origin browser API calls through Firebase Hosting rewrites.");
    }
  }

  if (config.explicitScopes.length > 0) {
    notes.push("GOOGLE_WORKSPACE_SCOPES is set explicitly and overrides GOOGLE_WORKSPACE_SCOPE_PROFILE.");
  } else {
    notes.push(`Using GOOGLE_WORKSPACE_SCOPE_PROFILE=${config.scopeProfile}.`);
  }

  const scopeRisk = classifyGoogleWorkspaceScopeRisk(config.requestedScopes);

  if (scopeRisk === "restricted") {
    warnings.push("Requested Google Workspace scopes still include broad Drive permissions. External production release will require restricted-scope verification and likely a security assessment.");
  } else if (scopeRisk === "sensitive") {
    warnings.push("Requested Google Workspace scopes require Google OAuth app verification before external production rollout.");
  } else {
    notes.push("Requested Google Workspace scopes stay on the lowest verification path configured in this repo.");
  }

  if (config.scopeProfile === "reduced") {
    notes.push("Reduced scope profile is intended for drive.file-centered workflows. Existing broad Drive search flows should be revisited before enabling it widely.");
  }

  return {
    errors,
    notes,
    scopeRisk,
    warnings,
  };
};

export const shouldBlockServerStartupForPublicDeployment = (config, validation) =>
  validation.errors.length > 0 && (
    config.oauthEnabled
    || config.publishingStatus === "production"
  );
