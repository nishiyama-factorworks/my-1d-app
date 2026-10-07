import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { GitHubApiError } from "@/lib/github/errors";
import type {
  SearchRepositoriesParams,
  SearchRepositoriesResult,
} from "@/lib/github/types";
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
  searchRepositories:
    vi.fn<
      (params: SearchRepositoriesParams) => Promise<SearchRepositoriesResult>
    >(),
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

const sampleItem = {
  fullName: "vercel/next.js",
  ownerLogin: "vercel",
  ownerAvatarUrl: "https://avatars.githubusercontent.com/u/14985020?v=4",
};

function paginationNav() {
  return screen.getByRole("navigation", { name: "ページネーション" });
}

describe("トップページ: ページネーションと範囲外ページ", () => {
  it('AC-8a: 総件数100・/?q=react&page=2 のとき、一覧の下にページネーションが表示され、2 に aria-current="page" が付く', async () => {
    searchRepositories.mockResolvedValue({
      totalCount: 100,
      items: [sampleItem],
    });

    await renderPage({ q: "react", page: "2" });

    const nav = within(paginationNav());
    expect(nav.getByRole("link", { name: "2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(nav.getByRole("link", { name: "1" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(nav.getByRole("link", { name: "4" })).toBeInTheDocument();
  });

  it.each([
    { totalCount: 30, label: "表示しない", shown: false },
    { totalCount: 31, label: "表示する", shown: true },
  ])(
    "AC-8d: 総件数 $totalCount のときページネーションを $label",
    async ({ totalCount, shown }) => {
      searchRepositories.mockResolvedValue({
        totalCount,
        items: [sampleItem],
      });

      await renderPage({ q: "react" });

      const nav = screen.queryByRole("navigation", {
        name: "ページネーション",
      });
      if (shown) {
        expect(nav).toBeInTheDocument();
      } else {
        expect(nav).toBeNull();
      }
    },
  );

  it("AC-9a: 総件数50000のとき、最後のページ番号は34で35は無く、「上位1,000件まで表示します」が表示される", async () => {
    searchRepositories.mockResolvedValue({
      totalCount: 50000,
      items: [sampleItem],
    });

    await renderPage({ q: "react" });

    const nav = within(paginationNav());
    expect(nav.getByRole("link", { name: "34" })).toBeInTheDocument();
    expect(nav.queryByRole("link", { name: "35" })).toBeNull();
    expect(screen.getByText("上位1,000件まで表示します")).toBeInTheDocument();
  });

  it("AC-9b: /?q=react&page=35 のとき検索APIを呼ばず、案内と先頭のページへのリンクだけを表示する", async () => {
    await renderPage({ q: "react", page: "35" });

    expect(searchRepositories).not.toHaveBeenCalled();
    expect(
      screen.getByText("指定されたページは存在しません"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "キーワード" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "先頭のページへ" }),
    ).toHaveAttribute("href", "/?q=react&page=1");
    expect(screen.queryByText(/総ヒット件数/)).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "ページネーション" }),
    ).toBeNull();
  });

  it("AC-9b: /?q=react&page=34 のときは検索APIを page=34 で呼び、範囲外にしない", async () => {
    searchRepositories.mockResolvedValue({
      totalCount: 50000,
      items: [sampleItem],
    });

    await renderPage({ q: "react", page: "34" });

    expect(searchRepositories).toHaveBeenCalledWith({
      q: "react",
      page: 34,
      perPage: 30,
    });
    expect(screen.queryByText("指定されたページは存在しません")).toBeNull();
    expect(
      screen.getByRole("link", { name: "vercel/next.js" }),
    ).toBeInTheDocument();
  });

  it("AC-9c: /?q=react&page=3・総件数50・itemsが空のとき、案内と最終ページへのリンクだけを表示する", async () => {
    searchRepositories.mockResolvedValue({ totalCount: 50, items: [] });

    await renderPage({ q: "react", page: "3" });

    expect(searchRepositories).toHaveBeenCalledTimes(1);
    expect(searchRepositories).toHaveBeenCalledWith({
      q: "react",
      page: 3,
      perPage: 30,
    });
    expect(
      screen.getByText("指定されたページは存在しません"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "最終ページ（2ページ目）へ" }),
    ).toHaveAttribute("href", "/?q=react&page=2");
    expect(screen.queryByText(/総ヒット件数/)).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "ページネーション" }),
    ).toBeNull();
  });

  it("AC-9c: /?q=react&page=2・総件数50のときは範囲外にしない", async () => {
    searchRepositories.mockResolvedValue({
      totalCount: 50,
      items: [sampleItem],
    });

    await renderPage({ q: "react", page: "2" });

    expect(screen.queryByText("指定されたページは存在しません")).toBeNull();
  });

  it("AC-9d: /?q=react&page=2・総件数0のとき、範囲外の案内を出さず0件と空の一覧を表示する", async () => {
    searchRepositories.mockResolvedValue({ totalCount: 0, items: [] });

    await renderPage({ q: "react", page: "2" });

    expect(screen.queryByText("指定されたページは存在しません")).toBeNull();
    expect(screen.getByText("総ヒット件数: 0 件")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(
      screen.queryByRole("navigation", { name: "ページネーション" }),
    ).toBeNull();
  });
});
