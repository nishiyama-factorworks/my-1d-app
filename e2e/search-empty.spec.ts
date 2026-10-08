import { expect, test } from "@playwright/test";

// AC-31a の react と URL が重ならないキーワード（fetch キャッシュの共有を避ける）。
const NO_MATCH_KEYWORD = "e2e-no-such-repository";

test.beforeEach(async ({ page }) => {
  // オーナーアイコンは外部（avatars.githubusercontent.com）から取得されるため止める。
  await page.route("**/_next/image**", (route) => route.abort());
});

test("AC-31b: 一致しないキーワードで検索すると 0 件の案内が出る", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("キーワード").fill(NO_MATCH_KEYWORD);
  await page.getByRole("button", { name: "検索" }).click();

  await expect(
    page
      .getByRole("status")
      .getByText(
        `「${NO_MATCH_KEYWORD}」に一致するリポジトリは見つかりませんでした。`,
      ),
  ).toBeVisible();
});
