import { useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, GitCompare, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/useI18n";
import type { DocumentComparisonDelta } from "@/lib/ai/compareDocuments";
import type { KnowledgeConsistencyIssue } from "@/lib/knowledge/consistencyAnalysis";

interface ConsistencySuggestionRequest {
  issueId: string;
  issueKind: KnowledgeConsistencyIssue["kind"];
  issuePriority: KnowledgeConsistencyIssue["actionPriority"];
  issueReason: string;
  sourceDocumentId: string;
  sourceDocumentName: string;
  targetDocumentId: string;
  targetDocumentName: string;
}

interface ConsistencyIssuesPanelProps {
  activeDocumentId: string;
  activeDocumentName: string;
  issues: KnowledgeConsistencyIssue[];
  onOpenDocument: (documentId: string) => void;
  onOpenGraph?: (request: {
    context: "consistency";
    issueId: string;
    issueKind: KnowledgeConsistencyIssue["kind"];
    issuePriority: KnowledgeConsistencyIssue["actionPriority"];
    issueReason: string;
    nodeDocumentId: string;
    sourceDocumentId: string;
    targetDocumentId: string;
  }) => void;
  onSuggestUpdates?: (request: ConsistencySuggestionRequest) => Promise<unknown> | unknown;
  suggestableDocumentIds: string[];
}

const KIND_LABEL_KEYS: Record<KnowledgeConsistencyIssue["kind"], string> = {
  changed_section: "knowledge.consistencyKindChanged",
  conflicting_procedure: "knowledge.consistencyKindConflict",
  missing_section: "knowledge.consistencyKindMissing",
};

const DELTA_KIND_LABEL_KEYS: Record<DocumentComparisonDelta["kind"], string> = {
  added: "knowledge.consistencyDeltaAdded",
  changed: "knowledge.consistencyDeltaChanged",
  inconsistent: "knowledge.consistencyDeltaInconsistent",
  removed: "knowledge.consistencyDeltaRemoved",
};
const PRIORITY_LABEL: Record<KnowledgeConsistencyIssue["actionPriority"], string> = {
  high: "P1",
  low: "P3",
  medium: "P2",
};
const PRIORITY_STYLE: Record<KnowledgeConsistencyIssue["actionPriority"], string> = {
  high: "border-amber-500/40 bg-amber-500/5 text-amber-600 dark:text-amber-400",
  low: "border-border/60 bg-background text-muted-foreground",
  medium: "border-blue-500/30 bg-blue-500/5 text-blue-600 dark:text-blue-400",
};
const PRIORITY_ORDER: Record<KnowledgeConsistencyIssue["actionPriority"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const ISSUE_CARD_STYLE: Record<KnowledgeConsistencyIssue["kind"], string> = {
  changed_section: "border-blue-500/25 bg-blue-500/5",
  conflicting_procedure: "border-destructive/35 bg-destructive/5",
  missing_section: "border-amber-500/40 bg-amber-500/5",
};

const ISSUE_PILL_STYLE: Record<KnowledgeConsistencyIssue["kind"], string> = {
  changed_section: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  conflicting_procedure: "border-destructive/30 bg-destructive/10 text-destructive",
  missing_section: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

const DELTA_CARD_STYLE: Record<DocumentComparisonDelta["kind"], string> = {
  added: "border-emerald-500/25 bg-emerald-500/5",
  changed: "border-blue-500/25 bg-blue-500/5",
  inconsistent: "border-destructive/35 bg-destructive/5",
  removed: "border-amber-500/35 bg-amber-500/5",
};

const DELTA_PILL_STYLE: Record<DocumentComparisonDelta["kind"], string> = {
  added: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  changed: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  inconsistent: "border-destructive/30 bg-destructive/10 text-destructive",
  removed: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

const getDeltaTitle = (delta: DocumentComparisonDelta) =>
  delta.target?.title || delta.source?.title || "Untitled";

const ConsistencyIssuesPanel = ({
  activeDocumentId,
  activeDocumentName,
  issues,
  onOpenDocument,
  onOpenGraph,
  onSuggestUpdates,
  suggestableDocumentIds,
}: ConsistencyIssuesPanelProps) => {
  const { t } = useI18n();
  const suggestableSet = new Set(suggestableDocumentIds);
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [suggestingIssueId, setSuggestingIssueId] = useState<string | null>(null);
  const orderedIssues = [...issues].sort((left, right) =>
    PRIORITY_ORDER[left.actionPriority] - PRIORITY_ORDER[right.actionPriority]
    || Number(right.severity === "warning") - Number(left.severity === "warning")
    || left.relatedDocumentName.localeCompare(right.relatedDocumentName)
    || left.kind.localeCompare(right.kind),
  );

  const handleSuggestUpdates = (issue: KnowledgeConsistencyIssue) => {
    if (!onSuggestUpdates) {
      return;
    }

    setSuggestingIssueId(issue.id);
    const request: ConsistencySuggestionRequest = {
      issueId: issue.id,
      issueKind: issue.kind,
      issuePriority: issue.actionPriority,
      issueReason: issue.actionReason,
      sourceDocumentId: issue.documentId,
      sourceDocumentName: activeDocumentName,
      targetDocumentId: issue.relatedDocumentId,
      targetDocumentName: issue.relatedDocumentName,
    };

    Promise.resolve(onSuggestUpdates(request))
      .catch(() => undefined)
      .finally(() => {
        setSuggestingIssueId((current) => (current === issue.id ? null : current));
      });
  };

  return (
    <section className="space-y-3 rounded-lg border border-border/60 bg-background/70 p-3 group-data-[collapsible=icon]:hidden">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {t("knowledge.consistencyTitle")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("knowledge.consistencyDescription")}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-1 text-[11px] text-muted-foreground">
          <GitCompare className="h-3 w-3" />
          {orderedIssues.length}
        </div>
      </div>

      {orderedIssues.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
          {t("knowledge.consistencyEmpty")}
        </div>
      ) : (
        <div className="space-y-2">
          {orderedIssues.map((issue) => {
            const canSuggest = Boolean(onSuggestUpdates) && suggestableSet.has(issue.relatedDocumentId);
            const isExpanded = expandedIssueId === issue.id;
            const isSuggesting = suggestingIssueId === issue.id;
            const previewDeltas = issue.comparison.deltas.slice(0, 3);

            return (
              <div className={`rounded-md border px-3 py-2 ${ISSUE_CARD_STYLE[issue.kind]}`} key={issue.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {issue.severity === "warning" ? (
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    {t(KIND_LABEL_KEYS[issue.kind])}
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${ISSUE_PILL_STYLE[issue.kind]}`}>
                      {issue.kind === "conflicting_procedure"
                        ? "Conflict"
                        : issue.kind === "missing_section"
                          ? "Missing"
                          : "Drift"}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${PRIORITY_STYLE[issue.actionPriority]}`}>
                      {PRIORITY_LABEL[issue.actionPriority]}
                    </span>
                  </div>
                  <button
                    className="text-xs text-foreground transition-opacity hover:underline"
                    onClick={() => onOpenDocument(issue.relatedDocumentId)}
                    type="button"
                  >
                    {issue.relatedDocumentName}
                  </button>
                </div>
                <p className="mt-2 text-xs leading-5 text-foreground/90">{issue.message}</p>
                <div className="mt-2 rounded-md border border-border/60 bg-background px-2 py-1.5 text-[11px] text-muted-foreground">
                  {issue.actionReason}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div className={`rounded-md border px-2 py-1.5 text-[11px] ${issue.comparison.counts.removed > 0 ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-border/60 bg-background text-muted-foreground"}`}>
                    {t("knowledge.consistencyRemoved", { count: issue.comparison.counts.removed })}
                  </div>
                  <div className={`rounded-md border px-2 py-1.5 text-[11px] ${issue.comparison.counts.inconsistent > 0 ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border/60 bg-background text-muted-foreground"}`}>
                    {t("knowledge.consistencyInconsistent", { count: issue.comparison.counts.inconsistent })}
                  </div>
                  <div className={`rounded-md border px-2 py-1.5 text-[11px] ${issue.comparison.counts.changed + issue.comparison.counts.added > 0 ? "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300" : "border-border/60 bg-background text-muted-foreground"}`}>
                    {t("knowledge.consistencyChanged", {
                      count: issue.comparison.counts.changed + issue.comparison.counts.added,
                    })}
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {t("knowledge.consistencyReference")} {issue.relatedDocumentName}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <button
                    className="rounded-full border border-border/60 px-2 py-1 text-[10px] text-foreground transition-opacity hover:opacity-80"
                    onClick={() => onOpenDocument(activeDocumentId)}
                    type="button"
                  >
                    {activeDocumentName}
                  </button>
                  <ArrowRight className="h-3 w-3" />
                  <button
                    className="rounded-full border border-border/60 px-2 py-1 text-[10px] text-foreground transition-opacity hover:opacity-80"
                    onClick={() => onOpenDocument(issue.relatedDocumentId)}
                    type="button"
                  >
                    {issue.relatedDocumentName}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    className="h-7 gap-1 text-xs"
                    onClick={() => setExpandedIssueId(isExpanded ? null : issue.id)}
                    size="sm"
                    variant="ghost"
                  >
                    {isExpanded ? t("knowledge.consistencyHide") : t("knowledge.consistencyInspect")}
                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                  {onOpenGraph && (
                    <Button
                      className="h-7 gap-1 text-xs"
                      onClick={() => onOpenGraph({
                        context: "consistency",
                        issueId: issue.id,
                        issueKind: issue.kind,
                        issuePriority: issue.actionPriority,
                        issueReason: issue.actionReason,
                        nodeDocumentId: issue.relatedDocumentId,
                        sourceDocumentId: issue.documentId,
                        targetDocumentId: issue.relatedDocumentId,
                      })}
                      size="sm"
                      variant="ghost"
                    >
                      <Network className="h-3 w-3" />
                      {t("knowledge.graphExplore")}
                    </Button>
                  )}
                  {canSuggest && (
                    <Button
                      className="ml-auto h-7 gap-1 text-xs"
                      disabled={isSuggesting}
                      onClick={() => handleSuggestUpdates(issue)}
                      size="sm"
                      variant="outline"
                    >
                      {isSuggesting ? t("aiDialog.update.loading") : t("knowledge.consistencySuggestPatch")}
                      {!isSuggesting && <ArrowRight className="h-3 w-3" />}
                    </Button>
                  )}
                </div>
                {onSuggestUpdates && !canSuggest && (
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    {t("knowledge.consistencySuggestionUnavailable")}
                  </div>
                )}
                {isExpanded && (
                  <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        {t("knowledge.consistencyDeltaPreview")}
                      </div>
                      <button
                        className="text-[11px] text-foreground transition-opacity hover:underline"
                        onClick={() => onOpenDocument(issue.relatedDocumentId)}
                        type="button"
                      >
                        {t("knowledge.consistencyOpenDocument")}
                      </button>
                    </div>
                    {previewDeltas.length === 0 ? (
                      <div className="rounded-md border border-dashed border-border/60 px-3 py-3 text-xs text-muted-foreground">
                        {t("knowledge.consistencyNoPreview")}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {previewDeltas.map((delta) => (
                          <div className={`rounded-md border px-3 py-3 ${DELTA_CARD_STYLE[delta.kind]}`} key={delta.deltaId}>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-2 py-1 text-[10px] ${DELTA_PILL_STYLE[delta.kind]}`}>
                                {t(DELTA_KIND_LABEL_KEYS[delta.kind])}
                              </span>
                              {delta.kind !== "added" && delta.kind !== "removed" && (
                                <span className="text-[10px] text-muted-foreground">
                                  {t("knowledge.consistencySimilarity", {
                                    score: delta.similarityScore.toFixed(2),
                                  })}
                                </span>
                              )}
                            </div>
                            <div className="mt-2 text-xs font-medium text-foreground">
                              {getDeltaTitle(delta)}
                            </div>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {delta.summary}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                    {canSuggest && (
                      <div className="rounded-md border border-border/60 bg-background px-3 py-2 text-[11px] text-muted-foreground">
                        {t("knowledge.consistencyPatchHint")}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default ConsistencyIssuesPanel;
