import { ArrowRight, Network, RefreshCcw, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/useI18n";
import type { SourceChangeRecord, SourceChangeType } from "@/lib/knowledge/sourceFingerprint";
import type { KnowledgeImpactQueueItem, KnowledgeRelatedDocument } from "@/lib/knowledge/workspaceInsights";

interface ChangeMonitoringPanelProps {
  changedSources: SourceChangeRecord[];
  impactQueue: KnowledgeImpactQueueItem[];
  isRescanning: boolean;
  lastRescannedAt: number | null;
  onOpenDocument: (documentId: string) => void;
  onRefreshDocument?: (documentId: string) => void;
  onOpenGraph?: (request: {
    context: "change";
    nodeDocumentId: string;
    sourceDocumentId: string;
    targetDocumentId: string;
  }) => void;
  onRescan: () => void;
  onSuggestUpdates?: (sourceDocumentId: string, targetDocumentId: string) => void;
}

const formatTimestamp = (timestamp: number | null) =>
  timestamp === null
    ? "Never"
    : new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(timestamp);

const relationReasonKey = (relation: KnowledgeRelatedDocument["relationKinds"][number]) => {
  switch (relation) {
    case "references":
      return "knowledge.impactReasonReferences";
    case "referenced_by":
      return "knowledge.impactReasonReferencedBy";
    case "similar":
      return "knowledge.impactReasonSimilar";
    case "duplicate":
      return "knowledge.impactReasonDuplicate";
    default:
      return "knowledge.impactReasonSimilar";
  }
};

const relationLabelKey = (relation: KnowledgeRelatedDocument["relationKinds"][number]) => {
  switch (relation) {
    case "references":
      return "knowledge.relationReferences";
    case "referenced_by":
      return "knowledge.relationReferencedBy";
    case "similar":
      return "knowledge.relationSimilar";
    case "duplicate":
      return "knowledge.relationDuplicate";
    default:
      return "knowledge.relationSimilar";
  }
};

const changeTypeLabelKey = (changeType: SourceChangeType) =>
  changeType === "new"
    ? "knowledge.changeMonitoringNew"
    : "knowledge.changeMonitoringChanged";

const priorityLabel = (item: KnowledgeImpactQueueItem) => {
  if (item.relationKinds.includes("referenced_by") || item.issueCount > 0) {
    return "P1";
  }

  if (item.relationKinds.includes("duplicate")) {
    return "P2";
  }

  return "P3";
};

const priorityClassName = (priority: string) => {
  switch (priority) {
    case "P1":
      return "border-amber-500/40 bg-amber-500/5 text-amber-600 dark:text-amber-400";
    case "P2":
      return "border-blue-500/30 bg-blue-500/5 text-blue-600 dark:text-blue-400";
    default:
      return "border-border/60 bg-background text-muted-foreground";
  }
};

const ChangeMonitoringPanel = ({
  changedSources,
  impactQueue,
  isRescanning,
  lastRescannedAt,
  onOpenDocument,
  onRefreshDocument,
  onOpenGraph,
  onRescan,
  onSuggestUpdates,
}: ChangeMonitoringPanelProps) => {
  const { t } = useI18n();
  const describeRelations = (relationKinds: KnowledgeImpactQueueItem["relationKinds"]) =>
    relationKinds.map((relation) => t(relationReasonKey(relation))).join(" / ");

  return (
    <section className="space-y-3 rounded-lg border border-border/60 bg-background/70 p-3 group-data-[collapsible=icon]:hidden">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {t("knowledge.changeMonitoringTitle")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("knowledge.changeMonitoringDescription")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onSuggestUpdates && (
            <Button
              className="h-7 gap-1 text-xs"
              disabled={impactQueue.length === 0 || isRescanning}
              onClick={() => {
                impactQueue.forEach((item) => {
                  onSuggestUpdates(item.changedDocumentId, item.impactedDocumentId);
                });
              }}
              size="sm"
              variant="outline"
            >
              <ScanSearch className="h-3 w-3" />
              {t("knowledge.changeMonitoringQueueAll")}
            </Button>
          )}
          <Button className="h-7 gap-1 text-xs" onClick={onRescan} size="sm" variant="outline">
            <RefreshCcw className={`h-3 w-3 ${isRescanning ? "animate-spin" : ""}`} />
            {isRescanning ? t("knowledge.changeMonitoringScanning") : t("knowledge.changeMonitoringRescan")}
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        {t("knowledge.changeMonitoringLastRescanned", { value: formatTimestamp(lastRescannedAt) })}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          <span>{t("knowledge.changeMonitoringChangedSources")}</span>
          <span>{changedSources.length}</span>
        </div>
        {changedSources.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
            {t("knowledge.changeMonitoringNoChanges")}
          </div>
        ) : (
          changedSources.map((source) => (
            <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2" key={`${source.documentId}:${source.scannedAt}`}>
              <div className="flex items-center justify-between gap-2">
                <button
                  className="text-left text-xs font-medium text-foreground transition-opacity hover:underline"
                  onClick={() => onOpenDocument(source.documentId)}
                  type="button"
                >
                  {source.documentName}
                </button>
                <div className="flex items-center gap-2">
                  {source.sourceLabel && (
                    <span className="rounded-full border border-border/60 px-2 py-1 text-[11px] text-muted-foreground">
                      {source.sourceLabel}
                    </span>
                  )}
                  <span className="rounded-full border border-border/60 px-2 py-1 text-[11px] text-muted-foreground">
                    {t(changeTypeLabelKey(source.changeType))}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                {source.changeType === "new"
                  ? t("knowledge.changeMonitoringNewDescription")
                  : t("knowledge.changeMonitoringChangedDescription")}
              </p>
              {onRefreshDocument && source.sourceLabel && (
                <div className="mt-2 flex justify-end">
                  <Button
                    className="h-7 text-xs"
                    onClick={() => onRefreshDocument(source.documentId)}
                    size="sm"
                    variant="outline"
                  >
                    Refresh doc
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          <span>{t("knowledge.changeMonitoringImpactQueue")}</span>
          <span>{impactQueue.length}</span>
        </div>
        {impactQueue.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
            {t("knowledge.changeMonitoringNoImpactQueue")}
          </div>
        ) : (
          impactQueue.map((item) => {
            const priority = priorityLabel(item);

            return (
              <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2" key={`${item.changedDocumentId}:${item.impactedDocumentId}`}>
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <button className="hover:underline" onClick={() => onOpenDocument(item.changedDocumentId)} type="button">
                    {item.changedDocumentName}
                  </button>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <button className="hover:underline" onClick={() => onOpenDocument(item.impactedDocumentId)} type="button">
                    {item.impactedDocumentName}
                  </button>
                  <span className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] ${priorityClassName(priority)}`}>
                    {priority}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.relationKinds.map((relationKind) => (
                    <span className="rounded-full border border-border/60 px-2 py-1 text-[11px] text-muted-foreground" key={relationKind}>
                      {t(relationLabelKey(relationKind))}
                    </span>
                  ))}
                  <span className="rounded-full border border-border/60 px-2 py-1 text-[11px] text-muted-foreground">
                    {t("knowledge.issueCount", { count: item.issueCount })}
                  </span>
                  <span className="basis-full text-[11px] leading-4 text-muted-foreground">
                    {describeRelations(item.relationKinds)}
                  </span>
                  <div className="basis-full rounded-md border border-border/60 bg-background px-2 py-2 text-[11px] text-muted-foreground">
                    <div className="font-medium text-foreground">
                      {t("knowledge.changeMonitoringQueueReason", {
                        source: item.changedDocumentName,
                        target: item.impactedDocumentName,
                      })}
                    </div>
                    <p className="mt-1 leading-4">
                      {item.issueCount > 0
                        ? t("knowledge.changeMonitoringQueueIssueHint", { count: item.issueCount })
                        : t("knowledge.changeMonitoringQueueCleanHint")}
                    </p>
                  </div>
                  {onOpenGraph && (
                    <Button
                      className="h-7 gap-1 text-xs"
                      onClick={() => onOpenGraph({
                        context: "change",
                        nodeDocumentId: item.impactedDocumentId,
                        sourceDocumentId: item.changedDocumentId,
                        targetDocumentId: item.impactedDocumentId,
                      })}
                      size="sm"
                      variant="ghost"
                    >
                      <Network className="h-3 w-3" />
                      {t("knowledge.graphExplore")}
                    </Button>
                  )}
                  {onSuggestUpdates && (
                    <Button
                      className="ml-auto h-7 gap-1 text-xs"
                      onClick={() => onSuggestUpdates(item.changedDocumentId, item.impactedDocumentId)}
                      size="sm"
                      variant="outline"
                    >
                      <ScanSearch className="h-3 w-3" />
                      {t("knowledge.changeMonitoringSuggestUpdate")}
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};

export default ChangeMonitoringPanel;
