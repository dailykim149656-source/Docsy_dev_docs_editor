import fs from "node:fs";
import path from "node:path";

const HTML_REFERENCE_PATTERN = /\b(src|href)=["']([^"']+)["']/gi;

const isRootRelativeReference = (value) =>
  value.startsWith("/") && !value.startsWith("//");

export const findDesktopUnsafeHtmlReferences = (html) => {
  const references = [];
  let match;

  while ((match = HTML_REFERENCE_PATTERN.exec(html)) !== null) {
    const [, attribute, value] = match;

    if (isRootRelativeReference(value)) {
      references.push({ attribute, value });
    }
  }

  return references;
};

export const validateDesktopHtml = (html, label) => {
  const issues = [];
  const unsafeReferences = findDesktopUnsafeHtmlReferences(html);

  for (const reference of unsafeReferences) {
    issues.push(`${label}: ${reference.attribute}="${reference.value}" is root-relative and will break file:// loads.`);
  }

  if (!/<script\b/i.test(html)) {
    issues.push(`${label}: no script tag found, so the renderer entry is missing.`);
  }

  if (!/\bid=["']root["']/i.test(html)) {
    issues.push(`${label}: no #root mount node found.`);
  }

  return issues;
};

export const collectPackagedAsarPaths = (releaseDir) => {
  const results = [];

  if (!fs.existsSync(releaseDir)) {
    return results;
  }

  const walk = (currentDir, depth) => {
    if (depth > 6) {
      return;
    }

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isFile() && entry.name === "app.asar") {
        results.push(entryPath);
        continue;
      }

      if (entry.isDirectory()) {
        walk(entryPath, depth + 1);
      }
    }
  };

  walk(releaseDir, 0);
  return results;
};
