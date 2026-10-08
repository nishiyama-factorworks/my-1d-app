import { act, render, screen, within } from "@testing-library/react";
import { startTransition } from "react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import type {
  SearchRepositoriesParams,
  SearchRepositoriesResult,
} from "@/lib/github/types";
import Page from "./page";

// SearchForm が useRouter を呼ぶ。App Router のコンテキストが無いと例外になるため、
// プロセス境界の外（履歴更新・RSC 取得）にあたる useRouter だけを差し替える。
const { push, refresh } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
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
  refresh.mockReset();
  searchRepositories.mockReset();
  searchRepositories.mockResolvedValue({ totalCount: 0, items: [] });
});

// async な Server Component は JSX としては描画できないため、
// ページ関数を直接呼んで await し、返った要素を描画する。
// 取得は <Suspense> の中で行われるので、act の中で描画して解決を待つ。
type TestSearchParams = Record<string, string | string[] | undefined>;

function callPage(searchParams: TestSearchParams) {
  return Page({
    params: Promise.resolve({}),
    searchParams: Promise.resolve(searchParams),
  });
}

async function renderPage(searchParams: TestSearchParams) {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(await callPage(searchParams));
  });
  return result;
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

  it('AC-16a: /?q=react で取得中のとき、検索フォームは表示されたまま、role="status" の「読み込み中…」が表示される', async () => {
    searchRepositories.mockReturnValue(new Promise(() => {}));

    await renderPage({ q: "react" });

    expect(
      screen.getByRole("searchbox", { name: "キーワード" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("読み込み中…");
    expect(screen.queryByText(/総ヒット件数/)).toBeNull();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("AC-16a: 読み込み中の表示は検索フォームより後ろ（一覧の位置）にある", async () => {
    searchRepositories.mockReturnValue(new Promise(() => {}));

    await renderPage({ q: "react" });

    const form = screen.getByRole("searchbox", { name: "キーワード" });
    expect(
      form.compareDocumentPosition(screen.getByRole("status")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("AC-16a: 取得が終わると読み込み中の表示が消え、結果に置き換わる", async () => {
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

    expect(
      await screen.findByText("総ヒット件数: 12,345 件"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it.each([
    {
      label: "q（react → vue）",
      first: { q: "react" },
      second: { q: "vue" },
    },
    {
      label: "page（1 → 2）",
      first: { q: "react", page: "1" },
      second: { q: "react", page: "2" },
    },
  ])(
    "AC-16a: 表示済みの状態から $label が変わる遷移（トランジション）でも読み込み中が表示される",
    async ({ first, second }) => {
      searchRepositories.mockResolvedValueOnce({
        totalCount: 12345,
        items: [],
      });
      const { rerender } = await renderPage(first);
      expect(
        await screen.findByText("総ヒット件数: 12,345 件"),
      ).toBeInTheDocument();

      searchRepositories.mockReturnValue(new Promise(() => {}));
      const next = await callPage(second);
      // 同期の act では、未解決の Promise を use で読んだときの中断がフラッシュされず、
      // fallback を観測できないため、async の act で待つ
      await act(async () => {
        startTransition(() => {
          rerender(next);
        });
      });

      expect(screen.getByRole("status")).toHaveTextContent("読み込み中…");
    },
  );

  it("AC-16a（補強）: q が無いときは読み込み中を表示しない", async () => {
    await renderPage({});

    expect(screen.queryByRole("status")).toBeNull();
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

    // 仕様 6.1: ページネーションは一覧の下にある（DOM 上で一覧の行より後ろ）
    const row = screen.getByRole("link", { name: "vercel/next.js" });
    expect(
      row.compareDocumentPosition(paginationNav()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
    // 範囲外にならないときは、通常どおり一覧とページネーションが出る
    expect(
      screen.getByRole("link", { name: "vercel/next.js" }),
    ).toBeInTheDocument();
    expect(
      within(paginationNav()).getByRole("link", { name: "2" }),
    ).toHaveAttribute("aria-current", "page");
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
