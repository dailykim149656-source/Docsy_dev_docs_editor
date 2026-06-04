import { Component, type CSSProperties, Suspense, lazy, useEffect, useRef, useState } from "react";
import type { ChangeEventHandler, ComponentProps, ErrorInfo, ReactNode, RefObject } from "react";
import type { EditorMode } from "@/types/document";
import EditorHeader from "@/components/editor/EditorHeader";
import FindReplaceBar from "@/components/editor/FindReplaceBar";
import KeyboardShortcutsModal from "@/components/editor/KeyboardShortcutsModal";
import DocumentTabs from "@/components/editor/DocumentTabs";
import FileSidebar from "@/components/editor/FileSidebar";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { useIsTabletLayout } from "@/hooks/use-mobile";

const SIDEBAR_WIDTH_COOKIE_KEY = "docsy-sidebar-width";
const SIDEBAR_MIN_WIDTH = 400;
const SIDEBAR_MAX_WIDTH = 560;
const SIDEBAR_DEFAULT_WIDTH = 400;
const SIDEBAR_RESIZE_HANDLE_WIDTH = 6;
const SIDEBAR_ICON_WIDTH = 48;

type FileSidebarProps = ComponentProps<typeof FileSidebar>;
type EditorHeaderProps = ComponentProps<typeof EditorHeader>;
type DocumentTabsProps = ComponentProps<typeof DocumentTabs>;
type FindReplaceBarProps = ComponentProps<typeof FindReplaceBar>;
type KeyboardShortcutsModalProps = ComponentProps<typeof KeyboardShortcutsModal>;
type ExportPreviewPanelProps = ComponentProps<(typeof import("@/components/editor/ExportPreviewPanel"))["default"]>;
type TemplateDialogProps = ComponentProps<(typeof import("@/components/editor/TemplateDialog"))["default"]>;
type PatchReviewDialogProps = ComponentProps<(typeof import("@/components/editor/PatchReviewDialog"))["default"]>;

const ExportPreviewPanel = lazy(() => import("@/components/editor/ExportPreviewPanel"));
const PatchReviewDialog = lazy(() => import("@/components/editor/PatchReviewDialog"));
const TemplateDialog = lazy(() => import("@/components/editor/TemplateDialog"));

const PreviewFallback = () => <div className="h-full bg-background" />;
const DialogFallback = () => (
  <div className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
    Dialog unavailable.
  </div>
);

interface LazyDialogBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface LazyDialogBoundaryState {
  hasError: boolean;
}

class LazyDialogBoundary extends Component<LazyDialogBoundaryProps, LazyDialogBoundaryState> {
  state: LazyDialogBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    void _error;
    void _errorInfo;
  }

  componentDidUpdate(previousProps: LazyDialogBoundaryProps) {
    if (this.state.hasError && previousProps.children !== this.props.children) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }

    return this.props.children;
  }
}

interface EditorWorkspaceProps {
  activeMode: EditorMode;
  fileInputRef: RefObject<HTMLInputElement | null>;
  headerProps: EditorHeaderProps;
  sidebarProps: FileSidebarProps;
  tabsProps: DocumentTabsProps;
  findReplaceProps: FindReplaceBarProps;
  previewOpen: boolean;
  previewProps: ExportPreviewPanelProps;
  renderEditor: () => ReactNode;
  shortcutsModalProps: KeyboardShortcutsModalProps;
  patchReviewDialogProps: PatchReviewDialogProps;
  templateDialogProps: TemplateDialogProps;
  onFileChange: ChangeEventHandler<HTMLInputElement>;
}

const EditorWorkspace = ({
  activeMode,
  fileInputRef,
  headerProps,
  sidebarProps,
  tabsProps,
  findReplaceProps,
  previewOpen,
  previewProps,
  renderEditor,
  shortcutsModalProps,
  patchReviewDialogProps,
  templateDialogProps,
  onFileChange,
}: EditorWorkspaceProps) => {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === "undefined") {
      return SIDEBAR_DEFAULT_WIDTH;
    }

    const savedWidth = Number.parseInt(localStorage.getItem(SIDEBAR_WIDTH_COOKIE_KEY) || "", 10);
    if (Number.isFinite(savedWidth) && savedWidth >= SIDEBAR_MIN_WIDTH && savedWidth <= SIDEBAR_MAX_WIDTH) {
      return savedWidth;
    }

    return SIDEBAR_DEFAULT_WIDTH;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const editorWorkspaceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_COOKIE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isResizingSidebar) {
      return;
    }

    const onMouseMove = (event: MouseEvent) => {
      if (!editorWorkspaceRef.current) {
        return;
      }

      const bounds = editorWorkspaceRef.current.getBoundingClientRect();
      const next = Math.round(event.clientX - bounds.left);
      const clampedNext = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, next));
      setSidebarWidth(clampedNext);
    };

    const onMouseUp = () => setIsResizingSidebar(false);

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizingSidebar]);

  const sidebarStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
    "--sidebar-width-icon": `${SIDEBAR_ICON_WIDTH}px`,
    "--sidebar-width-mobile": "min(92vw, 24rem)",
  } as CSSProperties;

  return (
    <SidebarProvider defaultOpen={false} style={sidebarStyle}>
      <EditorWorkspaceLayout
        activeMode={activeMode}
        fileInputRef={fileInputRef}
        headerProps={headerProps}
        sidebarProps={sidebarProps}
        tabsProps={tabsProps}
        findReplaceProps={findReplaceProps}
        previewOpen={previewOpen}
        previewProps={previewProps}
        renderEditor={renderEditor}
        shortcutsModalProps={shortcutsModalProps}
        patchReviewDialogProps={patchReviewDialogProps}
        templateDialogProps={templateDialogProps}
        onFileChange={onFileChange}
        editorWorkspaceRef={editorWorkspaceRef}
        setIsResizingSidebar={setIsResizingSidebar}
        sidebarWidth={sidebarWidth}
      />
    </SidebarProvider>
  );
};

