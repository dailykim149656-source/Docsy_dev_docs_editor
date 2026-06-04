[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [string]$Region = "asia-northeast3",
  [string]$ServiceName = "docsy",
  [string]$RepositoryName = "docsy",
  [string]$Model = "gemini-2.5-flash",
  [Parameter(Mandatory = $true)]
  [string]$GoogleClientId,
  [Parameter(Mandatory = $true)]
  [string]$TexServiceBaseUrl,
  [string]$AllowedOrigin = "https://docsy.cyou",
  [string]$WorkspaceFrontendOrigin = "",
  [string]$GoogleOAuthRedirectUri = "",
  [string]$GoogleOAuthPublishingStatus = "testing",
  [string]$GoogleWorkspaceScopeProfile = "restricted",
  [string]$GoogleWorkspaceScopes = "",
  [string]$AiMaxRequestBytes = "2097152",
  [string]$GoogleClientSecretSecret = "google-client-secret",
  [string]$DiagnosticsTokenSecret = "ai-diagnostics-token",
  [string]$TexServiceAuthTokenSecret = "tex-service-auth-token",
  [string]$Tag = "latest"
)

$ErrorActionPreference = "Stop"

$workspaceOrigin = if ([string]::IsNullOrWhiteSpace($WorkspaceFrontendOrigin)) { $AllowedOrigin } else { $WorkspaceFrontendOrigin }
$redirectUri = if ([string]::IsNullOrWhiteSpace($GoogleOAuthRedirectUri)) { "$workspaceOrigin/api/auth/google/callback" } else { $GoogleOAuthRedirectUri }
$projectNumber = gcloud projects describe $ProjectId --format="value(projectNumber)"
$runServiceAccount = "$projectNumber-compute@developer.gserviceaccount.com"

$imageUri = "{0}-docker.pkg.dev/{1}/{2}/{3}:{4}" -f $Region, $ProjectId, $RepositoryName, $ServiceName, $Tag
$substitutions = @(
  "_IMAGE_URI=$imageUri"
  "_REGION=$Region"
  "_VERTEX_LOCATION=$Region"
  "_SERVICE_NAME=$ServiceName"
  "_GEMINI_MODEL=$Model"
  "_GEMINI_FALLBACK_MODEL=gemini-2.5-flash-lite"
  "_AI_ALLOWED_ORIGIN=$AllowedOrigin"
  "_AI_MAX_REQUEST_BYTES=$AiMaxRequestBytes"
  "_GOOGLE_CLIENT_ID=$GoogleClientId"
  "_GOOGLE_OAUTH_REDIRECT_URI=$redirectUri"
  "_GOOGLE_OAUTH_PUBLISHING_STATUS=$GoogleOAuthPublishingStatus"
  "_GOOGLE_WORKSPACE_SCOPE_PROFILE=$GoogleWorkspaceScopeProfile"
  "_WORKSPACE_FRONTEND_ORIGIN=$workspaceOrigin"
  "_PUBLIC_DEPLOY_EXPECTED_FRONTEND_ORIGIN=https://docsy.cyou"
  "_WORKSPACE_REPOSITORY_BACKEND=file"
  "_GOOGLE_WORKSPACE_SCOPES=$GoogleWorkspaceScopes"
  "_AI_DIAGNOSTICS_TOKEN_SECRET=$DiagnosticsTokenSecret"
  "_GOOGLE_CLIENT_SECRET_SECRET=$GoogleClientSecretSecret"
  "_TEX_SERVICE_AUTH_TOKEN_SECRET=$TexServiceAuthTokenSecret"
  "_TEX_ALLOW_ALL_PACKAGES=true"
  "_TEX_ALLOW_RAW_DOCUMENT=true"
  "_TEX_ALLOW_RESTRICTED_COMMANDS=false"
  "_TEX_ALLOWED_PACKAGES=amsmath,amssymb,amsthm,array,booktabs,caption,enumitem,etoolbox,fancyhdr,float,fontspec,geometry,graphicx,hyperref,inputenc,latexsym,listings,longtable,makecell,mathtools,multirow,setspace,soul,tabularx,tcolorbox,titlesec,ulem,xcolor,xeCJK"
  "_TEX_SERVICE_BASE_URL=$TexServiceBaseUrl"
  "_RUN_SERVICE_ACCOUNT=$runServiceAccount"
) -join ","

gcloud config set project $ProjectId

gcloud builds submit `
  --config cloudbuild.ai.yaml `
  --substitutions $substitutions `
  .
