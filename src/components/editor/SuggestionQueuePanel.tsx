import { useMemo, useState } from "react";
import { ArrowRight, Clock3, FileStack, LoaderCircle, Network, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/i18n/useI18n";
import type { KnowledgeSuggestionQueueItem } from "@/components/editor/sidebarFeatureTypes";

interface SuggestionQueuePanelProps {
  entries: KnowledgeSuggestionQueueItem[];
  onDismiss: (id: string) => void;
  onOpenDocument: (documentId: string) => void;
  onOpenGraph: (id: string) => void;
  onOpenPatchReview: (id: string) => void;
  onRetry: (id: string) => void;
}

type QueueFilter = "all" | KnowledgeSuggestionQueueItem["status"];

const statusLabelKey = (status: KnowledgeSuggestionQueueItem["status"]) => {
  switch (status) {
    case "queued":
      return "knowledge.suggestionQueueQueued";
    case "running":
      return "knowledge.suggestionQueueRunning";
    case "ready":
      return "knowledge.suggestionQueueReady";
    case "failed":
    default:
      return "knowledge.suggestionQueueFailed";
  }
};

const contextLabelKey = (context: KnowledgeSuggestionQueueItem["context"]) => {
  switch (context) {
    case "change":
      return "knowledge.graphChainContextChange";
    case "consistency":
      return "knowledge.graphChainContextConsistency";
    case "impact":
    default:
      return "knowledge.graphChainContextImpact";
  }
};

const priorityClassName = (priority?: KnowledgeSuggestionQueueItem["issuePriority"]) => {
  switch (priority) {
    case "high":
      return "border-amber-500/40 bg-amber-500/5 text-amber-600 dark:text-amber-400";
    case "medium":
      return "border-blue-500/30 bg-blue-500/5 text-blue-600 dark:text-blue-400";
    case "low":
      return "border-border/60 bg-background text-muted-foreground";
    default:
      return "border-border/60 bg-background text-muted-foreground";
  }
};

const priorityLabel = (priority?: KnowledgeSuggestionQueueItem["issuePriority"]) => {
  switch (priority) {
    case "high":
      return "P1";
    case "medium":
      return "P2";
    case "low":
      return "P3";
    default:
      return null;
  }
};

const confidenceLabelKey = (confidence?: KnowledgeSuggestionQueueItem["confidenceLabel"]) => {
  switch (confidence) {
    case "high":
      return "knowledge.suggestionQueueConfidenceHigh";
    case "medium":
      return "knowledge.suggestionQueueConfidenceMedium";
    case "low":
      return "knowledge.suggestionQueueConfidenceLow";
    default:
      return null;
  }
};

const filterLabelKey = (filter: QueueFilter) => {
  switch (filter) {
    case "queued":
      return "knowledge.suggestionQueueQueued";
    case "running":
      return "knowledge.suggestionQueueRunning";
    case "ready":
      return "knowledge.suggestionQueueReady";
    case "failed":
      return "knowledge.suggestionQueueFailed";
    case "all":
    default:
      return "knowledge.suggestionQueueFilterAll";
  }
};

const statusOrder: Record<KnowledgeSuggestionQueueItem["status"], number> = {
  failed: 0,
  running: 1,
  ready: 2,
  queued: 3,
};

const priorityOrder: Record<NonNullable<KnowledgeSuggestionQueueItem["issuePriority"]>, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const issueKindLabelKey = (issueKind?: KnowledgeSuggestionQueueItem["issueKind"]) => {
  switch (issueKind) {
    case "changed_section":
      return "knowledge.consistencyKindChanged";
    case "conflicting_procedure":
      return "knowledge.consistencyKindConflict";
    case "missing_section":
      return "knowledge.consistencyKindMissing";
    default:
      return null;
  }
};

const contextHintKey = (context: KnowledgeSuggestionQueueItem["context"]) => {
  switch (context) {
    case "change":
      return "knowledge.suggestionQueueHintChange";
    case "consistency":
      return "knowledge.suggestionQueueHintConsistency";
    case "impact":
    default:
      return "knowledge.suggestionQueueHintImpact";
  }
};

const SuggestionQueuePanel = ({
  entries,
  onDismiss,
  onOpenDocument,
  onOpenGraph,
  onOpenPatchReview,
  onRetry,
}: SuggestionQueuePanelProps) => {
  const { t } = useI18n();
  const [filter, setFilter] = useState<QueueFilter>("all");
  const failedCount = entries.filter((entry) => entry.status === "failed").length;
  const readyCount = entries.filter((entry) => entry.status === "ready").length;
  const runningCount = entries.filter((entry) => entry.status === "running").length;
  const queuedCount = entries.filter((entry) => entry.status === "queued").length;
  const visibleEntries = useMemo(
    () => entries
      .filter((entry) => filter === "all" || entry.status === filter)
      .sort((left, right) =>
        statusOrder[left.status] - statusOrder[right.status]
        || (priorityOrder[left.issuePriority || "low"] - priorityOrder[right.issuePriority || "low"])
        || left.updatedAt - right.updatedAt
        || left.targetDocumentName.localeCompare(right.targetDocumentName)
        || left.sourceDocumentName.localeCompare(right.sourceDocumentName)),
    [entries, filter],
  );

  return (
    <section className="space-y-3 rounded-lg border border-border/60 bg-background/70 p-3 group-data-[collapsible=icon]:hidden" data-testid="suggestion-queue-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {t("knowledge.suggestionQueueTitle")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("knowledge.suggestionQueueDescription")}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-1 text-[11px] text-muted-foreground">
          <Clock3 className="h-3 w-3" />
          {entries.length}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span>{t("knowledge.suggestionQueueRunningCount", { count: runningCount })}</span>
        <span>{t("knowledge.suggestionQueueReadyCount", { count: readyCount })}</span>
        <span>{t("knowledge.suggestionQueueFailedCount", { count: failedCount })}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {([
          ["all", entries.length],
          ["ready", readyCount],
          ["running", runningCount],
          ["failed", failedCount],
          ["queued", queuedCount],
        ] as Array<[QueueFilter, number]>).map(([value, count]) => (
          <Button
            className="h-7 px-2 text-[11px]"
            key={value}
            onClick={() => setFilter(value)}
            size="sm"
            type="button"
            variant={filter === value ? "secondary" : "ghost"}
          >
            {t(filterLabelKey(value))} ({count})
          </Button>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
          {t("knowledge.suggestionQueueEmpty")}
        </div>
      ) : (
        <ScrollArea className="h-[280px] rounded-md border border-border/60">
          <div className="space-y-2 p-2">
            {visibleEntries.map((entry) => (
              <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2" key={entry.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{t(contextLabelKey(entry.context))}</Badge>
                      <Badge variant={entry.status === "ready" ? "secondary" : "outline"}>
                        {t(statusLabelKey(entry.status))}
                      </Badge>
                      {priorityLabel(entry.issuePriority) && (
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${priorityClassName(entry.issuePriority)}`}>
                          {priorityLabel(entry.issuePriority)}
                        </span>
                      )}
                      {issueKindLabelKey(entry.issueKind) && (
                        <Badge variant="outline">{t(issueKindLabelKey(entry.issueKind) || "")}</Badge>
                      )}
                      {confidenceLabelKey(entry.confidenceLabel) && (
                        <Badge variant="outline">{t(confidenceLabelKey(entry.confidenceLabel) || "")}</Badge>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs font-medium text-foreground">
                      <button className="truncate hover:underline" data-testid={`suggestion-queue-source-${entry.id}`} onClick={() => onOpenDocument(entry.sourceDocumentId)} type="button">
                        {entry.sourceDocumentName}
                      </button>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <button className="truncate hover:underline" data-testid={`suggestion-queue-target-${entry.id}`} onClick={() => onOpenDocument(entry.targetDocumentId)} type="button">
                        {entry.targetDocumentName}
                      </button>
                    </div>
                    {entry.patchSetTitle && (
                      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                        {entry.patchSetTitle}
                      </p>
                    )}
                    <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                      {t(contextHintKey(entry.context))}
                    </p>
                    {entry.reasonSummary && (
                      <p className="mt-2 text-[11px] leading-4 text-foreground/80">
                        {entry.reasonSummary}
                      </p>
                    )}
                    {entry.issueId && (
                      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                        {t("knowledge.suggestionQueueIssue", { id: entry.issueId })}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                      {t("knowledge.suggestionQueueAttempts", { count: entry.attemptCount })}
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                      {t("knowledge.suggestionQueueAge", {
                        count: Math.max(0, Math.round((Date.now() - entry.updatedAt) / 60_000)),
                      })}
                    </p>
                    {entry.errorMessage && (
                      <p className="mt-2 text-[11px] leading-4 text-amber-600 dark:text-amber-400">
                        {entry.errorMessage}
                      </p>
                    )}
                    {entry.status === "running" && (
                      <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <LoaderCircle className="h-3 w-3 animate-spin" />
                        {t("knowledge.suggestionQueueRunningHint")}
                      </div>
                    )}
                    {entry.status === "ready" && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <FileStack className="h-3 w-3" />
                        {t("knowledge.suggestionQueuePatchCount", { count: entry.patchCount || 0 })}
                        {typeof entry.sourceCount === "number" && (
                          <span>{t("knowledge.suggestionQueueSourceCount", { count: entry.sourceCount })}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <Button
                    aria-label={t("knowledge.suggestionQueueDismiss")}
                    className="h-7 w-7 shrink-0 p-0"
                    onClick={() => onDismiss(entry.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    className="h-7 text-xs"
                    data-testid={`suggestion-queue-open-graph-${entry.id}`}
                    onClick={() => onOpenGraph(entry.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Network className="mr-1 h-3 w-3" />
                    {t("knowledge.graphExplore")}
                  </Button>
                  <Button
                    className="h-7 text-xs"
                    disabled={entry.status === "running"}
                    onClick={() => onRetry(entry.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {t(entry.status === "failed"
                      ? "knowledge.suggestionQueueRetry"
                      : "knowledge.suggestionQueueRerun")}
                  </Button>
                  <Button
                    className="h-7 text-xs"
                    disabled={!entry.hasPatchSet}
                    data-testid={`suggestion-queue-open-review-${entry.id}`}
                    onClick={() => onOpenPatchReview(entry.id)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t("knowledge.suggestionQueueOpenReview")}
                  </Button>
                </div>
              </div>
            ))}
            {visibleEntries.length === 0 && (
              <div className="rounded-md border border-dashed border-border/60 px-3 py-3 text-xs text-muted-foreground">
                {t("knowledge.suggestionQueueFilterEmpty")}
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </section>
  );
};

export default SuggestionQueuePanel;
