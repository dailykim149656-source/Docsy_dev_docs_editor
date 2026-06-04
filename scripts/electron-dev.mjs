import { spawn } from "node:child_process";
import process from "node:process";

const rendererUrl = "http://localhost:8080";
const waitForRenderer = async () => {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(rendererUrl);

      if (response.ok) {
        return;
      }
    } catch {
      // Vite is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${rendererUrl}`);
};

const spawnChild = (command, args, options = {}) => {
  const child = spawn(command, args, {
    env: {
      ...process.env,
      ...options.env,
    },
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    if (!options.allowExit) {
      process.exitCode = code ?? 0;
    }
  });

  return child;
};

const vite = spawnChild("npm", ["run", "dev"], {
  allowExit: true,
});

await waitForRenderer();

const electron = spawnChild("npm", ["run", "electron:start"], {
  env: {
    ELECTRON_RENDERER_URL: rendererUrl,
  },
});

const shutdown = () => {
  vite.kill();
  electron.kill();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
