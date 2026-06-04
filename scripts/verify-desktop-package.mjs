#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  collectPackagedAsarPaths,
  validateDesktopHtml,
} from "./desktop-package-verifier.mjs";

const projectRoot = process.cwd();
const distIndexPath = path.join(projectRoot, "dist", "index.html");
const releaseDir = path.join(projectRoot, "release");
const issues = [];
const checkedLabels = [];

const readAsarModule = () => {
  const require = createRequire(import.meta.url);
  return require("@electron/asar");
};

const checkHtml = (html, label) => {
  checkedLabels.push(label);
  issues.push(...validateDesktopHtml(html, label));
};

if (!fs.existsSync(distIndexPath)) {
  issues.push("dist/index.html is missing. Run npm run build before verifying the desktop package.");
} else {
  checkHtml(fs.readFileSync(distIndexPath, "utf8"), "dist/index.html");
}

const asarPaths = collectPackagedAsarPaths(releaseDir);

if (asarPaths.length > 0) {
  let asar;

  try {
    asar = readAsarModule();
  } catch (error) {
    issues.push(`Unable to load @electron/asar to inspect packaged app.asar: ${error.message}`);
  }

  if (asar) {
    for (const asarPath of asarPaths) {
      const label = path.relative(projectRoot, asarPath).replace(/\\/g, "/");

      try {
        const htmlBuffer = asar.extractFile(asarPath, "dist/index.html");
        checkHtml(htmlBuffer.toString("utf8"), `${label}:dist/index.html`);
      } catch (error) {
        issues.push(`${label}: unable to read dist/index.html from app.asar: ${error.message}`);
      }
    }
  }
} else {
  console.warn("[desktop-package] No packaged app.asar found; verified dist/index.html only.");
}

if (issues.length > 0) {
  console.error("[desktop-package] Verification failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(`[desktop-package] Verified ${checkedLabels.length} renderer HTML file(s).`);
