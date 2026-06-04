#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { _electron as electron } from "playwright";

const projectRoot = process.cwd();
const releaseDir = path.join(projectRoot, "release");
const timeoutMs = Number(process.env.DOCSY_DESKTOP_SMOKE_TIMEOUT_MS || 30000);

const isExecutable = (filePath) => {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }

  if (process.platform === "win32") {
    return filePath.toLowerCase().endsWith(".exe");
  }

  return Boolean(fs.statSync(filePath).mode & 0o111);
};

const walkFiles = (directory, maxDepth = 6) => {
  const files = [];

  if (!fs.existsSync(directory)) {
    return files;
  }

  const walk = (currentDir, depth) => {
    if (depth > maxDepth) {
      return;
    }

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(entryPath, depth + 1);
        continue;
      }

      files.push(entryPath);
    }
  };

  walk(directory, 0);
  return files;
};

const findPackagedExecutable = () => {
  if (process.env.DOCSY_DESKTOP_EXECUTABLE) {
    return path.resolve(projectRoot, process.env.DOCSY_DESKTOP_EXECUTABLE);
  }

  const preferredCandidates = [
    path.join(releaseDir, "win-unpacked", "Docsy.exe"),
    path.join(releaseDir, "mac", "Docsy.app", "Contents", "MacOS", "Docsy"),
    path.join(releaseDir, "linux-unpacked", "Docsy"),
    path.join(releaseDir, "linux-unpacked", "docsy"),
  ];
  const preferred = preferredCandidates.find(isExecutable);

  if (preferred) {
    return preferred;
  }

  return walkFiles(releaseDir).find((filePath) => {
    const normalized = filePath.replace(/\\/g, "/");
    const fileName = path.basename(filePath).toLowerCase();
    return normalized.includes("-unpacked/") && fileName.startsWith("docsy") && isExecutable(filePath);
  });
};

const executablePath = findPackagedExecutable();

if (!executablePath) {
  console.error("[desktop-smoke] No packaged Docsy executable found. Run npm run desktop:dist:dir first.");
  process.exit(1);
}

const app = await electron.launch({ executablePath });

try {
  const page = await app.firstWindow({ timeout: timeoutMs });
  const runtimeErrors = [];
  const failedRequests = [];

  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      runtimeErrors.push(message.text());
    }
  });
  page.on("requestfailed", (request) => {
    failedRequests.push({
      errorText: request.failure()?.errorText || "unknown",
      url: request.url(),
    });
  });

  await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs });
  await page.waitForFunction(
    () => {
      const root = document.querySelector("#root");
      const visibleText = document.body.innerText.trim();
      return Boolean(
        root
          && root.children.length > 0
          && visibleText.length > 20
          && !visibleText.includes("Loading editor..."),
      );
    },
    undefined,
    { timeout: timeoutMs },
  );

  const diagnostics = await page.evaluate(() => ({
    rootChildren: document.querySelector("#root")?.children.length ?? 0,
    title: document.title,
    url: window.location.href,
    visibleTextSample: document.body.innerText.trim().slice(0, 120),
  }));

  const unexpectedRuntimeErrors = runtimeErrors.filter((error) => !error.includes("ERR_BLOCKED_BY_CLIENT"));
  const blockedRequests = failedRequests.filter((request) => request.errorText.includes("ERR_BLOCKED_BY_CLIENT"));
  const unexpectedFailedRequests = failedRequests.filter((request) => !request.errorText.includes("ERR_BLOCKED_BY_CLIENT"));

  if (unexpectedRuntimeErrors.length > 0) {
    console.warn("[desktop-smoke] Runtime console/page errors observed:");
    for (const error of unexpectedRuntimeErrors.slice(0, 10)) {
      console.warn(`- ${error}`);
    }
  }

  if (unexpectedFailedRequests.length > 0) {
    console.warn("[desktop-smoke] Unexpected failed requests observed:");
    for (const request of unexpectedFailedRequests.slice(0, 10)) {
      console.warn(`- ${request.errorText}: ${request.url}`);
    }
  }

  console.log(
    `[desktop-smoke] First screen rendered: ${diagnostics.title} (${diagnostics.rootChildren} root child nodes).`,
  );
  console.log(`[desktop-smoke] ${diagnostics.url}`);
  console.log(`[desktop-smoke] Text sample: ${diagnostics.visibleTextSample}`);
  if (blockedRequests.length > 0) {
    console.log(`[desktop-smoke] Observed ${blockedRequests.length} intentionally blocked local-first request(s).`);
  }
} finally {
  await app.close().catch(() => undefined);
}
