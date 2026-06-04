import { expect, test, type Page } from "@playwright/test";

const AUTOSAVE_KEY = "docsy-autosave-v2";
const DOCUMENT_TOOLS_KEY = "docsy:web:document-tools-enabled";
const UI_LANGUAGE_KEY = "docsy-ui-language";
const USER_PROFILE_KEY = "docsy:web:user-profile";

type Locale = "en" | "ko";

interface RectSnapshot {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

interface PatchReviewLayoutSnapshot {
  body: RectSnapshot | null;
  detailScroll: RectSnapshot | null;
  dialog: RectSnapshot | null;
  footer: RectSnapshot | null;
  metrics: RectSnapshot | null;
  statusBadges: RectSnapshot | null;
  suggestedHeader: RectSnapshot | null;
  suggestedTextarea: RectSnapshot | null;
  title: RectSnapshot | null;
  viewportHeight: number;
}

const getHorizontalOverflow = async (page: Page) =>
  page.evaluate(() => {
    const { body, documentElement } = document;
    return Math.max(
      body.scrollWidth - body.clientWidth,
      documentElement.scrollWidth - documentElement.clientWidth,
    );
  });

const getPatchReviewLayoutSnapshot = async (page: Page) =>
  page.evaluate<PatchReviewLayoutSnapshot>(() => {
    const readRect = (selector: string): RectSnapshot | null => {
      const element = document.querySelector(selector);

      if (!element) {
        return null;
      }

      const { bottom, height, left, right, top, width } = element.getBoundingClientRect();
      return { bottom, height, left, right, top, width };
    };

    return {
      body: readRect('[data-testid="patch-review-body"]'),
      detailScroll: readRect('[data-testid="patch-review-detail-scroll"]'),
      dialog: readRect('[data-testid="patch-review-dialog"]'),
      footer: readRect('[data-testid="patch-review-footer"]'),
      metrics: readRect('[data-testid="patch-review-metrics"]'),
      statusBadges: readRect('[data-testid="patch-review-status-badges"]'),
      suggestedHeader: readRect('[data-testid="patch-review-suggested-header"]'),
      suggestedTextarea: readRect('[data-testid="patch-review-suggested-textarea"]'),
      title: readRect('[data-testid="patch-review-title"]'),
      viewportHeight: window.innerHeight,
    };
  });

const boxesOverlap = (first: RectSnapshot | null, second: RectSnapshot | null) => {
  if (!first || !second) {
    return true;
  }

  return !(
    first.right <= second.left + 1
    || second.right <= first.left + 1
    || first.bottom <= second.top + 1
    || second.bottom <= first.top + 1
  );
};

const seedEditorState = async (page: Page, locale: Locale) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate((args) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(args.uiLanguageKey, args.locale);
    localStorage.setItem(args.userProfileKey, "advanced");
    localStorage.setItem(args.documentToolsKey, "true");

    const now = Date.now();
    const documents = [
      {
        id: "doc-long-1",
        name: "Very Long Project Notes with Detailed Cross-Reference Synchronization and Workspace Metadata",
        mode: "markdown",
        content: "# Alpha\n\nLong doc for overlap checks.\n",
        createdAt: now - 6000,
        updatedAt: now - 1000,
        storageKind: "docsy",
        workspaceBinding: {
          documentKind: "google_docs",
          fileId: "file-alpha-001",
          importedAt: now - 12000,
          mimeType: "application/vnd.google-apps.document",
          provider: "google_drive",
          syncStatus: "synced",
        },
        sourceSnapshots: {
          markdown: "# Alpha\n\nLong doc for overlap checks.\n",
        },
      },
      {
        id: "doc-long-2",
        name: "Another Extremely Long Document Name to Exercise Sidebar Wrapping and Action Safety",
        mode: "markdown",
        content: "# Beta\n\nLong doc for overlap checks.\n",
        createdAt: now - 5000,
        updatedAt: now - 2000,
        storageKind: "docsy",
        sourceSnapshots: {
          markdown: "# Beta\n\nLong doc for overlap checks.\n",
        },
      },
      {
        id: "doc-long-3",
        name: "Short note",
        mode: "markdown",
        content: "# Gamma\n\nShort doc for overlap checks.\n",
        createdAt: now - 4000,
        updatedAt: now - 3000,
        storageKind: "docsy",
        sourceSnapshots: {
          markdown: "# Gamma\n\nShort doc for overlap checks.\n",
        },
      },
    ];

    localStorage.setItem(args.autosaveKey, JSON.stringify({
      activeDocId: "doc-long-1",
      documents,
      lastSaved: now,
      version: 2,
    }));
  }, {
    autosaveKey: AUTOSAVE_KEY,
    documentToolsKey: DOCUMENT_TOOLS_KEY,
    uiLanguageKey: UI_LANGUAGE_KEY,
    userProfileKey: USER_PROFILE_KEY,
    locale,
  });
};

