import type {
  HeadingLevel,
  HeadingNode,
  InlineNode,
  ParagraphNode,
  TableOfContentsNode,
  DocumentAst,
} from "@/types/documentAst";
import type {
  DocumentPatch,
  DocumentPatchSet,
  PatchAuthor,
  PatchSourceAttribution,
} from "@/types/documentPatch";
import type { GenerateTocEntry } from "@/types/aiAssistant";

export type TocSuggestionConflictCode =
  | "duplicate_headings"
  | "duplicate_toc_placeholders"
  | "existing_toc"
  | "no_headings"
  | "no_promotable_targets"
  | "non_matching_titles"
  | "partial_anchor_match"
  | "unchanged_toc";

export type TocSkippedEntryReason =
  | "ambiguous_partial_match"
  | "missing_anchor_text"
  | "model_unmatched"
  | "no_candidate"
  | "partial_match_only";

interface TocMatchCandidate {
  block: HeadingNode | ParagraphNode;
  blockType: "heading" | "paragraph";
  index: number;
  normalizedText: string;
  text: string;
}

interface TocActionableEntry {
  blockIndex: number;
  blockType: "heading" | "paragraph";
  currentText: string;
  entry: GenerateTocEntry;
  partialAnchorMatch: boolean;
  targetNodeId: string;
}

export interface TocSkippedEntry {
  anchorStrategy: GenerateTocEntry["anchorStrategy"];
  anchorText: string;
  reason: TocSkippedEntryReason;
  title: string;
}

export interface TocSuggestionAnalysis {
  actionableEntries: TocActionableEntry[];
  conflicts: TocSuggestionConflictCode[];
  existingTocNode: TableOfContentsNode | null;
  existingTocNodes: TableOfContentsNode[];
  matchedCount: number;
  partialAnchorMatchCount: number;
  promotedCount: number;
  skippedEntries: TocSkippedEntry[];
  topLevelHeadingCount: number;
}

export interface TocPatchSetRequest {
  analysis: TocSuggestionAnalysis;
  author?: PatchAuthor;
  createdAt?: number;
  documentId: string;
  maxDepth: HeadingLevel;
  patchSetId: string;
  rationale: string;
  sources?: PatchSourceAttribution[];
}

const normalizeHeadingLevel = (value: number | undefined): HeadingLevel => {
  if (value === 1 || value === 2) {
    return value;
  }

  return 3;
};

const normalizeTocText = (value: string) =>
  value
    .toLocaleLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();

const collectInlineText = (nodes: InlineNode[]) =>
  nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return node.text;
        case "hard_break":
          return "\n";
        case "cross_reference":
          return node.targetLabel;
        case "footnote_ref":
          return node.footnoteId;
        case "math_inline":
          return node.latex;
        default:
          return "";
      }
    })
    .join("")
    .trim();

const createTocNode = (nodeId: string, maxDepth: HeadingLevel): TableOfContentsNode => ({
  kind: "block",
  maxDepth,
  nodeId,
  type: "table_of_contents",
});

const createHeadingNode = (
  sourceBlock: HeadingNode | ParagraphNode,
  entry: GenerateTocEntry,
): HeadingNode => ({
  align: sourceBlock.align,
  children: [{ text: entry.title, type: "text" }],
  kind: "block",
  level: entry.level,
  nodeId: sourceBlock.nodeId,
  type: "heading",
});

const buildTopLevelCandidates = (sourceAst: DocumentAst): TocMatchCandidate[] =>
  sourceAst.blocks.flatMap<TocMatchCandidate>((block, index) => {
    if (block.type === "heading") {
      return [{
        block,
        blockType: "heading" as const,
        index,
        normalizedText: normalizeTocText(collectInlineText(block.children)),
        text: collectInlineText(block.children),
      }];
    }

    if (block.type === "paragraph") {
      return [{
        block,
        blockType: "paragraph" as const,
        index,
        normalizedText: normalizeTocText(collectInlineText(block.children)),
        text: collectInlineText(block.children),
      }];
    }

    return [];
  });

