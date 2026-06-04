import { latexToHtml } from "@/components/editor/utils/htmlToLatex";
import type { LatexImportResult } from "./types";
import {
  readCommandArguments,
  readCommandName,
  readEnvironment,
  skipWhitespaceAndComments,
  splitLatexDocument,
} from "./scanner";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const createNodeIdFactory = () => {
  let sequence = 1;
  return (prefix: string) => `node-${prefix}-${sequence++}`;
};

const escapeAttribute = (value: string) => escapeHtml(value);

const renderAttributes = (attributes: Record<string, string | undefined>) =>
  Object.entries(attributes)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}="${escapeAttribute(value || "")}"`)
    .join(" ");

const renderOpaqueBlock = (rawLatex: string, nodeId: string, label = "Raw LaTeX") =>
  `<div ${renderAttributes({
    "data-label": label || "Raw LaTeX",
    "data-node-id": nodeId,
    "data-raw-latex": rawLatex || "",
    "data-type": "opaque-latex-block",
  })}><pre><code>${escapeHtml(rawLatex || "")}</code></pre></div>`;

const renderResumeHeader = (nodeId: string, fields: {
  email?: string;
  name: string;
  phone?: string;
  primaryLinkLabel?: string;
  primaryLinkUrl?: string;
  rightPrimary?: string;
  secondaryLinkLabel?: string;
  secondaryLinkUrl?: string;
  tertiaryRight?: string;
}) => {
  const leftSecondary = fields.secondaryLinkUrl
    ? `<a href="${escapeAttribute(fields.secondaryLinkUrl)}">${escapeHtml(fields.secondaryLinkLabel || fields.secondaryLinkUrl)}</a>`
    : "";

  return `<div ${renderAttributes({
    "data-email": fields.email,
    "data-name": fields.name,
    "data-node-id": nodeId,
    "data-phone": fields.phone,
    "data-primary-link-label": fields.primaryLinkLabel,
    "data-primary-link-url": fields.primaryLinkUrl,
    "data-right-primary": fields.rightPrimary,
    "data-secondary-link-label": fields.secondaryLinkLabel,
    "data-secondary-link-url": fields.secondaryLinkUrl,
    "data-tertiary-right": fields.tertiaryRight,
    "data-type": "resume-header",
  })}>
    <div class="not-prose grid gap-2 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
      <div>
        <div class="text-2xl font-semibold">${escapeHtml(fields.name)}</div>
        ${fields.primaryLinkUrl ? `<div><a href="${escapeAttribute(fields.primaryLinkUrl)}">${escapeHtml(fields.primaryLinkLabel || fields.primaryLinkUrl)}</a></div>` : ""}
        ${leftSecondary ? `<div>${leftSecondary}</div>` : ""}
      </div>
      <div class="space-y-1 text-right text-sm">
        ${fields.rightPrimary ? `<div>${escapeHtml(fields.rightPrimary)}</div>` : ""}
        ${fields.email ? `<div>${escapeHtml(fields.email)}</div>` : ""}
        ${fields.tertiaryRight || fields.phone ? `<div>${escapeHtml(fields.tertiaryRight || fields.phone || "")}</div>` : ""}
      </div>
    </div>
  </div>`;
};

const renderResumeSummary = (nodeId: string, summary: string) =>
  `<div ${renderAttributes({
    "data-node-id": nodeId,
    "data-summary": summary,
    "data-type": "resume-summary",
  })}><p>${escapeHtml(summary).replace(/\n/g, "<br />")}</p></div>`;

const renderResumeEntry = (
  nodeId: string,
  attrs: {
    commandName: string;
    description?: string;
    details?: string[];
    subtitle?: string;
    tertiaryText?: string;
    title: string;
    trailingText?: string;
  },
) => {
  const details = attrs.details || [];
  const detailsList = details.length
    ? `<ul>${details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join("")}</ul>`
    : "";

  return `<div ${renderAttributes({
    "data-command-name": attrs.commandName,
    "data-description": attrs.description,
    "data-details": JSON.stringify(details),
    "data-node-id": nodeId,
    "data-subtitle": attrs.subtitle,
    "data-tertiary-text": attrs.tertiaryText,
    "data-title": attrs.title,
    "data-trailing-text": attrs.trailingText,
    "data-type": "resume-entry",
  })}>
    <div class="not-prose rounded-xl border border-border bg-card p-4">
      <div class="grid gap-2 md:grid-cols-2">
        <div class="font-semibold">${escapeHtml(attrs.title)}</div>
        <div class="text-right text-sm text-muted-foreground">${escapeHtml(attrs.trailingText || "")}</div>
        <div class="text-sm italic text-muted-foreground">${escapeHtml(attrs.subtitle || "")}</div>
        <div class="text-right text-sm italic text-muted-foreground">${escapeHtml(attrs.tertiaryText || "")}</div>
      </div>
      ${attrs.description ? `<p class="mt-3 text-sm">${escapeHtml(attrs.description)}</p>` : ""}
      ${detailsList}
    </div>
  </div>`;
};

const renderResumeSkillRow = (
  nodeId: string,
  attrs: {
    items: string[];
    label?: string;
    rawText: string;
  },
) => `<div ${renderAttributes({
  "data-command-name": "resumeSkills",
  "data-items": JSON.stringify(attrs.items),
  "data-label": attrs.label,
  "data-node-id": nodeId,
  "data-raw-text": attrs.rawText,
  "data-type": "resume-skill-row",
})}>
  <div class="not-prose rounded-xl border border-border bg-card p-4 text-sm">
    <strong>${escapeHtml(attrs.label || "Skills")}</strong>
    ${attrs.items.length ? ` - ${escapeHtml(attrs.items.join(", "))}` : ""}
  </div>
