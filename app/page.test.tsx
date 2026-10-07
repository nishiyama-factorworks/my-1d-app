import { render, screen } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { GitHubApiError } from "@/lib/github/errors";
import Page from "./page";

// SearchForm が useRouter を呼ぶ。App Router のコンテキストが無いと例外になるため、
// プロセス境界の外（履歴更新・RSC 取得）にあたる useRouter だけを差し替える。
const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

// 検索 API（ネットワーク境界）だけを差し替える。ファクトリで丸ごと置き換えるので
// 本物の client.ts は読み込まれない。
const { searchRepositories } = vi.hoisted(() => ({
  searchRepositories: vi.fn(),
}));

vi.mock("@/lib/github", () => ({ searchRepositories }));

beforeEach(() => {
  push.mockReset();
  searchRepositories.mockReset();
  searchRepositories.mockResolvedValue({ totalCount: 0, items: [] });
});

// async な Server Component は JSX としては描画できないため、
// ページ関数を直接呼んで await し、返った要素を描画する。
async function renderPage(
  searchParams: Record<string, string | string[] | undefined>,
) {
  render(
    await Page({
      params: Promise.resolve({}),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

describe("トップページ", () => {
  it("AC-21b: トップページを描画するとプレースホルダーの見出しが表示される", async () => {
    await renderPage({});

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "GitHub リポジトリ検索",
    );
  });

  it("AC-1: トップページにラベル「キーワード」の入力欄と「検索」ボタンがある", async () => {
    await renderPage({});

    expect(
      screen.getByRole("searchbox", { name: "キーワード" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "検索" })).toBeInTheDocument();
  });

  it('AC-22c: URL が /?q=react&page=3 のとき入力欄の初期値が "react" になる', async () => {
    await renderPage({ q: "react", page: "3" });

    expect(screen.getByRole("searchbox", { name: "キーワード" })).toHaveValue(
      "react",
    );
  });

  it("AC-22c: URL に q が無いとき入力欄は空になる", async () => {
    await renderPage({});

    expect(screen.getByRole("searchbox", { name: "キーワード" })).toHaveValue(
      "",
    );
  });

  it("AC-22c: q が空白のみのとき入力欄は空になる", async () => {
    await renderPage({ q: "   " });

    expect(screen.getByRole("searchbox", { name: "キーワード" })).toHaveValue(
      "",
    );
  });

  it("AC-4a: URL が /?q=react&page=2 のとき q=react・page=2 で1回だけ検索する", async () => {
    await renderPage({ q: "react", page: "2" });

    expect(searchRepositories).toHaveBeenCalledTimes(1);
    expect(searchRepositories).toHaveBeenCalledWith({
      q: "react",
      page: 2,
      perPage: 30,
    });
  });

  it("AC-4a: 検索結果（総ヒット件数と行）がページに表示される", async () => {
    searchRepositories.mockResolvedValue({
      totalCount: 12345,
      items: [
        {
          fullName: "vercel/next.js",
          ownerLogin: "vercel",
          ownerAvatarUrl:
            "https://avatars.githubusercontent.com/u/14985020?v=4",
        },
      ],
    });

    await renderPage({ q: "react" });

    expect(screen.getByText("総ヒット件数: 12,345 件")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "vercel/next.js" }),
    ).toBeInTheDocument();
  });

  it("AC-4a: page が無いときは page=1 で検索する", async () => {
    await renderPage({ q: "react" });

    expect(searchRepositories).toHaveBeenCalledWith({
      q: "react",
      page: 1,
      perPage: 30,
    });
  });

  it.each([
    { label: "/（パラメータなし）", searchParams: {} },
    { label: "/?q=（空）", searchParams: { q: "" } },
    { label: "/?q=%20%20%20（空白のみ）", searchParams: { q: "   " } },
    { label: "/?page=2（q なし）", searchParams: { page: "2" } },
  ])(
    "AC-4b: URL が $label のとき検索 API を呼ばず、検索フォームだけを表示する",
    async ({ searchParams }) => {
      await renderPage(searchParams);

      expect(searchRepositories).not.toHaveBeenCalled();
      expect(
        screen.getByRole("searchbox", { name: "キーワード" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("list")).toBeNull();
      expect(screen.queryByText(/総ヒット件数/)).toBeNull();
    },
  );

  it("AC-4a（仕様6.1）: 検索 API が GitHubApiError で失敗したとき、握りつぶさずにそのまま投げる", async () => {
    const error = new GitHubApiError("RATE_LIMIT");
    searchRepositories.mockRejectedValue(error);

    await expect(
      Page({
        params: Promise.resolve({}),
        searchParams: Promise.resolve({ q: "react" }),
      }),
    ).rejects.toBe(error);
  });
});