const seedLandingLocale = async (page: Page, locale: Locale) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate((args) => {
    localStorage.clear();
    localStorage.setItem(args.uiLanguageKey, args.locale);
  }, {
    uiLanguageKey: UI_LANGUAGE_KEY,
    locale,
  });
};

const buildPatchReviewFixture = () => ({
  author: "ai",
  createdAt: Date.now(),
  description: "긴 한국어 문장과 상태 배지를 포함한 패치 리뷰 회귀 검증 세트입니다.",
  documentId: "doc-long-1",
  patchSetId: "patch-review-e2e",
  patches: [
    {
      author: "ai",
      confidence: 0.72,
      operation: "insert_before",
      originalText: "",
      patchId: "patch-e2e-1",
      reason: "현재 문서 앞부분에 목차 자리표시자를 추가하고 긴 제목 줄바꿈을 확인합니다.",
      sources: [
        {
          chunkId: "sec-001-자기소개서-작성-가이드-및-템플릿-chunk-01",
          excerpt: "자기소개서 작성 가이드 및 템플릿 출처 세부 설명 줄바꿈 확인용 텍스트입니다.",
          sectionId: "sec-001-자기소개서-양식",
          sourceId: "a74ebc86-5730-406d-b6d3-aedd497ccdc0",
        },
        {
          chunkId: "sec-002-개인-정보-작성-가이드-chunk-01",
          excerpt: "개인 정보 작성 가이드 출처 세부 설명 줄바꿈 확인용 텍스트입니다.",
          sectionId: "sec-002-개인-정보",
          sourceId: "a74ebc86-5730-406d-b6d3-aedd497ccdc0",
        },
      ],
      status: "pending",
      suggestedText: "TOC depth 2\n세부 항목 설명 줄바꿈 확인용 텍스트",
      summary: "Insert a table of contents placeholder before the document content.",
      target: { nodeId: "node-horizontal-rule-1", targetType: "node" },
      title: "Insert table of contents (depth 2) placeholder before the document content",
    },
    {
      author: "ai",
      confidence: 0.61,
      operation: "replace_text_range",
      originalText: "이 문서는 기존 개요 문장입니다.",
      patchId: "patch-e2e-2",
      reason: "소개 문단을 더 구체적으로 정리하고 상태 배지 배치를 검증합니다.",
      status: "accepted",
      suggestedText: "이 문서는 실제 패치 리뷰 화면의 긴 한국어 줄바꿈과 상태 배지 배치를 검증하기 위한 테스트 문장입니다.",
      summary: "Replace the intro paragraph with a longer explanatory paragraph for layout regression coverage.",
      target: {
        endOffset: 16,
        nodeId: "paragraph-1",
        startOffset: 0,
        targetType: "text_range",
      },
      title: "소개 문단을 더 구체적인 설명으로 교체하고 상태 배치가 겹치지 않는지 확인",
    },
  ],
  status: "in_review",
  title: "패치 리뷰 회귀 검증 세트",
});

const openPatchReviewFixture = async (page: Page, locale: Locale) => {
  await seedEditorState(page, locale);
  await page.goto("/editor?e2e=1", { waitUntil: "domcontentloaded" });

  await expect(page.locator("header input").first()).toBeVisible();

  const opened = await page.evaluate((patchSet) => {
    const helperWindow = window as Window & {
      __docsyE2E?: {
        openPatchReview?: (nextPatchSet: unknown) => boolean;
      };
    };

    return helperWindow.__docsyE2E?.openPatchReview?.(patchSet) ?? false;
  }, buildPatchReviewFixture());

  expect(opened).toBeTruthy();
  await expect(page.getByTestId("patch-review-dialog")).toBeVisible();
  await expect(page.getByTestId("patch-review-title")).toBeVisible();
  await expect(page.getByTestId("patch-review-footer")).toBeVisible();
};

const LOCALES_TO_TEST: Locale[] = ["ko", "en"];

