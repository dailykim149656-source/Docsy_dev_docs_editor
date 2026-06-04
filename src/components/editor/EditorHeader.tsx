import {
  Braces,
  Check,
  ChevronDown,
  Cloud,
  Copy,
  Download,
  Ellipsis,
  Eye,
  FileDown,
  FileText,
  Keyboard,
  Languages,
  Link2,
  Maximize,
  Minimize,
  Moon,
  PanelLeft,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Sparkles,
  Sun,
  Upload,
} from "lucide-react";
import { Link } from "react-router-dom";
import docslyLogoSmall from "@/assets/docsly-logo-small.png";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { DocumentImportState } from "@/hooks/useDocumentIO";
import { useI18n } from "@/i18n/useI18n";
import type { EditorUserProfile } from "@/lib/editor/userProfiles";
import type { Locale } from "@/i18n/types";
import { getEditorModeFamily, type EditorModeFamily } from "@/lib/editor/modeFamilies";
import { getWorkspaceProviderLabel, getWorkspaceSyncBadgeClassName, getWorkspaceSyncLabel } from "@/lib/workspace/workspaceLabels";
import type { AutoSaveIndicatorState, EditorMode } from "@/types/document";
import type { WorkspaceBinding } from "@/types/workspace";

interface EditorHeaderProps {
  autoSaveState: AutoSaveIndicatorState;
  isDark: boolean;
  importState: DocumentImportState;
  onToggleTheme: () => void;
  onSaveDocsy: () => void;
  onOpenShare?: () => void;
  onCopyMd: () => void;
  onCopyHtml: () => void;
  onCopyJson: () => void;
  onCopyYaml: () => void;
  onCopyShareLink?: () => void;
  onSaveMd: () => void;
  onSaveTex: () => void;
  onSaveHtml: () => void;
  onSaveJson: () => void;
  onSaveYaml: () => void;
  onSaveTypst: () => void;
  onSaveAdoc: () => void;
  onSaveRst: () => void;
  onSavePdf: () => void;
  onPrint: () => void;
  onLoad: () => void;
  fileName: string;
  onFileNameChange: (name: string) => void;
  availableModes?: EditorMode[];
  crossFamilyModes?: EditorMode[];
  onCreateDocument?: (mode: EditorMode) => void;
  onOpenStructuredModes?: () => void;
  showStructuredModeAction?: boolean;
  textStats: { charCount: number; wordCount: number; lines: number; paragraphs: number; readingTimeMin: number };
  countWithSpaces?: boolean;
  onToggleCountMode?: () => void;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenPatchReview?: () => void;
  onOpenAiAssistant?: () => void;
  onUserProfileChange: (profile: EditorUserProfile) => void;
  onRequestResetDocuments?: () => void;
  onOpenShortcuts: () => void;
  patchCount?: number;
  previewOpen?: boolean;
  onTogglePreview?: () => void;
  loadFileTitle?: string;
  onOpenWorkspaceConnection?: () => void;
  onOpenWorkspaceExport?: () => void;
  onOpenWorkspaceImport?: () => void;
  onSaveWorkspaceDocument?: () => void;
  workspaceConnected?: boolean;
  workspaceConnectionPending?: boolean;
  workspaceExportEnabled?: boolean;
  workspaceExportPending?: boolean;
  workspaceImportPending?: boolean;
  workspaceSyncPending?: boolean;
  workspaceBinding?: WorkspaceBinding;
  resetDocumentsDisabled?: boolean;
  userProfile: EditorUserProfile;
}

const LOCALES: Locale[] = ["ko", "en"];

