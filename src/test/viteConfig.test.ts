// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { UserConfig } from "vite";
import viteConfig from "../../vite.config";

const resolveBuildConfig = (mode: string): UserConfig => {
  if (typeof viteConfig !== "function") {
    return viteConfig as UserConfig;
  }

  return viteConfig({
    command: "build",
    isPreview: false,
    isSsrBuild: false,
    mode,
  }) as UserConfig;
};

describe("viteConfig", () => {
  it("uses relative asset paths for desktop file-protocol builds", () => {
    expect(resolveBuildConfig("production").base).toBe("./");
  });

  it("keeps root-relative asset paths for the hosted web build", () => {
    expect(resolveBuildConfig("web").base).toBe("/");
  });
});
