# Docsy

Docsy is a hackathon-ready AI document workflow agent built on top of the Markdown Muse editor.

It focuses on one core interaction:

1. a user edits a technical document
2. Gemini analyzes document context
3. the system proposes a structured action or patch
4. the user reviews the change before applying it

![Docsy editor preview](src/assets/editor-preview.png)

## Language

- [Korean README](README.ko.md)
- [English README](README.en.md)

## Why this project exists

Technical documentation usually breaks in the same places:

- procedures drift across documents
- updates are applied to one file but not related files
- AI can draft text, but it rarely returns reviewable actions

Docsy is designed to show a different pattern:

- document-aware editing
- review-first AI patch workflow
- Gemini-powered structured output
- a path to multimodal reasoning with editor screenshots

## Hackathon focus

This repository is being prepared for a Gemini hackathon submission.

Current submission priorities:

- GenAI SDK based Gemini integration
- Cloud Run deployment for the AI service
- multimodal request path for editor screenshot + document context
- action-oriented JSON response from Gemini
- one real UI action wired from AI output
- review-first patch workflow demo

## Demo flow

1. Open multiple technical documents in the editor.
2. Update a procedure in one document.
3. Send document context and editor state to the AI service.
4. Gemini returns a structured action or patch proposal.
5. The app opens the patch review flow.
6. The user accepts or rejects the change.

## Architecture Diagram

Docsy's deployed architecture uses a React + Vite frontend served from Firebase Hosting and a separate Node.js AI backend deployed on Cloud Run. The backend accesses Gemini on Vertex AI through the Google GenAI SDK, stores Google Workspace session and state data in the local file-backed repository, and brokers Google Docs/Drive plus LaTeX service requests without exposing credentials to the browser.

For hackathon submission, export the diagram below as a PNG and upload it via `File Upload`.

```mermaid
flowchart LR
  U["User in Browser"] --> FE["Docsy Frontend<br/>React + Vite<br/>Firebase Hosting"]

  FE -->|"/api"| API["Docsy AI Backend<br/>Node.js<br/>Cloud Run"]
  FE -->|"document context<br/>viewport screenshot<br/>UI action request"| API

  API -->|"Google GenAI SDK"| GEM["Gemini on Vertex AI"]
  GEM -->|"structured JSON action<br/>patch proposal"| API
  API -->|"assistant response<br/>patch data"| FE

  API -->|"session + workspace state"| DB["Local state file"]
  DB -->|"local state lookup"| API

  API -->|"OAuth + Docs/Drive operations"| GW["Google OAuth + Google Docs/Drive"]
  GW -->|"auth callback + document data"| API

  API -->|"TeX preview / validate / export"| TEX["TeX Service<br/>separate Cloud Run service"]
  TEX -->|"job result / PDF / preview"| API
```

For more detail, see [Hackathon Architecture](docs/architecture-hackathon-2026-03-11.md) and the [GCP deployment guide](docs/gcp-deployment.md).

## Repository structure

```text
src/       frontend editor, patch review UI, workspace panels
server/    Gemini-backed AI service for structured responses
docs/      engineering notes, plans, and architecture docs
PRD/       product requirement documents for the hackathon direction
public/    static web assets
```

## Core capabilities

- multi-document editor with tabs and workspace sidebar
- Markdown, LaTeX, HTML, JSON, and YAML editing
- document AST generation and structured patch handling
- Google Workspace connection, Google Docs import/export, and bound-document save
- AI-assisted summaries, section generation, TOC suggestions, and update proposals
- patch review dialog instead of silent document mutation
- local knowledge indexing and related document workflows
- version history and share/export flows

## Local development

### Requirements

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Start the web app

```bash
npm run dev
```

### Start the AI service

Create a local env file:

```bash
cp .env.example .env.local
```

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Set at least:

