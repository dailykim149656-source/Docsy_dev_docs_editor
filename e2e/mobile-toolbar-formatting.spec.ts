import { expect, test } from "@playwright/test";

const AUTOSAVE_KEY = "docsy-autosave-v2";
const DOCUMENT_TOOLS_KEY = "docsy:web:document-tools-enabled";
const UI_LANGUAGE_KEY = "docsy-ui-language";
const USER_PROFILE_KEY = "docsy:web:user-profile";

const createMobileEditorState = () => {
  const now = Date.now();

  return {
    activeDocId: "doc-mobile-format",
    documents: [
      {
        content: "# Mobile Formatting\n\nApply mobile formatting target text here.",
        createdAt: now - 5000,
        id: "doc-mobile-format",
        mode: "markdown",
        name: "Mobile Formatting",
        sourceSnapshots: {
          markdown: "# Mobile Formatting\n\nApply mobile formatting target text here.",
        },
        storageKind: "docsy",
        updatedAt: now - 1000,
      },
    ],
    lastSaved: now,
    version: 2,
  };
};

test("mobile toolbar preserves selection for bold and exposes the mobile format sheet", async ({ page }) => {
  const autosaveState = createMobileEditorState();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(({ autosaveKey, autosaveState, documentToolsKey, uiLanguageKey, userProfileKey }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(uiLanguageKey, "en");
    localStorage.setItem(userProfileKey, "advanced");
    localStorage.setItem(documentToolsKey, "true");
    localStorage.setItem(autosaveKey, JSON.stringify(autosaveState));
  }, {
    autosaveKey: AUTOSAVE_KEY,
    autosaveState,
    documentToolsKey: DOCUMENT_TOOLS_KEY,
    uiLanguageKey: UI_LANGUAGE_KEY,
    userProfileKey: USER_PROFILE_KEY,
  });
  await page.goto("/editor?e2e=1", { waitUntil: "domcontentloaded" });

  const editor = page.locator(".ProseMirror").first();
  await expect.poll(async () => await page.locator(".ProseMirror").count(), { timeout: 30000 }).toBeGreaterThan(0);
  await expect(editor).toBeVisible();
  await expect.poll(async () => {
    return page.evaluate(() => {
      const helpers = window as Window & {
        __docsyE2E?: {
          selectText: (value: string) => boolean;
        };
      };

      return helpers.__docsyE2E?.selectText("mobile") ?? false;
    });
  }).toBeTruthy();

  await page.getByRole("button", { name: "Bold" }).click();

  await expect.poll(async () => {
    const html = await editor.innerHTML();
    return html.includes("<strong>mobile</strong>") || html.includes("<b>mobile</b>");
  }).toBeTruthy();

  await expect.poll(async () => {
    return page.evaluate(() => {
      const helpers = window as Window & {
        __docsyE2E?: {
          selectText: (value: string) => boolean;
        };
      };

      return helpers.__docsyE2E?.selectText("mobile") ?? false;
    });
  }).toBeTruthy();

  await page.getByTestId("toolbar-mobile-more").getByRole("button", { name: "More" }).click();
  const mobileSheet = page.getByTestId("toolbar-mobile-sheet");
  await expect(mobileSheet).toBeVisible();
  const mobileSheetScroll = page.getByTestId("toolbar-mobile-sheet-scroll");
  await expect(mobileSheetScroll).toBeVisible();
  await page.getByRole("button", { name: "Document tools" }).click();
  const fontSizeButton = mobileSheet.getByRole("button", { name: "18px" });
  await fontSizeButton.scrollIntoViewIfNeeded();
  await expect(fontSizeButton).toBeVisible();
  await expect.poll(async () => {
    return page.evaluate(() => {
      const helpers = window as Window & {
        __docsyE2E?: {
          hasFontSizeCommand: () => boolean;
        };
      };

      return helpers.__docsyE2E?.hasFontSizeCommand() ?? false;
    });
  }).toBeTruthy();
});
