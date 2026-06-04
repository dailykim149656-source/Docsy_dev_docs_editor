import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pruneExpiredMock = vi.fn();
const saveAuthStateMock = vi.fn();

vi.mock("../../server/modules/workspace/repository", () => ({
  getWorkspaceRepository: () => ({
    consumeAuthState: vi.fn(),
    pruneExpired: (...args: Parameters<typeof pruneExpiredMock>) => pruneExpiredMock(...args),
    saveAuthState: (...args: Parameters<typeof saveAuthStateMock>) => saveAuthStateMock(...args),
    upsertConnection: vi.fn(),
  }),
  resolveWorkspaceRepositoryBackend: () => "file",
}));

const ORIGINAL_ENV = { ...process.env };

const createJsonRequest = (body: unknown) => ({
  [Symbol.asyncIterator]: async function* () {
    yield Buffer.from(JSON.stringify(body));
  },
  headers: {
    host: "app.docsy.dev",
    origin: "https://app.docsy.dev",
    "x-forwarded-proto": "https",
  },
  method: "POST",
  url: "/api/auth/google/connect",
});

beforeEach(() => {
  pruneExpiredMock.mockReset();
  saveAuthStateMock.mockReset();
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  Object.assign(process.env, ORIGINAL_ENV);
});

describe("auth connect route", () => {
  it("returns an auth URL with the exact deployed callback URI", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "/";
    process.env.WORKSPACE_FRONTEND_ORIGIN = "https://app.docsy.dev";

    const { handleAuthRoute } = await import("../../server/modules/auth/routes");
    const response = await handleAuthRoute(createJsonRequest({ returnTo: "/editor" }) as never);

    expect(pruneExpiredMock).toHaveBeenCalledOnce();
    expect(saveAuthStateMock).toHaveBeenCalledOnce();
    expect(saveAuthStateMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      returnTo: "/editor",
      state: expect.any(String),
    }));
    expect(response?.statusCode).toBe(200);

    const payload = JSON.parse(String(response?.body)) as { authUrl: string; provider: string };
    const authUrl = new URL(payload.authUrl);

    expect(payload.provider).toBe("google_drive");
    expect(authUrl.searchParams.get("redirect_uri")).toBe("https://app.docsy.dev/api/auth/google/callback");
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("[WorkspaceAuth] connect state="));
    infoSpy.mockRestore();
  });
});