const findCandidateMatch = (
  candidates: TocMatchCandidate[],
  normalizedAnchorText: string,
): {
  candidate: TocMatchCandidate | null;
  partialAnchorMatch: boolean;
  reason?: TocSkippedEntryReason;
} => {
  const exactMatches = candidates.filter((candidate) => candidate.normalizedText === normalizedAnchorText);

  if (exactMatches.length > 0) {
    return {
      candidate: exactMatches[0],
      partialAnchorMatch: false,
    };
  }

  const partialMatches = candidates.filter((candidate) =>
    candidate.normalizedText.includes(normalizedAnchorText) || normalizedAnchorText.includes(candidate.normalizedText));

  if (partialMatches.length === 1) {
    return {
      candidate: null,
      partialAnchorMatch: true,
      reason: "partial_match_only",
    };
  }

  return {
    candidate: null,
    partialAnchorMatch: partialMatches.length > 1,
    reason: partialMatches.length > 1 ? "ambiguous_partial_match" : "no_candidate",
  };
};

const createPatch = (patch: DocumentPatch): DocumentPatch => patch;

export const analyzeTocSuggestion = (
  sourceAst: DocumentAst,
  entries: GenerateTocEntry[],
  maxDepth: HeadingLevel,
): TocSuggestionAnalysis => {
  const conflicts = new Set<TocSuggestionConflictCode>();
  const topLevelCandidates = buildTopLevelCandidates(sourceAst);
  const topLevelHeadings = topLevelCandidates.filter((candidate) => candidate.blockType === "heading");
  const topLevelParagraphs = topLevelCandidates.filter((candidate) => candidate.blockType === "paragraph");
  const headingTitleSet = new Set(topLevelHeadings.map((candidate) => candidate.normalizedText).filter(Boolean));
  const duplicateHeadingTitleSet = new Set<string>();
  const seenHeadingTitles = new Set<string>();
  const existingTocNodes = sourceAst.blocks.filter((block): block is TableOfContentsNode => block.type === "table_of_contents");
  const usedNodeIds = new Set<string>();
  const actionableEntries: TocActionableEntry[] = [];
  const skippedEntries: TocSkippedEntry[] = [];

  for (const heading of topLevelHeadings) {
    if (!heading.normalizedText) {
      continue;
    }

    if (seenHeadingTitles.has(heading.normalizedText)) {
      duplicateHeadingTitleSet.add(heading.normalizedText);
      continue;
    }

    seenHeadingTitles.add(heading.normalizedText);
  }

  if (topLevelHeadings.length === 0) {
    conflicts.add("no_headings");
  }

  if (duplicateHeadingTitleSet.size > 0) {
    conflicts.add("duplicate_headings");
  }

  if (entries.some((entry) => !headingTitleSet.has(normalizeTocText(entry.title)))) {
    conflicts.add("non_matching_titles");
  }

  if (existingTocNodes.length > 0) {
    conflicts.add("existing_toc");
  }

  if (existingTocNodes.length > 1) {
    conflicts.add("duplicate_toc_placeholders");
  }

  if (existingTocNodes[0] && normalizeHeadingLevel(existingTocNodes[0].maxDepth) === maxDepth) {
    conflicts.add("unchanged_toc");
  }

  for (const entry of entries) {
    const anchorText = entry.anchorText.trim();

    if (entry.anchorStrategy === "unmatched") {
      skippedEntries.push({
        anchorStrategy: entry.anchorStrategy,
        anchorText,
        reason: "model_unmatched",
        title: entry.title,
      });
      continue;
    }

    if (anchorText.length === 0) {
      skippedEntries.push({
        anchorStrategy: entry.anchorStrategy,
        anchorText,
        reason: "missing_anchor_text",
        title: entry.title,
      });
      continue;
    }

    const candidatePool = entry.anchorStrategy === "existing_heading"
      ? topLevelHeadings
      : topLevelParagraphs;
    const unusedCandidates = candidatePool.filter((candidate) => !usedNodeIds.has(candidate.block.nodeId));
    const { candidate, partialAnchorMatch, reason } = findCandidateMatch(unusedCandidates, normalizeTocText(anchorText));

    if (!candidate) {
      skippedEntries.push({
        anchorStrategy: entry.anchorStrategy,
        anchorText,
        reason: reason || "no_candidate",
        title: entry.title,
      });
      continue;
    }

    usedNodeIds.add(candidate.block.nodeId);
    actionableEntries.push({
      blockIndex: candidate.index,
      blockType: candidate.blockType,
      currentText: candidate.text,
      entry,
      partialAnchorMatch,
      targetNodeId: candidate.block.nodeId,
    });
  }

  const partialAnchorMatchCount = actionableEntries.filter((entry) => entry.partialAnchorMatch).length
    + skippedEntries.filter((entry) =>
      entry.reason === "ambiguous_partial_match" || entry.reason === "partial_match_only").length;

  if (partialAnchorMatchCount > 0) {
    conflicts.add("partial_anchor_match");
  }

  if (actionableEntries.length === 0 && existingTocNodes.length === 0) {
    conflicts.add("no_promotable_targets");
  } else if (actionableEntries.length === 0 && topLevelCandidates.length === 0) {
    conflicts.add("no_promotable_targets");
  } else if (actionableEntries.length === 0 && topLevelCandidates.length > 0) {
    conflicts.add("no_promotable_targets");
  }

  return {
    actionableEntries,
    conflicts: Array.from(conflicts),
    existingTocNode: existingTocNodes[0] || null,
    existingTocNodes,
    matchedCount: actionableEntries.filter((entry) => entry.blockType === "heading").length,
    partialAnchorMatchCount,
    promotedCount: actionableEntries.filter((entry) => entry.blockType === "paragraph").length,
    skippedEntries,
    topLevelHeadingCount: topLevelHeadings.length,
  };
};

