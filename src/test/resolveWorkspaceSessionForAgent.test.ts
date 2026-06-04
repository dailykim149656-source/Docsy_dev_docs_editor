import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getPresentWorkspaceSessionCookieNamesMock = vi.fn();
const getWorkspaceSessionMock = vi.fn();

vi.mock("../../server/modules/auth/sessionStore", () => ({
  getPresentWorkspaceSessionCookieNames: (...args: Parameters<typeof getPresentWorkspaceSessionCookieNamesMock>) =>
    getPresentWorkspaceSessionCookieNamesMock(...args),
  getWorkspaceSession: (...args: Parameters<typeof getWorkspaceSessionMock>) => getWorkspaceSessionMock(...args),
}));

vi.mock("../../server/modules/workspace/repository", () => ({
  resolveWorkspaceRepositoryBackend: () => "file",
}));

const ORIGINAL_ENV = {
  K_REVISION: process.env.K_REVISION,
};

beforeEach(() => {
  getPresentWorkspaceSessionCookieNamesMock.mockReset();
  getWorkspaceSessionMock.mockReset();
  process.env.K_REVISION = "docsy-00042";
});

afterEach(() => {
  process.env.K_REVISION = ORIGINAL_ENV.K_REVISION;
});

describe("resolveWorkspaceSessionForAgent", () => {
  it("returns a connected workspace state when session lookup succeeds", async () => {
    getPresentWorkspaceSessionCookieNamesMock.mockReturnValue(["__session"]);
    getWorkspaceSessionMock.mockResolvedValue({
      connection: {
        connectedAt: 1,
        connectionId: "conn-1",
        provider: "google_drive",
        tokens: {},
        updatedAt: 1,
        user: {
          email: "user@example.com",
        },
      },
      session: {
        connectionId: "conn-1",
        createdAt: 1,
        expiresAt: 2,
        sessionId: "session-1",
        updatedAt: 1,
      },
    });

    const { resolveWorkspaceSessionForAgent } = await import("../../server/modules/agent/resolveWorkspaceSessionForAgent");
    const result = await resolveWorkspaceSessionForAgent({
      headers: {
        cookie: "__session=session-1",
      },
    } as never, "req-1");

    expect(result).toEqual({
      presentCookieNames: ["__session"],
      sessionLookupFailed: false,
      workspaceConnected: true,
    });
  });

  it("degrades to workspace disconnected when session lookup throws", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    getPresentWorkspaceSessionCookieNamesMock.mockReturnValue(["__session"]);
    getWorkspaceSessionMock.mockRejectedValue(new Error("Local workspace store unavailable\nretry later"));

    const { resolveWorkspaceSessionForAgent } = await import("../../server/modules/agent/resolveWorkspaceSessionForAgent");
    const result = await resolveWorkspaceSessionForAgent({
      headers: {
        cookie: "__session=stale-session",
      },
    } as never, "req-2");

    expect(result).toEqual({
      presentCookieNames: ["__session"],
      sessionLookupFailed: true,
      workspaceConnected: false,
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(
      "[LiveAgent] session lookup degraded requestId=req-2 cookieNames=__session backend=file revision=docsy-00042 message=Local workspace store unavailable retry later",
    ));
    warnSpy.mockRestore();
  });
});