const EditorHeader = ({
  autoSaveState,
  isDark,
  importState,
  onToggleTheme,
  onSaveDocsy,
  onOpenShare,
  onCopyMd,
  onCopyHtml,
  onCopyJson,
  onCopyYaml,
  onCopyShareLink,
  onSaveMd,
  onSaveTex,
  onSaveHtml,
  onSaveJson,
  onSaveYaml,
  onSaveTypst,
  onSaveAdoc,
  onSaveRst,
  onSavePdf,
  onPrint,
  onLoad,
  fileName,
  onFileNameChange,
  availableModes = ["markdown", "latex", "html", "json", "yaml"],
  crossFamilyModes = [],
  onCreateDocument,
  onOpenStructuredModes,
  showStructuredModeAction = false,
  textStats,
  countWithSpaces = true,
  onToggleCountMode,
  mode,
  onModeChange,
  isFullscreen,
  onToggleFullscreen,
  onOpenPatchReview,
  onOpenAiAssistant,
  onUserProfileChange,
  onRequestResetDocuments,
  onOpenShortcuts,
  patchCount = 0,
  previewOpen,
  onTogglePreview,
  loadFileTitle,
  onOpenWorkspaceConnection,
  onOpenWorkspaceExport,
  onOpenWorkspaceImport,
  onSaveWorkspaceDocument,
  workspaceConnected = false,
  workspaceConnectionPending = false,
  workspaceExportEnabled = true,
  workspaceExportPending = false,
  workspaceImportPending = false,
  workspaceSyncPending = false,
  workspaceBinding,
  resetDocumentsDisabled = false,
  userProfile,
}: EditorHeaderProps) => {
  const { locale, setLocale, t } = useI18n();
  const { toggleSidebar } = useSidebar();
  const modeExt = mode === "latex" ? ".tex" : mode === "html" ? ".html" : mode === "json" ? ".json" : mode === "yaml" ? ".yaml" : ".md";
  const modeFamily = getEditorModeFamily(mode);
  const currentFamilyLabel = t(`header.modeGroups.${modeFamily}`);
  const renderModeLabel = (editorMode: EditorMode) => (
    editorMode === "markdown"
      ? "Markdown"
      : editorMode === "latex"
        ? "LaTeX"
        : editorMode === "html"
          ? "HTML"
          : editorMode === "json"
            ? "JSON"
            : "YAML"
  );
  const openStructuredMode = (editorMode: "json" | "yaml") => {
    onOpenStructuredModes?.();
    onModeChange(editorMode);
  };
  const handleCrossFamilyAction = (editorMode: EditorMode) => {
    if (modeFamily === "richText" && (editorMode === "json" || editorMode === "yaml")) {
      onOpenStructuredModes?.();
    }

    onCreateDocument?.(editorMode);
  };
  const lastSavedLabel = autoSaveState.lastSavedAt
    ? new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(autoSaveState.lastSavedAt))
    : null;
  const autoSaveTone = autoSaveState.status === "error"
    ? "border-destructive/30 bg-destructive/10 text-destructive"
    : autoSaveState.status === "saving"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  const autoSaveLabel = autoSaveState.status === "error"
    ? t("header.autosave.failed")
    : autoSaveState.status === "saving"
      ? t("header.autosave.saving")
      : t("header.autosave.saved");
  const importTone = importState.status === "error"
    ? "border-destructive/30 bg-destructive/10 text-destructive"
    : "border-primary/30 bg-primary/10 text-primary";
  const importLabel = importState.status === "reading"
    ? t("header.import.reading", { name: importState.fileName || t("common.untitled") })
    : t("header.import.failed");
  const showMobileStatusRow = importState.status !== "idle" || autoSaveState.status !== "saved";
  const workspaceProviderLabel = getWorkspaceProviderLabel(workspaceBinding);
  const workspaceSyncLabel = getWorkspaceSyncLabel(workspaceBinding);
  const workspaceSyncTone = getWorkspaceSyncBadgeClassName(workspaceBinding);
  const showWorkspaceExportAction = Boolean(onOpenWorkspaceExport) && !workspaceBinding;
  const showWorkspaceSyncAction = Boolean(onSaveWorkspaceDocument) && Boolean(workspaceBinding);
  const shouldShowCrossFamilyCreateActions = crossFamilyModes.length > 0 && Boolean(onCreateDocument);
  const shouldShowStructuredSwitchActions = showStructuredModeAction && !shouldShowCrossFamilyCreateActions;
  const isAdvancedProfile = userProfile === "advanced";
  const userProfileLabel = t(`header.userProfile.${userProfile}`);
  const nextUserProfile = isAdvancedProfile ? "beginner" : "advanced";
  const toggleUserProfileTitle = t(
    isAdvancedProfile ? "header.userProfile.toggleToBeginner" : "header.userProfile.toggleToAdvanced",
  );

  return (
    <header className="border-b border-border bg-background">
      <div className="flex min-h-12 w-full flex-wrap items-start justify-between gap-2 px-2 py-1 sm:px-4 sm:py-1 xl:flex-nowrap xl:items-center">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            onClick={toggleSidebar}
            title={t("header.toggleSidebar")}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
          <Link to="/" className="hidden min-w-0 shrink-0 items-center gap-2 transition-opacity hover:opacity-80 sm:flex">
            <img src={docslyLogoSmall} alt={t("common.appName")} className="h-6 w-6" />
            <span className="mr-1 text-sm font-bold text-foreground">{t("common.appName")}</span>
          </Link>
          <img src={docslyLogoSmall} alt={t("common.appName")} className="h-5 w-5 shrink-0 sm:hidden" />
          <span className="hidden text-muted-foreground sm:inline">|</span>
          <input
            value={fileName}
            onChange={(event) => onFileNameChange(event.target.value)}
            className="min-w-0 flex-1 w-full max-w-[11rem] border-none bg-transparent text-sm font-medium text-foreground outline-none focus:ring-0 sm:max-w-[14rem] lg:max-w-[18rem]"
            placeholder={t("common.untitled")}
          />
          <span className="shrink-0 text-xs text-muted-foreground">{modeExt}</span>
          {workspaceBinding && workspaceProviderLabel && workspaceSyncLabel && (
            <div className={`hidden rounded-full border px-2 py-1 text-[10px] font-medium md:inline-flex ${workspaceSyncTone}`}>
              {workspaceProviderLabel} • {workspaceSyncLabel}
            </div>
          )}

          <div className="ml-2 hidden items-center gap-2 md:flex">
            <div
              className={`rounded-full border px-2 py-1 text-[10px] font-medium ${autoSaveTone}`}
              title={autoSaveState.status === "error"
                ? autoSaveState.error || t("header.autosave.failed")
                : lastSavedLabel
                  ? t("header.autosave.lastSaved", { value: lastSavedLabel })
                  : autoSaveLabel}
            >
              {autoSaveLabel}
            </div>
            {importState.status !== "idle" && (
              <div
                className={`max-w-[220px] truncate rounded-full border px-2 py-1 text-[10px] font-medium ${importTone}`}
                title={importState.error || importLabel}
              >
                {importState.status === "reading"
                  ? `${importLabel}${typeof importState.progress === "number" ? ` · ${t("header.import.progress", { progress: importState.progress })}` : ""}`
                  : importLabel}
              </div>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="h-7 min-w-0 shrink-0 gap-1 px-2 text-xs"
                data-visual-target="header-mode-trigger"
                size="sm"
                title={`${currentFamilyLabel}: ${renderModeLabel(mode)}`}
                variant="outline"
              >
                {modeFamily === "structured" ? <Braces className="h-3.5 w-3.5" /> : null}
                {renderModeLabel(mode)}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {currentFamilyLabel}
              </DropdownMenuLabel>
              {availableModes.map((editorMode) => (
                <DropdownMenuItem
                  key={editorMode}
                  onClick={() => onModeChange(editorMode)}
                  className={`text-xs ${mode === editorMode ? "bg-accent" : ""}`}
                >
                  {mode === editorMode ? <Check className="mr-2 h-3.5 w-3.5" /> : <span className="mr-2 h-3.5 w-3.5" />}
                  {renderModeLabel(editorMode)}
                </DropdownMenuItem>
              ))}
              {shouldShowCrossFamilyCreateActions || shouldShowStructuredSwitchActions ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {t(`header.modeGroups.${modeFamily === "richText" ? "structured" : "richText"}`)}
                  </DropdownMenuLabel>
                  {shouldShowCrossFamilyCreateActions ? (
                    crossFamilyModes.map((editorMode) => (
                      <DropdownMenuItem
                        key={`create-${editorMode}`}
                        onClick={() => handleCrossFamilyAction(editorMode)}
                        className="text-xs"
                      >
                        <Plus className="mr-2 h-3.5 w-3.5" />
                        {t("header.newMode", { mode: renderModeLabel(editorMode) })}
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <>
                      <DropdownMenuItem onClick={() => openStructuredMode("json")} className="text-xs">
                        JSON
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openStructuredMode("yaml")} className="text-xs">
                        YAML
                      </DropdownMenuItem>
                    </>
                  )}
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-0.5 sm:gap-1 xl:w-auto xl:flex-nowrap">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onToggleCountMode}
                  className="mr-1 hidden items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground md:inline-flex"
                  title={t("header.stats.hint")}
                  type="button"
                >
                  <span>{textStats.charCount}{t("header.stats.chars")}</span>
                  <span className="text-muted-foreground/60">/</span>
                  <span>{textStats.wordCount}{t("header.stats.words")}</span>
                  <span className="text-muted-foreground/60">/</span>
                  <span>{textStats.lines}{t("header.stats.lines")}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <div className="flex flex-col gap-0.5">
                  <span>
                    {t("header.stats.charCount", { count: textStats.charCount })}
                    {countWithSpaces
                      ? ` (${t("header.stats.withSpaces")})`
                      : ` (${t("header.stats.withoutSpaces")})`}
                  </span>
                  <span>{t("header.stats.wordCount", { count: textStats.wordCount })}</span>
                  <span>{t("header.stats.lineCount", { count: textStats.lines })}</span>
                  <span>{t("header.stats.paragraphCount", { count: textStats.paragraphs })}</span>
                  <span>{t("header.stats.readingTimeValue", { minutes: textStats.readingTimeMin })}</span>
                  <span className="mt-1 text-muted-foreground">{t("header.stats.hint")}</span>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button
            variant="ghost"
            size="sm"
            disabled={importState.status === "reading"}
            onClick={onLoad}
            title={loadFileTitle || t("header.loadFile")}
            className="h-8 w-8 p-0"
          >
            <Upload className="h-4 w-4" />
          </Button>

          {onOpenWorkspaceConnection && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  className="h-8 gap-1 px-2"
                  data-visual-target="header-google-menu"
                  size="sm"
                  title={workspaceConnected ? "Google Workspace connected" : "Google Workspace"}
                  type="button"
                  variant={workspaceConnected ? "secondary" : "outline"}
                >
                  <Cloud className="h-4 w-4" />
                  <span className="hidden text-xs sm:inline">Google</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Google Workspace
                </DropdownMenuLabel>
                <DropdownMenuItem data-visual-target="workspace-manage-connection" disabled={workspaceConnectionPending} onClick={onOpenWorkspaceConnection}>
                  <Link2 className="mr-2 h-4 w-4" />
                  {workspaceConnectionPending
                    ? "Google..."
                    : workspaceConnected
                      ? "Manage Connection"
                      : "Connect Google"}
                </DropdownMenuItem>
                {onOpenWorkspaceImport && (
                  <DropdownMenuItem
                    data-visual-target="workspace-import-drive"
                    disabled={!workspaceConnected || workspaceImportPending}
                    onClick={() => onOpenWorkspaceImport()}
                  >
                    <FileDown className="mr-2 h-4 w-4" />
                    {workspaceImportPending ? "Importing..." : "Import from Google Drive"}
                  </DropdownMenuItem>
                )}
                {showWorkspaceExportAction && (
                  <DropdownMenuItem
                    data-visual-target="workspace-export-google"
                    disabled={!workspaceConnected || workspaceExportPending || !workspaceExportEnabled}
                    onClick={() => onOpenWorkspaceExport?.()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {workspaceExportPending ? "Exporting..." : "Export to Google Docs"}
                  </DropdownMenuItem>
                )}
                {showWorkspaceSyncAction && (
                  <DropdownMenuItem
                    data-visual-target="workspace-save-google"
                    disabled={!workspaceConnected || workspaceSyncPending}
                    onClick={() => onSaveWorkspaceDocument?.()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {workspaceSyncPending ? "Saving..." : "Save to Google Docs"}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" title={t("header.export")} className="h-8 gap-1 px-2">
                <Download className="h-4 w-4" />
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onSaveDocsy} className="gap-2 text-sm">
                <FileDown className="h-4 w-4" />
                Docsy (.docsy)
              </DropdownMenuItem>
              {onOpenShare && (
                <DropdownMenuItem onClick={onOpenShare} className="gap-2 text-sm">
                  <QrCode className="h-4 w-4" />
                  {t("header.clipboard.share")}
                </DropdownMenuItem>
              )}
              {onCopyShareLink && (
                <DropdownMenuItem onClick={onCopyShareLink} className="gap-2 text-sm">
                  <Link2 className="h-4 w-4" />
                  {t("header.clipboard.shareLink")}
                </DropdownMenuItem>
              )}
              {(onOpenShare || onCopyShareLink) && <DropdownMenuSeparator />}
              {(mode === "markdown" || mode === "latex" || mode === "html") && (
                <>
                  <DropdownMenuItem onClick={onCopyMd} className="gap-2 text-sm">
                    <Copy className="h-4 w-4" />
                    {t("header.clipboard.markdown")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onCopyHtml} className="gap-2 text-sm">
                    <Copy className="h-4 w-4" />
                    {t("header.clipboard.html")}
                  </DropdownMenuItem>
                </>
              )}
              {(mode === "json" || mode === "yaml") && (
                <>
                  <DropdownMenuItem onClick={onCopyJson} className="gap-2 text-sm">
                    <Copy className="h-4 w-4" />
                    {t("header.clipboard.json")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onCopyYaml} className="gap-2 text-sm">
                    <Copy className="h-4 w-4" />
                    {t("header.clipboard.yaml")}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              {mode === "markdown" && (
                <DropdownMenuItem onClick={onSaveMd} className="gap-2 text-sm">
                  <FileDown className="h-4 w-4" />
                  {t("header.downloads.markdown")}
                </DropdownMenuItem>
              )}
              {(mode === "json" || mode === "yaml") && (
                <>
                  <DropdownMenuItem onClick={onSaveJson} className="gap-2 text-sm">
                    <FileDown className="h-4 w-4" />
                    JSON (.json)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onSaveYaml} className="gap-2 text-sm">
                    <FileDown className="h-4 w-4" />
                    YAML (.yaml)
                  </DropdownMenuItem>
                </>
              )}
              {mode !== "json" && mode !== "yaml" && (
                <>
                  {mode !== "markdown" && (
                    <DropdownMenuItem onClick={onSaveMd} className="gap-2 text-sm">
                      <FileDown className="h-4 w-4" />
                      {t("header.downloads.markdown")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={onSaveTex} className="gap-2 text-sm">
                    <FileDown className="h-4 w-4" />
                    {t("header.downloads.latex")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onSaveHtml} className="gap-2 text-sm">
                    <FileDown className="h-4 w-4" />
                    {t("header.downloads.html")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onSaveTypst} className="gap-2 text-sm">
                    <FileDown className="h-4 w-4" />
                    {t("header.downloads.typst")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onSaveAdoc} className="gap-2 text-sm">
                    <FileDown className="h-4 w-4" />
                    {t("header.downloads.asciidoc")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onSaveRst} className="gap-2 text-sm">
                    <FileDown className="h-4 w-4" />
                    {t("header.downloads.rst")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onSavePdf} className="gap-2 text-sm">
                    <FileText className="h-4 w-4" />
                    {t("header.downloads.pdf")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onPrint} className="gap-2 text-sm">
                    <Printer className="h-4 w-4" />
                    {t("header.downloads.print")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {mode !== "json" && mode !== "yaml" && onTogglePreview && (
            <Button
              variant={previewOpen ? "secondary" : "ghost"}
              size="sm"
              onClick={onTogglePreview}
              title={t("header.preview")}
              className="h-8 w-8 p-0"
            >
              <Eye className="h-4 w-4" />
            </Button>
          )}

          {isAdvancedProfile && mode !== "json" && mode !== "yaml" && onOpenAiAssistant && (
            <Button
              className="h-8 w-8 p-0"
              data-visual-target="header-open-ai-assistant"
              onClick={onOpenAiAssistant}
              size="sm"
              title={t("header.aiAssistant")}
              variant="ghost"
            >
              <Sparkles className="h-4 w-4" />
            </Button>
          )}

          <Button
            className="h-8 gap-1 px-2 text-xs"
            onClick={() => onUserProfileChange(nextUserProfile)}
            size="sm"
            title={toggleUserProfileTitle}
            type="button"
            variant={isAdvancedProfile ? "secondary" : "outline"}
          >
            {userProfileLabel}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" title={t("common.language.menu")} className="hidden h-8 gap-1 px-2 sm:inline-flex">
                <Languages className="h-4 w-4" />
                <span className="text-[10px] font-semibold uppercase">{locale}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              {LOCALES.map((nextLocale) => (
                <DropdownMenuItem
                  key={nextLocale}
                  className={locale === nextLocale ? "bg-accent" : ""}
                  onClick={() => setLocale(nextLocale)}
                >
                  {t(`common.language.${nextLocale}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenShortcuts}
            title={t("header.shortcuts")}
            className="hidden h-8 w-8 p-0 sm:flex"
          >
            <Keyboard className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleFullscreen}
            title={t("header.fullscreen")}
            className="hidden h-8 w-8 p-0 sm:flex"
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleTheme}
            title={isDark ? t("header.lightMode") : t("header.darkMode")}
            className="hidden h-8 w-8 p-0 sm:flex"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          {isAdvancedProfile && onOpenPatchReview && (
            <Button className="hidden h-8 px-2 text-xs sm:inline-flex" data-visual-target="header-open-patch-review" onClick={onOpenPatchReview} size="sm" type="button" variant="ghost">
              {t("header.patchReview")}
              {patchCount > 0 ? ` (${patchCount})` : ""}
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={t("header.moreActions")}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                title={t("header.moreActions")}
              >
                <Ellipsis className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {isAdvancedProfile && onOpenPatchReview && (
                <DropdownMenuItem data-visual-target="header-open-patch-review-menu" onClick={onOpenPatchReview}>
                  {t("header.patchReview")}
                  {patchCount > 0 ? ` (${patchCount})` : ""}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onOpenShortcuts}>{t("header.shortcuts")}</DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleFullscreen}>{t("header.fullscreen")}</DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleTheme}>
                {isDark ? t("header.lightMode") : t("header.darkMode")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {LOCALES.map((nextLocale) => (
                <DropdownMenuItem
                  key={nextLocale}
                  className={locale === nextLocale ? "bg-accent" : ""}
                  onClick={() => setLocale(nextLocale)}
                >
                  {t(`common.language.${nextLocale}`)}
                </DropdownMenuItem>
              ))}
              {onRequestResetDocuments && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className={!resetDocumentsDisabled ? "text-destructive focus:text-destructive" : undefined}
                    disabled={resetDocumentsDisabled}
                    onClick={() => onRequestResetDocuments()}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {t("resetDocuments.action")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {showMobileStatusRow && (
        <div className="flex items-center gap-2 overflow-x-auto px-2 pb-2 md:hidden">
          <div
            className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-medium ${autoSaveTone}`}
            title={autoSaveState.status === "error"
              ? autoSaveState.error || t("header.autosave.failed")
              : lastSavedLabel
                ? t("header.autosave.lastSaved", { value: lastSavedLabel })
                : autoSaveLabel}
          >
            {autoSaveLabel}
          </div>
          {importState.status !== "idle" && (
            <div
              className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-medium ${importTone}`}
              title={importState.error || importLabel}
            >
              {importState.status === "reading"
                ? `${importLabel}${typeof importState.progress === "number" ? ` · ${t("header.import.progress", { progress: importState.progress })}` : ""}`
                : importLabel}
            </div>
          )}
        </div>
      )}
      {!showMobileStatusRow && workspaceBinding && workspaceProviderLabel && workspaceSyncLabel && (
        <div className="flex items-center gap-2 overflow-x-auto px-2 pb-2 md:hidden">
          <div className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-medium ${workspaceSyncTone}`}>
            {workspaceProviderLabel} • {workspaceSyncLabel}
          </div>
        </div>
      )}
    </header>
  );
};

export default EditorHeader;
