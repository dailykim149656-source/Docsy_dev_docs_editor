import { beforeEach, describe, expect, it, vi } from "vitest";

const createWorkspaceSessionMock = vi.fn();
const createWorkspaceSessionCookieMock = vi.fn();
const deleteWorkspaceSessionByIdMock = vi.fn();
const getWorkspaceSessionMock = vi.fn();
const getWorkspaceSessionIdMock = vi.fn();
const upsertConnectionMock = vi.fn();
const consumeAuthStateMock = vi.fn();
const pruneExpiredMock = vi.fn();

vi.mock("../../server/modules/auth/googleOAuth", () => ({
  buildGoogleAuthUrl: vi.fn(),
  createGoogleAuthState: vi.fn(),
  exchangeGoogleCodeForTokens: vi.fn().mockResolvedValue({
    accessToken: "access-token",
    refreshToken: "refresh-token",
  }),
  fetchGoogleUserProfile: vi.fn().mockResolvedValue({
    email: "user@example.com",
    sub: "user-sub",
  }),
  revokeGoogleToken: vi.fn(),
}));

vi.mock("../../server/modules/auth/sessionStore", () => ({
  clearWorkspaceSessionCookie: vi.fn(),
  createWorkspaceSession: (...args: Parameters<typeof createWorkspaceSessionMock>) => createWorkspaceSessionMock(...args),
  createWorkspaceSessionCookie: (...args: Parameters<typeof createWorkspaceSessionCookieMock>) => createWorkspaceSessionCookieMock(...args),
  deleteWorkspaceSession: vi.fn(),
  deleteWorkspaceSessionById: (...args: Parameters<typeof deleteWorkspaceSessionByIdMock>) => deleteWorkspaceSessionByIdMock(...args),
  getPresentWorkspaceSessionCookieNames: (request: { headers?: { cookie?: string } }) =>
    request.headers?.cookie ? ["__session"] : [],
  getWorkspaceSession: (...args: Parameters<typeof getWorkspaceSessionMock>) => getWorkspaceSessionMock(...args),
  getWorkspaceSessionId: (...args: Parameters<typeof getWorkspaceSessionIdMock>) => getWorkspaceSessionIdMock(...args),
}));

vi.mock("../../server/modules/workspace/repository", () => ({
  getWorkspaceRepository: () => ({
    consumeAuthState: (...args: Parameters<typeof consumeAuthStateMock>) => consumeAuthStateMock(...args),
    pruneExpired: (...args: Parameters<typeof pruneExpiredMock>) => pruneExpiredMock(...args),
    saveAuthState: vi.fn(),
    upsertConnection: (...args: Parameters<typeof upsertConnectionMock>) => upsertConnectionMock(...args),
  }),
  resolveWorkspaceRepositoryBackend: () => "file",
}));

describe("auth callback session rotation", () => {
  beforeEach(() => {
    createWorkspaceSessionMock.mockReset();
    createWorkspaceSessionCookieMock.mockReset();
    deleteWorkspaceSessionByIdMock.mockReset();
    getWorkspaceSessionMock.mockReset();
    getWorkspaceSessionIdMock.mockReset();
    upsertConnectionMock.mockReset();
    consumeAuthStateMock.mockReset();
    pruneExpiredMock.mockReset();

    createWorkspaceSessionMock.mockResolvedValue({ sessionId: "new-session" });
    createWorkspaceSessionCookieMock.mockReturnValue("__session=new-session");
    getWorkspaceSessionIdMock.mockReturnValue("old-session");
    getWorkspaceSessionMock.mockResolvedValue(null);
    consumeAuthStateMock.mockResolvedValue({
      expiresAt: Date.now() + 60_000,
      returnTo: "/editor",
      state: "state-1",
    });
  });

  it("replaces an existing session during OAuth callback", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { handleAuthRoute } = await import("../../server/modules/auth/routes");

    const response = await handleAuthRoute({
      headers: {
        host: "api.docsy.dev",
      },
      method: "GET",
      url: "/api/auth/google/callback?code=code-1&state=state-1",
    } as never);

    expect(pruneExpiredMock).toHaveBeenCalled();
    expect(upsertConnectionMock).toHaveBeenCalled();
    expect(deleteWorkspaceSessionByIdMock).toHaveBeenCalledWith("old-session");
    expect(createWorkspaceSessionMock).toHaveBeenCalledWith("google:user-sub");
    expect(response?.headers?.["Set-Cookie"]).toBe("__session=new-session");
    expect(String(response?.headers?.Location)).toContain("/editor?workspaceAuth=connected");
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("[WorkspaceAuth] callback connected"));
    infoSpy.mockRestore();
  });

  it("logs disconnected session lookups explicitly", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { handleAuthRoute } = await import("../../server/modules/auth/routes");

    const response = await handleAuthRoute({
      headers: {
        cookie: "__session=missing-session",
        host: "api.docsy.dev",
      },
      method: "GET",
      url: "/api/auth/session",
    } as never);

    expect(JSON.parse(String(response?.body))).toEqual({
      connected: false,
      provider: null,
      user: null,
    });
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("[WorkspaceAuth] session lookup connected=false"));
    infoSpy.mockRestore();
  });
});
