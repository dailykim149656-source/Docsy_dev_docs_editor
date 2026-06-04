import { ArrowUpRight, FileSearch, GitCompareArrows, Link2, Network, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/useI18n";
import type { KnowledgeDocumentImpact, KnowledgeRelatedDocument } from "@/lib/knowledge/workspaceInsights";

interface DocumentImpactPanelProps {
  impact: KnowledgeDocumentImpact | null;
  onOpenDocument: (documentId: string) => void;
  onOpenGraph?: (request: {
    context: "impact";
    nodeDocumentId: string;
    sourceDocumentId: string;
    targetDocumentId: string;
  }) => void;
  onSuggestUpdates?: (documentId: string) => void;
  suggestableDocumentIds: string[];
}

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

const DocumentImpactPanel = ({
  impact,
  onOpenDocument,
  onOpenGraph,
  onSuggestUpdates,
  suggestableDocumentIds,
}: DocumentImpactPanelProps) => {
  const { t } = useI18n();
  const describeRelations = (relationKinds: KnowledgeRelatedDocument["relationKinds"]) =>
    relationKinds.map((relation) => t(relationReasonKey(relation))).join(" / ");

  return (
    <div className="space-y-3 group-data-[collapsible=icon]:hidden">
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <FileSearch className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">{t("knowledge.impactTitle")}</span>
        </div>
        <p className="text-[11px] leading-4 text-muted-foreground">
          {t("knowledge.impactDescription")}
        </p>
      </div>

      {!impact ? (
        <div className="rounded-md border border-dashed border-border px-2 py-3 text-[11px] leading-4 text-muted-foreground">
          {t("knowledge.impactEmpty")}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border border-border/60 px-2 py-1.5">
              <div className="text-[10px] text-muted-foreground">{t("knowledge.impactInbound")}</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{impact.inboundReferenceCount}</div>
            </div>
            <div className="rounded-md border border-border/60 px-2 py-1.5">
              <div className="text-[10px] text-muted-foreground">{t("knowledge.impactOutbound")}</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{impact.outboundReferenceCount}</div>
            </div>
            <div className="rounded-md border border-border/60 px-2 py-1.5">
              <div className="text-[10px] text-muted-foreground">{t("knowledge.impactIssues")}</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{impact.issues.length}</div>
            </div>
          </div>

          {impact.relatedDocuments.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-2 py-3 text-[11px] leading-4 text-muted-foreground">
              {t("knowledge.relatedEmpty")}
            </div>
          ) : (
            <div className="space-y-2">
              {impact.relatedDocuments.slice(0, 5).map((document, index) => {
                const canSuggestUpdates = Boolean(onSuggestUpdates) && suggestableDocumentIds.includes(document.documentId);
                const emphasisClass = index === 0
                  ? "border-primary/40 bg-primary/5"
                  : index < 3
                    ? "border-border/60 bg-muted/10"
                    : "border-border/60";

                return (
                  <div className={`rounded-md border px-2 py-2 ${emphasisClass}`} key={document.documentId}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-foreground">{document.name}</div>
                        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                          {describeRelations(document.relationKinds)}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge className="h-5 rounded-full px-1.5 text-[10px]" variant={index === 0 ? "default" : "outline"}>
                            {document.recommendationScore}%
                          </Badge>
                          {document.relationKinds.map((relation) => (
                            <Badge className="h-5 rounded-full px-1.5 text-[10px]" key={`${document.documentId}-${relation}`} variant="secondary">
                              {t(relationLabelKey(relation))}
                            </Badge>
                          ))}
                          {document.issueCount > 0 && (
                            <Badge className="h-5 rounded-full px-1.5 text-[10px]" variant="outline">
                              <ShieldAlert className="mr-1 h-3 w-3" />
                              {t("knowledge.issueCount", { count: document.issueCount })}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {onOpenGraph && (
                          <Button
                            className="h-6 px-2 text-[10px]"
                            onClick={() => onOpenGraph({
                              context: "impact",
                              nodeDocumentId: document.documentId,
                              sourceDocumentId: impact.documentId,
                              targetDocumentId: document.documentId,
                            })}
                            size="sm"
                            variant="ghost"
                          >
                            <Network className="mr-1 h-3 w-3" />
                            {t("knowledge.graphExplore")}
                          </Button>
                        )}
                        <Button
                          className="h-6 px-2 text-[10px]"
                          onClick={() => onOpenDocument(document.documentId)}
                          size="sm"
                          variant="ghost"
                        >
                          <ArrowUpRight className="mr-1 h-3 w-3" />
                          {t("knowledge.open")}
                        </Button>
                        {onSuggestUpdates && (
                          <Button
                            className="h-6 px-2 text-[10px]"
                            disabled={!canSuggestUpdates}
                            onClick={() => onSuggestUpdates(document.documentId)}
                            size="sm"
                            variant="outline"
                          >
                            <GitCompareArrows className="mr-1 h-3 w-3" />
                            {t("knowledge.suggest")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {impact.paths.length > 0 && (
            <div className="space-y-2 rounded-md border border-border/60 px-2 py-2">
              <div className="text-[11px] font-medium text-foreground">
                {t("knowledge.impactChainTitle")}
              </div>
              <div className="space-y-1.5">
                {impact.paths.slice(0, 6).map((path) => (
                  <div className="rounded-md border border-border/40 bg-background px-2 py-2" key={`${path.depth}:${path.viaDocumentId || "direct"}:${path.targetDocumentId}`}>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Badge className="h-5 rounded-full px-1.5 text-[10px]" variant="outline">
                        {path.depth === 1 ? t("knowledge.impactDirect") : t("knowledge.impactTwoHop")}
                      </Badge>
                      {path.relationKinds.map((relation) => (
                        <Badge className="h-5 rounded-full px-1.5 text-[10px]" key={`${path.targetDocumentId}-${path.depth}-${relation}`} variant="secondary">
                          {t(relationLabelKey(relation))}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-foreground">
                      {path.viaDocumentName
                        ? `${path.viaDocumentName} -> ${path.targetDocumentName}`
                        : path.targetDocumentName}
                    </div>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                      {path.viaDocumentName
                        ? `${t("knowledge.impactVia", { name: path.viaDocumentName })} / ${describeRelations(path.relationKinds)}`
                        : describeRelations(path.relationKinds)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {impact.issues.length > 0 && (
            <div className="rounded-md border border-dashed border-border px-2 py-2">
              <div className="flex items-center gap-1 text-[11px] font-medium text-foreground">
                <Link2 className="h-3 w-3 text-muted-foreground" />
                {t("knowledge.impactNeedsAttention", { count: impact.impactedDocumentCount })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DocumentImpactPanel;