- `GOOGLE_GENAI_USE_VERTEXAI=true`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION`
- `GEMINI_MODEL`
- `GEMINI_FALLBACK_MODEL`
- `AI_SERVER_PORT`
- `AI_ALLOWED_ORIGIN`
- `VITE_AI_API_BASE_URL`

Authenticate locally with Application Default Credentials:

```bash
gcloud auth application-default login
```

Then run:

```bash
npm run ai:server
```

## Cloud Run deployment

The AI service is prepared for Cloud Run.

Runtime contract:

- `PORT` is provided by Cloud Run
- `GOOGLE_GENAI_USE_VERTEXAI=true`
- `GOOGLE_CLOUD_PROJECT` selects the Vertex AI project
- `GOOGLE_CLOUD_LOCATION` selects the Vertex AI region
- `GEMINI_MODEL` selects the primary model
- `GEMINI_FALLBACK_MODEL` selects the fallback model used for model/quota failures
- `AI_ALLOWED_ORIGIN` controls allowed frontend origins
- `AI_ALLOWED_ORIGIN` must be an explicit frontend origin outside local development

Build and deploy pipeline:

- [Dockerfile.ai](Dockerfile.ai)
- [cloudbuild.ai.yaml](cloudbuild.ai.yaml)

Cloud Run auth:

- the runtime service account must have Vertex AI permissions
- the local API key path is no longer used for Cloud Run

Frontend deployment:

- when Firebase Hosting rewrites `/api/**` to Cloud Run, set `VITE_AI_API_BASE_URL` to the deployed frontend origin
- if you intentionally split frontend and API domains, set `VITE_AI_API_BASE_URL` to the deployed API origin
- if omitted in a non-localhost environment, the frontend falls back to same-origin

Health check:

- `GET /api/ai/health`
- returns configuration-level `configured` state for the public AI runtime
- `GET /api/internal/ai/health` includes `model` and `fallbackModel` when called with the diagnostics token
- `node scripts/check-ai-runtime-smoke.mjs --origin https://YOUR_HOST` is the runtime readiness check and fails when `POST /api/ai/agent/turn` returns `agentStatus`

Google OAuth production guard:

- set `GOOGLE_OAUTH_PUBLISHING_STATUS=testing|production`
- set `GOOGLE_WORKSPACE_SCOPE_PROFILE=restricted|reduced`
- deployed Google Workspace state now uses the local file-backed repository; set `WORKSPACE_STATE_PATH` or `WORKSPACE_DB_PATH` to a writable persistent local path when state must survive restarts
- Firebase Hosting rewrites only forward the `__session` cookie to Cloud Run, so hosted workspace auth must use that cookie name in deployed HTTPS environments
- the current deployed auth contract is documented in [docs/current-workspace-auth-contract-2026-03-16.md](docs/current-workspace-auth-contract-2026-03-16.md)
- run `npm run check:public-deploy` before public deploys to validate custom-domain and OAuth settings

## Main scripts

- `npm run dev` - start the Vite dev server
- `npm run ai:server` - start the AI service locally
- `npm run build` - desktop-oriented production build
- `npm run build:web` - web-oriented production build
- `npm run preview` - preview the web build
- `npm run lint` - run ESLint
- `npm run test` - run Vitest
- `npm run typecheck:server` - type-check server code

## Important documents

- [Hackathon PRD](PRD/docsy_prd.md)
- [Final submission package](docs/final-submission-package-2026-03-11.md)
- [Hackathon implementation session summary](docs/session-summary-2026-03-11-hackathon-implementation.md)
- [Google Docs export session summary](docs/session-summary-2026-03-12-google-docs-export-and-google-dropdown.md)
- [Google OAuth production migration runbook](docs/google-oauth-production-migration-2026-03-14.md)
- [Security credential rotation runbook](docs/security-credential-rotation-runbook-2026-03-14.md)
- [Edge and browser security runbook](docs/edge-and-browser-security-runbook-2026-03-14.md)
- [Docs index](docs/README.md)
- [PRD index](PRD/README.md)
- [GCP deployment guide](docs/gcp-deployment.md)

## Security notes

- Vertex AI credentials are never exposed to the browser bundle.
- Gemini calls are routed through the server layer.
- The frontend sends document payloads to the AI service, while credentials stay in the server runtime and service account.
- Workspace state now defaults outside the repository, and `.data/` is ignored to prevent token-bearing state from being committed.

## Status

This repository is under active hackathon preparation.

The current implementation already contains editor, patch review, and document analysis building blocks. The remaining work is focused on tightening the Gemini demo path: screenshot input, multimodal prompting, action JSON, and one end-to-end UI action.
