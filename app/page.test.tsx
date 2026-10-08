import { act, render, screen, within } from "@testing-library/react";
import { startTransition } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { GitHubApiError } from "@/lib/github/errors";
import type { GitHubErrorKind } from "@/lib/github/types";
import type {
  SearchRepositoriesParams,
  SearchRepositoriesResult,
} from "@/lib/github/types";
import Page, { generateMetadata } from "./page";

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

afterEach(() => {
  vi.unstubAllEnvs();
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

// 検索フォームには入力案内用の role="alert"（空）が常にあるため、
// フォームの外にあるエラー表示の alert がちょうど 1 つあることを確かめて取り出す
function getErrorAlert() {
  const alerts = screen
    .getAllByRole("alert")
    .filter((el) => el.closest("form") === null);
  expect(alerts).toHaveLength(1);
  return alerts[0];
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

  // 仕様変更 0010（10節）: 0007 AC-9d の「総ヒット件数: 0 件」と空の一覧の表示を、
  // AC-17 の案内文に置き換えた。範囲外の案内なし・行なし・ページネーションなしは変えない。
  it("AC-9d・AC-17: /?q=react&page=2・総件数0のとき、範囲外の案内を出さず0件の案内を表示する", async () => {
    searchRepositories.mockResolvedValue({ totalCount: 0, items: [] });

    await renderPage({ q: "react", page: "2" });

    expect(screen.queryByText("指定されたページは存在しません")).toBeNull();
    expect(screen.queryByText(/総ヒット件数/)).toBeNull();
    expect(
      screen.getByText("「react」に一致するリポジトリは見つかりませんでした。"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("別のキーワードで検索してください。"),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(
      screen.queryByRole("navigation", { name: "ページネーション" }),
    ).toBeNull();
  });
});

describe("トップページ: 0件の表示", () => {
  it("AC-17: キーワード zzzxqy の検索で総件数0のとき、2つの案内文が表示され、総ヒット件数・一覧の行・ページネーションは表示されない", async () => {
    searchRepositories.mockResolvedValue({ totalCount: 0, items: [] });

    await renderPage({ q: "zzzxqy" });

    expect(
      screen.getByText(
        "「zzzxqy」に一致するリポジトリは見つかりませんでした。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("別のキーワードで検索してください。"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/総ヒット件数/)).toBeNull();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(
      screen.queryByRole("navigation", { name: "ページネーション" }),
    ).toBeNull();
    expect(
      screen.getByRole("searchbox", { name: "キーワード" }),
    ).toBeInTheDocument();
  });
});

describe("トップページ: APIエラーの表示", () => {
  it.each([
    {
      label: "AC-18a: RATE_LIMIT・resetAt あり",
      error: () =>
        new GitHubApiError("RATE_LIMIT", {
          status: 403,
          resetAt: new Date("2026-10-08T06:42:00Z"),
        }),
      texts: [
        "GitHub API の利用制限に達しました",
        "15:42（日本時間）に解除されます。",
      ],
    },
    {
      label: "AC-18b: RATE_LIMIT・resetAt なし",
      error: () => new GitHubApiError("RATE_LIMIT", { status: 403 }),
      texts: [
        "GitHub API の利用制限に達しました",
        "しばらく時間をおいてから再試行してください。",
      ],
    },
    {
      label: "AC-19a: UPSTREAM",
      error: () => new GitHubApiError("UPSTREAM", { status: 502 }),
      texts: ["データの取得中にエラーが発生しました"],
    },
    {
      label: "AC-19a: VALIDATION",
      error: () => new GitHubApiError("VALIDATION", { status: 422 }),
      texts: ["データの取得中にエラーが発生しました"],
    },
    {
      label: "AC-19b: NETWORK",
      error: () => new GitHubApiError("NETWORK"),
      texts: [
        "GitHub に接続できませんでした",
        "通信環境を確認してから再試行してください。",
      ],
    },
  ])(
    "$label のとき、role=alert の中に仕様6.1の文言と「再試行」ボタンがあり、検索フォームが残る",
    async ({ error, texts }) => {
      searchRepositories.mockRejectedValue(error());

      await renderPage({ q: "react" });

      const alert = within(getErrorAlert());
      for (const text of texts) {
        expect(alert.getByText(text)).toBeInTheDocument();
      }
      expect(alert.getByRole("button", { name: "再試行" })).toBeInTheDocument();
      expect(
        screen.getByRole("searchbox", { name: "キーワード" }),
      ).toBeInTheDocument();
    },
  );

  it.each([
    { kind: "RATE_LIMIT", status: 403 },
    { kind: "VALIDATION", status: 422 },
    { kind: "UPSTREAM", status: 502 },
    { kind: "NETWORK", status: undefined },
  ] as { kind: GitHubErrorKind; status: number | undefined }[])(
    "AC-19c: GITHUB_TOKEN にダミーの値があり $kind で失敗したとき、画面のテキストにトークン・エラーの message・stack・HTTP ステータス番号が含まれない",
    async ({ kind, status }) => {
      // lib/github はモックしているため、ここで確かめられるのは「ページの描画がトークンを参照しない」ことまで。
      // トークンを API 呼び出し以外に出さない保証は 0003 の lib/github のテストが持つ。
      const token = "test-token-not-a-secret-0010";
      vi.stubEnv("GITHUB_TOKEN", token);
      const error = new GitHubApiError(kind, { status });
      searchRepositories.mockRejectedValue(error);

      await renderPage({ q: "react" });

      // エラー表示が出ていること（何も描画されずに通るのを防ぐ）
      expect(getErrorAlert()).toBeInTheDocument();
      const text = document.body.textContent ?? "";
      expect(text).not.toContain(token);
      expect(text).not.toContain(error.message);
      expect(text).not.toContain(error.stack ?? "stack-unavailable");
      // stack の一部（「at 関数名 (ファイル:行:列)」のフレーム）も出ない
      expect(text).not.toMatch(/at .+:d+:d+/);
      if (status !== undefined) {
        expect(text).not.toContain(String(status));
      }
    },
  );

  it("AC-19d: エラー表示の「再試行」を押すと router.refresh() が1回呼ばれ、push は呼ばれない", async () => {
    const user = userEvent.setup();
    searchRepositories.mockRejectedValue(new GitHubApiError("UPSTREAM"));
    await renderPage({ q: "react" });

    await user.click(screen.getByRole("button", { name: "再試行" }));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });
});

describe("トップページ: 詳細への行リンク（0009）", () => {
  function rowLink() {
    return screen.getByRole("link", { name: "vercel/next.js" });
  }

  beforeEach(() => {
    searchRepositories.mockResolvedValue({
      totalCount: 100,
      items: [sampleItem],
    });
  });

  it("AC-15e: /?q=react&page=3（総件数100）のとき、行 vercel/next.js のリンクの href は /repos/vercel/next.js?q=react&page=3 である", async () => {
    await renderPage({ q: "react", page: "3" });

    expect(rowLink()).toHaveAttribute(
      "href",
      "/repos/vercel/next.js?q=react&page=3",
    );
  });

  it("AC-15e（補強）: q が前後に空白のある react・page が 3 のとき、行リンクには正規化済みの q=react が付く", async () => {
    await renderPage({ q: " react ", page: "3" });

    expect(rowLink()).toHaveAttribute(
      "href",
      "/repos/vercel/next.js?q=react&page=3",
    );
  });

  it("AC-15e（補強）: page が abc のとき、行リンクには補正後の page=1 が付く", async () => {
    await renderPage({ q: "react", page: "abc" });

    expect(rowLink()).toHaveAttribute(
      "href",
      "/repos/vercel/next.js?q=react&page=1",
    );
  });

  it("AC-15d: q が「日本語 & react」・page 2（総件数100）のとき、入力欄の初期値は元の文字列で、行リンクの q を読み戻すと元の文字列になる", async () => {
    await renderPage({ q: "日本語 & react", page: "2" });

    expect(screen.getByRole("searchbox", { name: "キーワード" })).toHaveValue(
      "日本語 & react",
    );
    const href = rowLink().getAttribute("href") ?? "";
    expect(new URL(href, "http://localhost").searchParams.get("q")).toBe(
      "日本語 & react",
    );
  });
});

describe("トップページ: タイトル（0011）", () => {
  function callMetadata(searchParams: TestSearchParams) {
    return generateMetadata({
      params: Promise.resolve({}),
      searchParams: Promise.resolve(searchParams),
    });
  }

  it("AC-28a: q が無いとき、タイトルはアプリ名だけ（absolute）になる", async () => {
    expect(await callMetadata({})).toEqual({
      title: { absolute: "GitHub リポジトリ検索" },
    });
  });

  it.each([
    { label: "q が空", searchParams: { q: "" } },
    { label: "q が空白のみ", searchParams: { q: "   " } },
    { label: "q が全角空白のみ", searchParams: { q: "　" } },
    { label: "page=2 のみ（q なし）", searchParams: { page: "2" } },
  ])(
    "AC-28a: $label のとき、タイトルはアプリ名だけになる",
    async ({ searchParams }) => {
      expect(await callMetadata(searchParams)).toEqual({
        title: { absolute: "GitHub リポジトリ検索" },
      });
    },
  );

  it("AC-28b: q=react のとき、タイトルは「react の検索結果 | GitHub リポジトリ検索」になる", async () => {
    expect(await callMetadata({ q: "react" })).toEqual({
      title: { absolute: "react の検索結果 | GitHub リポジトリ検索" },
    });
  });

  it("AC-28b: q の前後の空白は除かれる", async () => {
    expect(await callMetadata({ q: " react " })).toEqual({
      title: { absolute: "react の検索結果 | GitHub リポジトリ検索" },
    });
  });

  it("AC-28b（補強）: page はタイトルに入らない", async () => {
    expect(await callMetadata({ q: "react", page: "3" })).toEqual({
      title: { absolute: "react の検索結果 | GitHub リポジトリ検索" },
    });
  });

  it("AC-28b（補強）: q が複数あるときは先頭の値を使う", async () => {
    expect(await callMetadata({ q: ["react", "vue"] })).toEqual({
      title: { absolute: "react の検索結果 | GitHub リポジトリ検索" },
    });
  });

  it("AC-28a・28b（補強）: タイトルの生成は検索 API を呼ばない", async () => {
    await callMetadata({});
    await callMetadata({ q: "react" });

    expect(searchRepositories).not.toHaveBeenCalled();
  });
});

describe("トップページ: キーボード操作（0011）", () => {
  const rows = [
    { fullName: "vercel/next.js", ownerLogin: "vercel" },
    { fullName: "facebook/react", ownerLogin: "facebook" },
    { fullName: "vuejs/core", ownerLogin: "vuejs" },
  ].map((row) => ({
    ...row,
    ownerAvatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
  }));

  beforeEach(() => {
    searchRepositories.mockResolvedValue({ totalCount: 100, items: rows });
  });

  function rowLinks() {
    return rows.map((row) => screen.getByRole("link", { name: row.fullName }));
  }

  function pageLink(name: string) {
    return within(paginationNav()).getByRole("link", { name });
  }

  // 先頭から Tab を count 回押し、止まった要素を順に返す
  async function tabStops(count: number) {
    const user = userEvent.setup();
    const stops: (Element | null)[] = [];
    for (let i = 0; i < count; i++) {
      await user.tab();
      stops.push(document.activeElement);
    }
    return stops;
  }

  it("AC-26b1: /?q=react&page=2（総件数100・3行）で Tab を押すと、入力欄 → 検索 → 3行のリンク → 前へ → 1 → 2 → 3 → 4 → 次へ の順に移り、その次はページの外へ出る", async () => {
    await renderPage({ q: "react", page: "2" });

    const stops = await tabStops(12);

    expect(stops).toEqual([
      screen.getByRole("searchbox", { name: "キーワード" }),
      screen.getByRole("button", { name: "検索" }),
      ...rowLinks(),
      pageLink("前へ"),
      pageLink("1"),
      pageLink("2"),
      pageLink("3"),
      pageLink("4"),
      pageLink("次へ"),
      document.body,
    ]);
    // 現在のページ（2）もリンクとして Tab で止まる
    expect(stops[7]).toHaveAttribute("aria-current", "page");
  });

  it("AC-26b1: 1ページ目では押せない「前へ」に止まらない", async () => {
    await renderPage({ q: "react", page: "1" });

    const stops = await tabStops(11);

    expect(stops).toEqual([
      screen.getByRole("searchbox", { name: "キーワード" }),
      screen.getByRole("button", { name: "検索" }),
      ...rowLinks(),
      pageLink("1"),
      pageLink("2"),
      pageLink("3"),
      pageLink("4"),
      pageLink("次へ"),
      document.body,
    ]);
    expect(stops).not.toContain(within(paginationNav()).getByText("前へ"));
  });

  it("AC-26b1: 最終ページ（4）では押せない「次へ」に止まらない", async () => {
    await renderPage({ q: "react", page: "4" });

    const stops = await tabStops(11);

    expect(stops).toEqual([
      screen.getByRole("searchbox", { name: "キーワード" }),
      screen.getByRole("button", { name: "検索" }),
      ...rowLinks(),
      pageLink("前へ"),
      pageLink("1"),
      pageLink("2"),
      pageLink("3"),
      pageLink("4"),
      document.body,
    ]);
    expect(stops).not.toContain(within(paginationNav()).getByText("次へ"));
  });

  it("AC-26b1: 行リンクとページネーションのリンクは href を持つ a 要素で、tabindex が負でない（Enter で開ける）", async () => {
    await renderPage({ q: "react", page: "2" });

    const links = [
      ...rowLinks(),
      ...within(paginationNav()).getAllByRole("link"),
    ];
    expect(links).toHaveLength(3 + 6);
    for (const link of links) {
      expect(link.tagName).toBe("A");
      expect(link).toHaveAttribute("href");
      expect(link.tabIndex).toBeGreaterThanOrEqual(0);
    }
  });
});