test.describe("responsive overlap checks", () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });

  for (const locale of LOCALES_TO_TEST) {
    test(`editor desktop at 150% scale keeps sidebar rows readable (${locale})`, async ({ page }) => {
      await seedEditorState(page, locale);
      await page.goto("/editor?e2e=1", { waitUntil: "domcontentloaded" });
      await page.keyboard.press("Control+b");

      await expect(page.locator("header input").first()).toBeVisible();
      await expect(page.locator('[data-sidebar="menu-item"]').first()).toBeVisible();
      expect(await getHorizontalOverflow(page)).toBeLessThanOrEqual(1);
    });
  }

  test("patch review dialog keeps metrics and detail sections separated at 150% scale", async ({ page }) => {
    await openPatchReviewFixture(page, "ko");

    expect(await getHorizontalOverflow(page)).toBeLessThanOrEqual(1);

    const layout = await getPatchReviewLayoutSnapshot(page);
    expect(layout.metrics).not.toBeNull();
    expect(layout.body).not.toBeNull();
    expect(layout.title).not.toBeNull();
    expect(layout.statusBadges).not.toBeNull();
    expect(layout.suggestedHeader).not.toBeNull();
    expect(layout.suggestedTextarea).not.toBeNull();
    expect(layout.footer).not.toBeNull();

    expect(layout.metrics!.bottom).toBeLessThanOrEqual(layout.body!.top + 1);
    expect(boxesOverlap(layout.title, layout.statusBadges)).toBeFalsy();
    expect(boxesOverlap(layout.suggestedHeader, layout.suggestedTextarea)).toBeFalsy();
    expect(layout.footer!.bottom).toBeLessThanOrEqual(layout.viewportHeight - 8);
  });

  test("patch review footer remains reachable at 1024x768", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openPatchReviewFixture(page, "ko");

    const layout = await getPatchReviewLayoutSnapshot(page);
    expect(layout.dialog).not.toBeNull();
    expect(layout.detailScroll).not.toBeNull();
    expect(layout.footer).not.toBeNull();
    expect(layout.dialog!.bottom).toBeLessThanOrEqual(layout.viewportHeight - 8);
    expect(layout.footer!.bottom).toBeLessThanOrEqual(layout.viewportHeight - 8);
    expect(layout.detailScroll!.bottom).toBeLessThanOrEqual(layout.footer!.top + 1);
  });

  test("empty patch review state stays readable without overflow", async ({ page }) => {
    await seedEditorState(page, "ko");
    await page.goto("/editor?e2e=1", { waitUntil: "domcontentloaded" });

    await expect(page.locator("header input").first()).toBeVisible();
    await page.locator('[data-visual-target="header-open-patch-review"]').first().click();

    const dialog = page.getByTestId("patch-review-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("patch-review-empty")).toBeVisible();

    expect(await getHorizontalOverflow(page)).toBeLessThanOrEqual(1);

    const layout = await getPatchReviewLayoutSnapshot(page);
    expect(layout.dialog).not.toBeNull();
    expect(layout.dialog!.bottom).toBeLessThanOrEqual(layout.viewportHeight - 8);
  });

  for (const locale of LOCALES_TO_TEST) {
    test(`mobile landing wraps without horizontal overflow at 375x812 (${locale})`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await seedLandingLocale(page, locale);
      await page.goto("/?e2e=1", { waitUntil: "domcontentloaded" });

      const nav = page.locator("nav").first();
      await expect(nav).toBeVisible();
      expect(await getHorizontalOverflow(page)).toBeLessThanOrEqual(1);
    });

    test(`mobile landing wraps without horizontal overflow at 390x844 (${locale})`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await seedLandingLocale(page, locale);
      await page.goto("/?e2e=1", { waitUntil: "domcontentloaded" });

      const nav = page.locator("nav").first();
      await expect(nav).toBeVisible();
      expect(await getHorizontalOverflow(page)).toBeLessThanOrEqual(1);
    });
  }

  test("mobile editor keeps header controls readable without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedEditorState(page, "ko");
    await page.goto("/editor?e2e=1", { waitUntil: "domcontentloaded" });
    await page.keyboard.press("Control+b");

    await expect(page.locator("header input").first()).toBeVisible();
    await expect(page.locator(".ProseMirror").first()).toBeVisible();
    expect(await getHorizontalOverflow(page)).toBeLessThanOrEqual(1);
    expect(await page.locator("header button").count()).toBeGreaterThan(0);
  });
});