interface EditorWorkspaceLayoutProps {
  activeMode: EditorMode;
  fileInputRef: RefObject<HTMLInputElement | null>;
  headerProps: EditorHeaderProps;
  sidebarProps: FileSidebarProps;
  tabsProps: DocumentTabsProps;
  findReplaceProps: FindReplaceBarProps;
  previewOpen: boolean;
  previewProps: ExportPreviewPanelProps;
  renderEditor: () => ReactNode;
  shortcutsModalProps: KeyboardShortcutsModalProps;
  patchReviewDialogProps: PatchReviewDialogProps;
  templateDialogProps: TemplateDialogProps;
  onFileChange: ChangeEventHandler<HTMLInputElement>;
  editorWorkspaceRef: RefObject<HTMLDivElement>;
  setIsResizingSidebar: (isResizing: boolean) => void;
  sidebarWidth: number;
}

const EditorWorkspaceLayout = ({
  activeMode,
  fileInputRef,
  headerProps,
  sidebarProps,
  tabsProps,
  findReplaceProps,
  previewOpen,
  previewProps,
  renderEditor,
  shortcutsModalProps,
  patchReviewDialogProps,
  templateDialogProps,
  onFileChange,
  editorWorkspaceRef,
  setIsResizingSidebar,
  sidebarWidth,
}: EditorWorkspaceLayoutProps) => {
  const { state, isMobile } = useSidebar();
  const isTabletLayout = useIsTabletLayout();
  const isCollapsed = state === "collapsed";
  const activeSidebarWidth = isCollapsed ? SIDEBAR_ICON_WIDTH : sidebarWidth;
  const showPreviewSheet = isMobile && previewOpen && activeMode !== "json" && activeMode !== "yaml";
  const showSplitPreview = !isMobile && previewOpen && activeMode !== "json" && activeMode !== "yaml";

  return (
    <div className="relative flex h-[100svh] w-full overflow-hidden" data-visual-target="editor-workspace" ref={editorWorkspaceRef}>
      <FileSidebar {...sidebarProps} />
      {!isMobile && !isCollapsed && (
        <div
          className="absolute z-20 h-full w-2 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-border/70"
          title="좌측 사이드바 너비 조절"
          onMouseDown={(event) => {
            event.preventDefault();
            setIsResizingSidebar(true);
          }}
          style={{
            left: `${activeSidebarWidth - SIDEBAR_RESIZE_HANDLE_WIDTH / 2}px`,
          }}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <EditorHeader {...headerProps} />
        <DocumentTabs {...tabsProps} />
        <FindReplaceBar {...findReplaceProps} />
        <div className="flex-1 overflow-hidden">
          {showSplitPreview ? (
            <ResizablePanelGroup direction={isTabletLayout ? "vertical" : "horizontal"} className="h-full">
              <ResizablePanel defaultSize={isTabletLayout ? 58 : 60} minSize={isTabletLayout ? 35 : 30}>
                <div className="h-full overflow-y-auto">
                  {renderEditor()}
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={isTabletLayout ? 42 : 40} minSize={isTabletLayout ? 25 : 20} maxSize={65}>
                <Suspense fallback={<PreviewFallback />}>
                  <ExportPreviewPanel {...previewProps} />
                </Suspense>
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            renderEditor()
          )}
        </div>
        <Sheet
          onOpenChange={(open) => {
            if (!open) {
              previewProps.onClose();
            }
          }}
          open={showPreviewSheet}
        >
          <SheetContent
            className="h-[88svh] gap-0 overflow-hidden rounded-t-2xl border-x-0 border-b-0 px-0 pb-0 pt-6"
            side="bottom"
          >
            <Suspense fallback={<PreviewFallback />}>
              <ExportPreviewPanel {...previewProps} />
            </Suspense>
          </SheetContent>
        </Sheet>
        <input
          ref={fileInputRef}
          accept=".docsy,.md,.markdown,.txt,.tex,.html,.htm,.json,.yaml,.yml,.adoc,.asciidoc,.rst"
          className="hidden"
          onChange={onFileChange}
          type="file"
        />
        <KeyboardShortcutsModal {...shortcutsModalProps} />
        {patchReviewDialogProps.open && (
          <LazyDialogBoundary fallback={<DialogFallback />}>
            <Suspense fallback={null}>
              <PatchReviewDialog {...patchReviewDialogProps} />
            </Suspense>
          </LazyDialogBoundary>
        )}
        {templateDialogProps.open && (
          <LazyDialogBoundary fallback={<DialogFallback />}>
            <Suspense fallback={null}>
              <TemplateDialog {...templateDialogProps} />
            </Suspense>
          </LazyDialogBoundary>
        )}
      </div>
    </div>
  );
};

export default EditorWorkspace;
