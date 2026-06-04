import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import EditorWorkspace from "@/components/editor/EditorWorkspace";
import { I18nContext } from "@/i18n/I18nProvider";

const renderWorkspace = (overrides: Record<string, unknown> = {}) => {
  const baseProps: Record<string, unknown> = {
    activeMode: "markdown",
    fileInputRef: createRef<HTMLInputElement>(),
    findReplaceProps: {
      editor: null,
      onClose: vi.fn(),
      open: false,
      plainTextAdapter: null,
    },
    headerProps: {
      autoSaveState: { error: null, lastSavedAt: null, status: "saved" },
      availableModes: ["markdown", "latex", "html", "json", "yaml"],
      countWithSpaces: true,
      fileName: "Test Doc",
      importState: { error: null, fileName: null, progress: null, status: "idle" },
      isDark: false,
      isFullscreen: false,
      loadFileTitle: "Load file",
      mode: "markdown",
      onCopyHtml: vi.fn(),
      onCopyJson: vi.fn(),
      onCopyMd: vi.fn(),
      onCopyShareLink: vi.fn(),
      onCopyYaml: vi.fn(),
      onFileNameChange: vi.fn(),
      onLoad: vi.fn(),
      onModeChange: vi.fn(),
      onOpenAiAssistant: vi.fn(),
      onOpenPatchReview: vi.fn(),
      onOpenShare: vi.fn(),
      onOpenShortcuts: vi.fn(),
      onPrint: vi.fn(),
      onUserProfileChange: vi.fn(),
      onSaveAdoc: vi.fn(),
      onSaveDocsy: vi.fn(),
      onSaveHtml: vi.fn(),
      onSaveJson: vi.fn(),
      onSaveMd: vi.fn(),
      onSavePdf: vi.fn(),
      onSaveRst: vi.fn(),
      onSaveTex: vi.fn(),
      onSaveTypst: vi.fn(),
      onSaveYaml: vi.fn(),
      onToggleCountMode: vi.fn(),
      onToggleFullscreen: vi.fn(),
      onTogglePreview: vi.fn(),
      onToggleTheme: vi.fn(),
      patchCount: 0,
      previewOpen: false,
      showStructuredModeAction: false,
      textStats: { charCount: 10, lines: 1, paragraphs: 1, readingTimeMin: 1, wordCount: 2 },
      userProfile: "advanced",
    },
    onFileChange: vi.fn(),
    patchReviewDialogProps: {
      acceptedPatchCount: 0,
      onAccept: vi.fn(),
      onAcceptSelected: vi.fn(),
      onApply: vi.fn(),
      onClear: vi.fn(),
      onEdit: vi.fn(),
      lastApplyReport: null,
      onLoadPatchSet: vi.fn(),
      onOpenChange: vi.fn(),
      onReject: vi.fn(),
      onRejectSelected: vi.fn(),
      open: false,
      patchSet: null,
    },
    previewOpen: false,
    previewProps: {
      editorHtml: "<p>Preview</p>",
      editorLatex: "",
      editorMarkdown: "",
      editorMode: "markdown",
      fileName: "Test Doc",
      onClose: vi.fn(),
      rawContent: "# Test",
    },
    renderEditor: () => <div data-testid="editor-body">Editor body</div>,
    shareLinkDialogProps: {
      link: null,
      onCopy: vi.fn(),
      onOpenChange: vi.fn(),
      open: false,
    },
    shortcutsModalProps: {
      onOpenChange: vi.fn(),
      open: false,
    },
    sidebarProps: {
      activeDoc: {
        content: "# Test",
        createdAt: 1,
        id: "doc-1",
        mode: "markdown",
        name: "Test Doc",
        updatedAt: 1,
      },
      activeDocId: "doc-1",
      capabilities: {
        canAccessHistory: true,
        canAccessKnowledge: true,
        canAccessStructuredModes: true,
      },
      createDocument: vi.fn(),
      documents: [
        {
          content: "# Test",
          createdAt: 1,
          id: "doc-1",
          mode: "markdown",
          name: "Test Doc",
          updatedAt: 1,
        },
      ],
      historyEnabled: false,
      historyProps: {
        activeDoc: {
          content: "# Test",
          createdAt: 1,
          id: "doc-1",
          mode: "markdown",
          name: "Test Doc",
          updatedAt: 1,
        },
        onRestoreVersionSnapshot: vi.fn(),
        versionHistoryReady: false,
        versionHistoryRestoring: false,
        versionHistorySnapshots: [],
        versionHistorySyncing: false,
      },
      knowledgeEnabled: false,
      knowledgeProps: {
        onSuggestKnowledgeImpactUpdate: vi.fn(),
        onSuggestKnowledgeUpdates: vi.fn(),
      },
      onActivateHistory: vi.fn(),
      onActivateKnowledge: vi.fn(),
      onDeleteDoc: vi.fn(),
      onNewDoc: vi.fn(),
      onRenameDoc: vi.fn(),
      onSelectDoc: vi.fn(),
      showStructuredCreateAction: false,
    },
    tabsProps: {
      activeDocId: "doc-1",
      documents: [
        {
          content: "# Test",
          createdAt: 1,
          id: "doc-1",
          mode: "markdown",
          name: "Test Doc",
          updatedAt: 1,
        },
      ],
      onCloseDoc: vi.fn(),
      onNewDoc: vi.fn(),
      onSelectDoc: vi.fn(),
    },
    templateDialogProps: {
      onOpenChange: vi.fn(),
      onSelect: vi.fn(),
      open: false,
    },
  };

  return render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <I18nContext.Provider
        value={{
          locale: "en",
          setLocale: vi.fn(),
          t: (key) => key,
        }}
      >
        <EditorWorkspace {...(baseProps as any)} {...overrides} />
      </I18nContext.Provider>
    </MemoryRouter>,
  );
};

describe("EditorWorkspace", () => {
  it("keeps editor content visible when template dialog is opened", async () => {
    renderWorkspace({
      templateDialogProps: {
        onOpenChange: vi.fn(),
        onSelect: vi.fn(),
        open: true,
      },
    });

    expect(screen.getByTestId("editor-body")).toBeInTheDocument();
  }, 15000);

  it("keeps editor content visible when patch review dialog is opened", async () => {
    renderWorkspace({
      patchReviewDialogProps: {
        acceptedPatchCount: 0,
        onAccept: vi.fn(),
        onAcceptSelected: vi.fn(),
        onApply: vi.fn(),
        onClear: vi.fn(),
        onEdit: vi.fn(),
        lastApplyReport: null,
        onLoadPatchSet: vi.fn(),
        onOpenChange: vi.fn(),
        onReject: vi.fn(),
        onRejectSelected: vi.fn(),
        open: true,
        patchSet: null,
      },
    });

    expect(screen.getByTestId("editor-body")).toBeInTheDocument();
  }, 15000);

  it("keeps editor content visible when share dialog is opened", async () => {
    renderWorkspace({
      shareLinkDialogProps: {
        link: null,
        onCopy: vi.fn(),
        onOpenChange: vi.fn(),
        open: true,
      },
    });

    expect(screen.getByTestId("editor-body")).toBeInTheDocument();
  }, 15000);
});
