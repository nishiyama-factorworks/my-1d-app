import { expect, test, type Page } from "@playwright/test";

// 期待値は計画 1.3 の固定データをリテラルで持つ。モックのコードは import しない
// （モックの誤りを検出できなくなるため）。
const FIRST_PAGE_REPO = "e2e-owner-01/react-sample-01";
const SECOND_PAGE_REPO = "e2e-owner-31/react-sample-31";
const SECOND_PAGE_OWNER = "e2e-owner-31";

test.beforeEach(async ({ page }) => {
  // オーナーアイコンは外部（avatars.githubusercontent.com）から取得されるため止める。
  await page.route("**/_next/image**", (route) => route.abort());
});

// <dt>label</dt> の直後の <dd> のテキストを返すロケーター。
function definitionOf(page: Page, label: string) {
  return page
    .locator("dt", { hasText: new RegExp(`^${label}$`) })
    .locator("xpath=following-sibling::dd[1]");
}

test("AC-31a: react で検索し、2 ページ目から詳細へ進み、トップへ戻ると 2 ページ目の一覧が復元される", async ({
  page,
}) => {
  // 1. トップで react を検索する（1 ページ目）
  await page.goto("/");
  await page.getByLabel("キーワード").fill("react");
  await page.getByRole("button", { name: "検索" }).click();

  await expect(page).toHaveURL("/?q=react&page=1");
  await expect(page.getByText("総ヒット件数: 45 件")).toBeVisible();
  await expect(
    page.getByRole("link", { name: FIRST_PAGE_REPO, exact: true }),
  ).toBeVisible();

  // 2. 2 ページ目へ移動する
  const pagination = page.getByRole("navigation", { name: "ページネーション" });
  await pagination.getByRole("link", { name: "2", exact: true }).click();

  await expect(page).toHaveURL("/?q=react&page=2");
  await expect(
    page.getByRole("link", { name: SECOND_PAGE_REPO, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: FIRST_PAGE_REPO, exact: true }),
  ).toHaveCount(0);
  await expect(
    pagination.getByRole("link", { name: "2", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  // 3. 一覧の 1 件を選び、詳細を確認する
  await page.getByRole("link", { name: SECOND_PAGE_REPO, exact: true }).click();

  await expect(page).toHaveURL(`/repos/${SECOND_PAGE_REPO}?q=react&page=2`);
  await expect(
    page.getByRole("heading", { level: 1, name: SECOND_PAGE_REPO }),
  ).toBeVisible();
  await expect(definitionOf(page, "オーナー")).toHaveText(SECOND_PAGE_OWNER);
  await expect(definitionOf(page, "言語")).toHaveText("TypeScript");
  await expect(definitionOf(page, "Star数")).toHaveText("12,345");
  await expect(definitionOf(page, "Watcher数")).toHaveText("678");
  await expect(definitionOf(page, "Fork数")).toHaveText("910");
  await expect(definitionOf(page, "Issue数")).toHaveText("11");
  // watchers_count（99,999）は使われない値。表示されたら Star/Watcher の取り違え。
  await expect(page.getByText("99,999")).toHaveCount(0);

  // 4. トップへ戻ると、同じキーワード・同じ 2 ページ目が復元される
  await page.getByRole("link", { name: "トップへ戻る" }).click();

  await expect(page).toHaveURL("/?q=react&page=2");
  await expect(page.getByLabel("キーワード")).toHaveValue("react");
  await expect(
    page.getByRole("link", { name: SECOND_PAGE_REPO, exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "ページネーション" })
      .getByRole("link", { name: "2", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});