const buildHeadingPatches = (
  sourceAst: DocumentAst,
  request: TocPatchSetRequest,
): DocumentPatch[] => request.analysis.actionableEntries
  .slice()
  .sort((left, right) => left.blockIndex - right.blockIndex)
  .flatMap((entry, index) => {
    const sourceBlock = sourceAst.blocks[entry.blockIndex];

    if (!sourceBlock || (sourceBlock.type !== "heading" && sourceBlock.type !== "paragraph")) {
      return [];
    }

    const patchId = `${request.patchSetId}-patch-${String(index + 1).padStart(3, "0")}`;
    const targetHeading = createHeadingNode(sourceBlock, entry.entry);
    const originalLevel = sourceBlock.type === "heading" ? sourceBlock.level : undefined;
    const titleChanged = entry.currentText !== entry.entry.title;
    const levelChanged = originalLevel !== undefined && originalLevel !== entry.entry.level;
    const isPromotion = sourceBlock.type === "paragraph";

    if (!isPromotion && !titleChanged && !levelChanged) {
      return [];
    }

    return [createPatch({
      author: request.author ?? "ai",
      confidence: 0.72,
      operation: "replace_node",
      originalText: entry.currentText,
      patchId,
      payload: {
        kind: "replace_node",
        node: targetHeading,
      },
      reason: request.rationale,
      sources: request.sources,
      status: "pending",
      suggestedText: entry.entry.title,
      summary: isPromotion
        ? `Promote a top-level block into the heading "${entry.entry.title}".`
        : `Update the heading "${entry.currentText}" to match the TOC structure.`,
      target: {
        nodeId: sourceBlock.nodeId,
        targetType: "node",
      },
      title: isPromotion
        ? `Promote block to heading: ${entry.entry.title}`
        : `Update heading: ${entry.entry.title}`,
    })];
  });