</div>`;

const renderLatexTitleBlock = (
  nodeId: string,
  attrs: { author?: string; date?: string; title: string },
) => `<div ${renderAttributes({
  "data-author": attrs.author,
  "data-date": attrs.date,
  "data-node-id": nodeId,
  "data-title": attrs.title,
  "data-type": "latex-title-block",
})}>
  <div class="not-prose rounded-xl border border-border bg-card p-4 text-center">
    <div class="text-2xl font-semibold">${escapeHtml(attrs.title)}</div>
    ${attrs.author ? `<div class="mt-2 text-sm text-muted-foreground">${escapeHtml(attrs.author)}</div>` : ""}
    ${attrs.date ? `<div class="text-xs text-muted-foreground">${escapeHtml(attrs.date)}</div>` : ""}
  </div>
</div>`;

const renderLatexAbstract = (nodeId: string, content: string) =>
  `<div ${renderAttributes({
    "data-content": content,
    "data-node-id": nodeId,
    "data-type": "latex-abstract",
  })}>
    <div class="not-prose rounded-xl border border-border bg-card p-4">
      <div class="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Abstract</div>
      <p>${escapeHtml(content).replace(/\n/g, "<br />")}</p>
    </div>
  </div>`;

const normalizeLatexText = (value: string) =>
  value
    .replace(/\\\\/g, "\n")
    .replace(/\s+/g, " ")
    .trim();

const parseResumeHeader = (raw: string, createNodeId: (prefix: string) => string) => {
  const nameMatch = raw.match(/\\Large\s+([^}]+)\}\}/);
  const primaryLinkMatch = raw.match(/\\textbf\{\\href\{([^}]*)\}\{\\Large\s+([^}]*)\}\}/);
  const secondaryLinkMatch = raw.match(/\n\s*\\href\{([^}]*)\}\{([^}]*)\}\s*&/);
  const emailMatch = raw.match(/Email\s*:\s*\\href\{mailto:([^}]*)\}\{([^}]*)\}/);
  const phoneMatch = raw.match(/Mobile\s*:\s*([^\n\\]+)/);
  const rows = raw
    .split("\\\\")
    .map((row) => row.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (!nameMatch && !primaryLinkMatch) {
    return null;
  }

  return renderResumeHeader(createNodeId("resume-header"), {
    email: emailMatch?.[2] || emailMatch?.[1] || "",
    name: normalizeLatexText(primaryLinkMatch?.[2] || nameMatch?.[1] || "Resume"),
    phone: normalizeLatexText(phoneMatch?.[1] || ""),
    primaryLinkLabel: primaryLinkMatch?.[2] ? normalizeLatexText(primaryLinkMatch[2]) : undefined,
    primaryLinkUrl: primaryLinkMatch?.[1],
    rightPrimary: rows[0]?.split("&")[1]?.trim(),
    secondaryLinkLabel: secondaryLinkMatch?.[2] ? normalizeLatexText(secondaryLinkMatch[2]) : undefined,
    secondaryLinkUrl: secondaryLinkMatch?.[1],
    tertiaryRight: rows.at(-1)?.split("&")[1]?.trim(),
  });
};

const parsePreambleText = (source: string, commandName: "author" | "date" | "title") => {
  const pattern = new RegExp(`\\\\${commandName}\\{([^}]*)\\}`);
  const match = source.match(pattern);
  return match ? normalizeLatexText(match[1]) : "";
};

const parseResumeItems = (source: string, startIndex: number) => {
  const startCommand = readCommandName(source, startIndex);
  if (!startCommand || startCommand.name !== "resumeItemListStart") {
    return {
      details: [] as string[],
      endIndex: startIndex,
      found: false,
    };
  }

  let index = skipWhitespaceAndComments(source, startCommand.endIndex);
  const details: string[] = [];

  while (index < source.length) {
    const endCommand = readCommandName(source, index);
    if (endCommand?.name === "resumeItemListEnd") {
      return {
        details,
        endIndex: endCommand.endIndex,
        found: true,
      };
    }

    const itemCommand = readCommandArguments(source, index, 1);
    if (!itemCommand || itemCommand.commandName !== "resumeItem") {
      break;
    }

    details.push(normalizeLatexText(itemCommand.args[0]));
    index = skipWhitespaceAndComments(source, itemCommand.endIndex);
  }

  return {
    details,
    endIndex: startIndex,
    found: false,
  };
};

const parseSkillRow = (raw: string) => {
  const labelMatch = raw.match(/\\textbf\{([^}]*)\}\s*-\s*(.*)$/);
  if (!labelMatch) {
    return {
      items: [],
      label: "",
      rawText: normalizeLatexText(raw),
    };
  }

  return {
    items: labelMatch[2].split(",").map((item) => item.trim()).filter(Boolean),
    label: normalizeLatexText(labelMatch[1]),
    rawText: normalizeLatexText(raw),
  };
};

const ALLOWED_GENERIC_ENVIRONMENTS = new Set([
  "align",
  "align*",
  "enumerate",
  "equation",
  "equation*",
  "figure",
  "gather",
  "gather*",
  "itemize",
  "quote",
  "table",
  "tabular",
  "tabular*",
  "theorem",
  "lemma",
  "proposition",
  "corollary",
  "definition",
  "example",
  "remark",
  "proof",
]);

const KNOWN_TOP_LEVEL_COMMANDS = new Set([
  "begin",
  "resumeCommunity",
  "resumeEmployment",
  "resumeProject",
  "resumeResearch",
  "resumeSkills",
  "resumeSubheading",
  "resumeSummary",
  "resumeTalk",
  "maketitle",
  "section",
  "subsection",
  "subsubsection",
]);

const SAFE_GENERIC_COMMANDS = new Set([
  "autoref",
  "cite",
  "citep",
  "citet",
  "emph",
  "eqref",
  "footnote",
  "href",
  "item",
  "label",
  "ref",
  "section",
  "subsection",
  "subsubsection",
  "textbf",
  "textit",
  "texttt",
  "underline",
  "url",
]);

const shouldPreserveAsRaw = (chunk: string) => {
  const commandMatches: string[] = chunk.match(/\\([a-zA-Z@*]+)/g) ?? [];

  return commandMatches.some((match) => {
    const commandName = match.slice(1);
    if (commandName === "begin" || commandName === "end") {
      return false;
    }
    return !SAFE_GENERIC_COMMANDS.has(commandName);
  });
};

const convertGenericChunk = (chunk: string, createNodeId: (prefix: string) => string) => {
  const trimmed = chunk.trim();
  if (!trimmed) {
    return "";
  }

  if (shouldPreserveAsRaw(trimmed)) {
    return renderOpaqueBlock(trimmed, createNodeId("opaque"));
  }

  const html = latexToHtml(trimmed, { includeMetadata: false }).trim();
  return html || renderOpaqueBlock(trimmed, createNodeId("opaque"));
};

const consumeOpaqueRegion = (
  source: string,
  startIndex: number,
) => {
  let index = startIndex;

  while (index < source.length) {
    const nextSlash = source.indexOf("\\", index + 1);

    if (nextSlash === -1) {
      return {
        endIndex: source.length,
        raw: source.slice(startIndex).trim(),
      };
    }

    const command = readCommandName(source, nextSlash);

    if (!command) {
      index = nextSlash + 1;
      continue;
    }

    if (KNOWN_TOP_LEVEL_COMMANDS.has(command.name) && nextSlash > startIndex) {
      return {
        endIndex: nextSlash,
        raw: source.slice(startIndex, nextSlash).trim(),
      };
    }

    index = command.endIndex;
  }

  return {
    endIndex: source.length,
    raw: source.slice(startIndex).trim(),
  };
};

export const importLatexToDocsy = (source: string): LatexImportResult => {
  const parts = splitLatexDocument(source);
  const createNodeId = createNodeIdFactory();
  const htmlSegments: string[] = [];
  const body = parts.body;
  const profile = /\\newcommand\{\\resumeEmployment\}/.test(parts.preamble) ? "resume" : "generic";
  const preambleTitle = parsePreambleText(parts.preamble, "title");
  const preambleAuthor = parsePreambleText(parts.preamble, "author");
  const preambleDate = parsePreambleText(parts.preamble, "date");
  let index = 0;

  while (index < body.length) {
    const nextIndex = skipWhitespaceAndComments(body, index);
    if (nextIndex >= body.length) {
      break;
    }
    index = nextIndex;

    const headerEnv = readEnvironment(body, index, "tabular*");
    if (headerEnv) {
      const parsedHeader = parseResumeHeader(headerEnv.raw, createNodeId);
      htmlSegments.push(parsedHeader || convertGenericChunk(headerEnv.raw, createNodeId));
      index = headerEnv.endIndex;
      continue;
    }

    const commandName = readCommandName(body, index);

    if (!commandName) {
      const nextCommand = body.indexOf("\\", index + 1);
      const chunk = nextCommand === -1 ? body.slice(index) : body.slice(index, nextCommand);
      htmlSegments.push(convertGenericChunk(chunk, createNodeId));
      index = nextCommand === -1 ? body.length : nextCommand;
      continue;
    }

    if (commandName.name === "resumeSubHeadingListStart"
      || commandName.name === "resumeSubHeadingListEnd"
      || commandName.name === "resumeEmploymentListStart"
      || commandName.name === "resumeEmploymentListEnd") {
      index = commandName.endIndex;
      continue;
    }

    if (commandName.name === "resumeItemListStart") {
      const opaqueRegion = consumeOpaqueRegion(body, index);
      htmlSegments.push(renderOpaqueBlock(opaqueRegion.raw, createNodeId("opaque"), "Resume Items"));
      index = opaqueRegion.endIndex;
      continue;
    }

    if (commandName.name === "resumeItemListEnd" || commandName.name === "resumeItem") {
      const opaqueRegion = consumeOpaqueRegion(body, index);
      htmlSegments.push(renderOpaqueBlock(opaqueRegion.raw, createNodeId("opaque"), "Resume Items"));
      index = opaqueRegion.endIndex;
      continue;
    }

    if (commandName.name === "section" || commandName.name === "subsection" || commandName.name === "subsubsection") {
      const sectionCommand = readCommandArguments(body, index, 1);
      if (!sectionCommand) {
        const opaqueRegion = consumeOpaqueRegion(body, index);
        htmlSegments.push(renderOpaqueBlock(opaqueRegion.raw, createNodeId("opaque")));
        index = opaqueRegion.endIndex;
        continue;
      }

      const tag = commandName.name === "section" ? "h1" : commandName.name === "subsection" ? "h2" : "h3";
      htmlSegments.push(`<${tag}>${escapeHtml(normalizeLatexText(sectionCommand.args[0]))}</${tag}>`);
      index = sectionCommand.endIndex;
      continue;
    }

    if (commandName.name === "maketitle") {
      htmlSegments.push(renderLatexTitleBlock(createNodeId("latex-title"), {
        author: preambleAuthor,
        date: preambleDate,
        title: preambleTitle || "Untitled",
      }));
      index = commandName.endIndex;
      continue;
    }

    if (commandName.name === "resumeSummary") {
      const summaryCommand = readCommandArguments(body, index, 1);
      if (summaryCommand) {
        htmlSegments.push(renderResumeSummary(createNodeId("resume-summary"), summaryCommand.args[0].replace(/\\\\/g, "\n").trim()));
        index = summaryCommand.endIndex;
        continue;
      }
    }

    if (commandName.name === "resumeSkills") {
      const skillsCommand = readCommandArguments(body, index, 1);
      if (skillsCommand) {
        const skillData = parseSkillRow(skillsCommand.args[0]);
        htmlSegments.push(renderResumeSkillRow(createNodeId("resume-skill"), skillData));
        index = skillsCommand.endIndex;
        continue;
      }
    }

    if (["resumeCommunity", "resumeEmployment", "resumeSubheading", "resumeProject", "resumeResearch", "resumeTalk"].includes(commandName.name)) {
      const argCount = commandName.name === "resumeResearch"
        ? 5
        : commandName.name === "resumeCommunity"
          ? 3
        : commandName.name === "resumeProject"
          ? 2
          : commandName.name === "resumeTalk"
            ? 2
            : 4;
      const entryCommand = readCommandArguments(body, index, argCount);

      if (entryCommand) {
        let scanIndex = skipWhitespaceAndComments(body, entryCommand.endIndex);
        const itemList = parseResumeItems(body, scanIndex);
        if (itemList.found) {
          scanIndex = skipWhitespaceAndComments(body, itemList.endIndex);
        }

        const commonAttrs = {
          commandName: commandName.name,
          details: itemList.details,
          title: normalizeLatexText(entryCommand.args[0] || ""),
        };

        if (commandName.name === "resumeProject") {
          htmlSegments.push(renderResumeEntry(createNodeId("resume-entry"), {
            ...commonAttrs,
            description: normalizeLatexText(entryCommand.args[1] || ""),
          }));
        } else if (commandName.name === "resumeCommunity") {
          htmlSegments.push(renderResumeEntry(createNodeId("resume-entry"), {
            ...commonAttrs,
            subtitle: normalizeLatexText(entryCommand.args[2] || ""),
            trailingText: normalizeLatexText(entryCommand.args[1] || ""),
          }));
        } else if (commandName.name === "resumeResearch") {
          htmlSegments.push(renderResumeEntry(createNodeId("resume-entry"), {
            ...commonAttrs,
            description: normalizeLatexText(entryCommand.args[3] || ""),
            subtitle: normalizeLatexText(entryCommand.args[2] || ""),
            tertiaryText: normalizeLatexText(entryCommand.args[4] || ""),
            trailingText: normalizeLatexText(entryCommand.args[1] || ""),
          }));
        } else if (commandName.name === "resumeTalk") {
          htmlSegments.push(renderResumeEntry(createNodeId("resume-entry"), {
            ...commonAttrs,
            trailingText: normalizeLatexText(entryCommand.args[1] || ""),
          }));
        } else {
          htmlSegments.push(renderResumeEntry(createNodeId("resume-entry"), {
            ...commonAttrs,
            subtitle: normalizeLatexText(entryCommand.args[2] || ""),
            tertiaryText: normalizeLatexText(entryCommand.args[3] || ""),
            trailingText: normalizeLatexText(entryCommand.args[1] || ""),
          }));
        }

        index = scanIndex;
        continue;
      }
    }

    if (commandName.name === "begin") {
      const beginCommand = readCommandArguments(body, index, 1);
      const envName = beginCommand?.args[0];
      if (beginCommand && envName === "abstract") {
        const environment = readEnvironment(body, index, envName);
        if (environment) {
          const abstractContent = environment.raw
            .replace(/^\\begin\{abstract\}/, "")
            .replace(/\\end\{abstract\}$/, "")
            .trim();
          htmlSegments.push(renderLatexAbstract(createNodeId("latex-abstract"), normalizeLatexText(abstractContent)));
          index = environment.endIndex;
          continue;
        }
      }

      if (beginCommand && envName && ALLOWED_GENERIC_ENVIRONMENTS.has(envName)) {
        const environment = readEnvironment(body, index, envName);
        if (environment) {
          htmlSegments.push(convertGenericChunk(environment.raw, createNodeId));
          index = environment.endIndex;
          continue;
        }
      }
    }

    const opaqueRegion = consumeOpaqueRegion(body, index);
    htmlSegments.push(renderOpaqueBlock(opaqueRegion.raw, createNodeId("opaque")));
    index = opaqueRegion.endIndex;
  }

  return {
    html: htmlSegments.filter(Boolean).join("\n"),
    metadata: {
      postamble: parts.postamble,
      preamble: parts.preamble,
      profile,
      sources: {},
    },
  };
};