const buildTocStructurePatches = (
  sourceAst: DocumentAst,
  request: TocPatchSetRequest,
  nextPatchNumber: number,
): DocumentPatch[] => {
  const primaryTocNode = request.analysis.existingTocNode;
  const tocNode = createTocNode(
    primaryTocNode?.nodeId || `${request.patchSetId}-toc-node`,
    request.maxDepth,
  );
  const patches: DocumentPatch[] = [];
  let patchNumber = nextPatchNumber;

  if (primaryTocNode) {
    if (normalizeHeadingLevel(primaryTocNode.maxDepth) !== request.maxDepth) {
      patches.push(createPatch({
        author: request.author ?? "ai",
        confidence: 0.72,
        operation: "replace_node",
        originalText: `TOC depth ${normalizeHeadingLevel(primaryTocNode.maxDepth)}`,
        patchId: `${request.patchSetId}-patch-${String(patchNumber).padStart(3, "0")}`,
        payload: {
          kind: "replace_node",
          node: tocNode,
        },
        reason: request.rationale,
        sources: request.sources,
        status: "pending",
        suggestedText: `TOC depth ${request.maxDepth}`,
        summary: `Refresh the table of contents placeholder to depth ${request.maxDepth}.`,
        target: {
          nodeId: primaryTocNode.nodeId,
          targetType: "node",
        },
        title: `Refresh table of contents (depth ${request.maxDepth})`,
      }));
      patchNumber += 1;
    }
  } else {
    const anchorEntry = request.analysis.actionableEntries
      .slice()
      .sort((left, right) => left.blockIndex - right.blockIndex)[0];
    const anchorBlock = anchorEntry ? sourceAst.blocks[anchorEntry.blockIndex] : null;

    if (anchorBlock && (anchorBlock.type === "heading" || anchorBlock.type === "paragraph")) {
      patches.push(createPatch({
        author: request.author ?? "ai",
        confidence: 0.72,
        operation: "insert_before",
        patchId: `${request.patchSetId}-patch-${String(patchNumber).padStart(3, "0")}`,
        payload: {
          kind: "insert_nodes",
          nodes: [tocNode],
        },
        reason: request.rationale,
        sources: request.sources,
        status: "pending",
        suggestedText: request.maxDepth === 3 ? "[[toc]]" : `[[toc:${request.maxDepth}]]`,
        summary: "Insert a single table of contents placeholder before the generated heading structure.",
        target: {
          nodeId: anchorBlock.nodeId,
          targetType: "node",
        },
        title: `Insert table of contents (depth ${request.maxDepth})`,
      }));
      patchNumber += 1;
    }
  }

  request.analysis.existingTocNodes.slice(1).forEach((tocNodeToDelete) => {
    patches.push(createPatch({
      author: request.author ?? "ai",
      confidence: 0.72,
      operation: "delete_node",
      originalText: `TOC depth ${normalizeHeadingLevel(tocNodeToDelete.maxDepth)}`,
      patchId: `${request.patchSetId}-patch-${String(patchNumber).padStart(3, "0")}`,
      reason: request.rationale,
      sources: request.sources,
      status: "pending",
      summary: "Remove an extra table of contents placeholder so only one remains in the document.",
      target: {
        nodeId: tocNodeToDelete.nodeId,
        targetType: "node",
      },
      title: "Remove duplicate table of contents",
    }));
    patchNumber += 1;
  });

  return patches;
};

const buildPatchSetDescription = (
  totalPatchCount: number,
  matchedCount: number,
  promotedCount: number,
  tocPatchCount: number,
  skippedCount: number,
) => {
  if (totalPatchCount === 0) {
    return skippedCount > 0
      ? "The TOC suggestion could not be safely anchored to the current document."
      : "The TOC suggestion already matches the current document structure.";
  }

  const parts: string[] = [];

  if (promotedCount > 0) {
    parts.push(`promote ${promotedCount} block${promotedCount === 1 ? "" : "s"} to heading${promotedCount === 1 ? "" : "s"}`);
  }

  if (matchedCount > 0) {
    parts.push(`reuse ${matchedCount} existing heading${matchedCount === 1 ? "" : "s"}`);
  }

  if (tocPatchCount > 0) {
    parts.push("refresh the table of contents");
  }

  const lead = parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;

  return `Apply the TOC suggestion by ${lead}.`;
};

export const buildTocPatchSetWithAst = (
  sourceAst: DocumentAst,
  request: TocPatchSetRequest,
): DocumentPatchSet => {
  const author = request.author ?? "ai";
  const createdAt = request.createdAt ?? Date.now();

  if (request.analysis.actionableEntries.length === 0 && request.analysis.topLevelHeadingCount === 0) {
    return {
      author,
      createdAt,
      description: "The TOC suggestion could not be safely anchored to the current document.",
      documentId: request.documentId,
      patchSetId: request.patchSetId,
      patches: [],
      status: "draft",
      title: "AI TOC structure update",
    };
  }

  const headingPatches = buildHeadingPatches(sourceAst, request);
  const tocPatches = buildTocStructurePatches(sourceAst, request, headingPatches.length + 1);
  const patches = [...headingPatches, ...tocPatches];

  return {
    author,
    createdAt,
    description: buildPatchSetDescription(
      patches.length,
      request.analysis.matchedCount,
      request.analysis.promotedCount,
      tocPatches.length,
      request.analysis.skippedEntries.length,
    ),
    documentId: request.documentId,
    patchSetId: request.patchSetId,
    patches,
    status: "draft",
    title: "AI TOC structure update",
  };
};
