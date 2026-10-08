import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { GitHubApiError } from "@/lib/github/errors";
import type { GitHubErrorKind, RepoDetail } from "@/lib/github/types";
import Page from "./page";

// 取得 API（ネットワーク境界）だけを差し替える。ファクトリで丸ごと置き換えるので
// 本物の client.ts（server-only）は読み込まれない。
const { getRepository, refresh, push } = vi.hoisted(() => ({
  getRepository: vi.fn<(owner: string, repo: string) => Promise<RepoDetail>>(),
  refresh: vi.fn<() => void>(),
  push: vi.fn<(href: string) => void>(),
}));

vi.mock("@/lib/github", () => ({ getRepository }));

// 仕様 0010: エラー表示の RetryButton が useRouter を呼ぶため、useRouter だけ差し替える。
// notFound は本物のまま使う（AC-20a の digest 検証を変えないため。計画 1.2 (f)）。
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push, refresh }),
}));

function makeRepo(overrides: Partial<RepoDetail> = {}): RepoDetail {
  return {
    fullName: "vercel/next.js",
    ownerLogin: "vercel",
    ownerAvatarUrl: "https://avatars.githubusercontent.com/u/14985020?v=4",
    language: "TypeScript",
    stargazersCount: 1234567,
    watchersCount: 7,
    forksCount: 0,
    openIssuesCount: 5,
    htmlUrl: "https://github.com/vercel/next.js",
    ...overrides,
  };
}

beforeEach(() => {
  getRepository.mockReset();
  getRepository.mockResolvedValue(makeRepo());
  refresh.mockReset();
  push.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// async な Server Component は JSX としては描画できないため、
// ページ関数を直接呼んで await し、返った要素を描画する。
function callPage(
  params: { owner: string; repo: string },
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  return Page({
    params: Promise.resolve(params),
    searchParams: Promise.resolve(searchParams),
  });
}

async function renderPage(
  params: { owner: string; repo: string },
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  render(await callPage(params, searchParams));
}

const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404";

describe("詳細ページ", () => {
  it("AC-12: /repos/vercel/next.js を直接開くと getRepository(vercel, next.js) を1回呼ぶ", async () => {
    await renderPage({ owner: "vercel", repo: "next.js" });

    expect(getRepository).toHaveBeenCalledTimes(1);
    expect(getRepository).toHaveBeenCalledWith("vercel", "next.js");
  });

  it("AC-12: 取得した内容（見出し・項目）がページに表示される", async () => {
    await renderPage({ owner: "vercel", repo: "next.js" });

    expect(
      screen.getByRole("heading", { level: 1, name: "vercel/next.js" }),
    ).toBeInTheDocument();
    const terms = screen.getAllByRole("term").map((e) => e.textContent);
    const definitions = screen
      .getAllByRole("definition")
      .map((e) => e.textContent);
    const pairs = terms.map((term, i) => [term, definitions[i]]);
    expect(pairs).toContainEqual(["Star数", "1,234,567"]);
    expect(pairs).toContainEqual(["オーナー", "vercel"]);
  });

  it("AC-12: 見出しはURLではなくAPIの応答（fullName）から取り、URLの owner・repo は加工せずに渡す", async () => {
    getRepository.mockResolvedValue(makeRepo({ fullName: "vercel/next.js" }));

    await renderPage({ owner: "VERCEL", repo: "NEXT.JS" });

    expect(getRepository).toHaveBeenCalledWith("VERCEL", "NEXT.JS");
    expect(
      screen.getByRole("heading", { level: 1, name: "vercel/next.js" }),
    ).toBeInTheDocument();
  });

  it("AC-11c: 詳細はモーダルではなく独立したページとして表示され、トップへ戻るリンクがある", async () => {
    await renderPage({ owner: "vercel", repo: "next.js" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("link", { name: "トップへ戻る" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("AC-20a: getRepository が NOT_FOUND で失敗したとき notFound() が呼ばれ、詳細は表示されない", async () => {
    getRepository.mockRejectedValue(
      new GitHubApiError("NOT_FOUND", { status: 404 }),
    );

    await expect(
      callPage({ owner: "vercel", repo: "no-such-repo" }),
    ).rejects.toMatchObject({ digest: NOT_FOUND_DIGEST });

    // reject されるため描画する要素は返らない（= 詳細は表示されない）
    expect(getRepository).toHaveBeenCalledTimes(1);
  });

  // 仕様変更 0010 による置き換え: 0008 AC-20b の「NOT_FOUND 以外の GitHubApiError は
  // そのまま投げる」(4 種別) を、種別ごとの表示 (AC-18a〜19b) に置き換えた。
  // ページ関数は reject せず（= notFound() も呼ばれない）、alert を描画する。
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
    "$label のとき、ページは投げずに role=alert の中に仕様6.1の文言と「再試行」ボタンを表示し、詳細の見出しは出ない",
    async ({ error, texts }) => {
      getRepository.mockRejectedValue(error());

      await renderPage({ owner: "vercel", repo: "next.js" });

      const alert = within(screen.getByRole("alert"));
      for (const text of texts) {
        expect(alert.getByText(text)).toBeInTheDocument();
      }
      expect(alert.getByRole("button", { name: "再試行" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    },
  );

  it.each([
    { kind: "RATE_LIMIT", status: 403 },
    { kind: "VALIDATION", status: 422 },
    { kind: "UPSTREAM", status: 502 },
    { kind: "NETWORK", status: undefined },
  ] as { kind: GitHubErrorKind; status: number | undefined }[])(
    "AC-19c: GITHUB_TOKEN にダミーの値があり $kind で失敗したとき、画面のテキストにトークン・message・stack・HTTP ステータス番号が含まれない",
    async ({ kind, status }) => {
      // lib/github はモックしているため、ここで確かめられるのは「ページの描画がトークンを参照しない」ことまで。
      // トークンを API 呼び出し以外に出さない保証は 0003 の lib/github のテストが持つ。
      const token = "test-token-not-a-secret-0010";
      vi.stubEnv("GITHUB_TOKEN", token);
      const error = new GitHubApiError(kind, { status });
      getRepository.mockRejectedValue(error);

      await renderPage({ owner: "vercel", repo: "next.js" });

      // エラー表示が出ていること（何も描画されずに通るのを防ぐ）
      expect(screen.getByRole("alert")).toBeInTheDocument();
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
    getRepository.mockRejectedValue(new GitHubApiError("UPSTREAM"));
    await renderPage({ owner: "vercel", repo: "next.js" });

    await user.click(screen.getByRole("button", { name: "再試行" }));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("AC-20b: GitHubApiError 以外の例外もそのまま投げる", async () => {
    const error = new Error("unexpected");
    getRepository.mockRejectedValue(error);

    await expect(callPage({ owner: "vercel", repo: "next.js" })).rejects.toBe(
      error,
    );
  });

  describe("トップへ戻る（0009）", () => {
    const target = { owner: "vercel", repo: "next.js" };

    function backHrefOf() {
      return screen
        .getByRole("link", { name: "トップへ戻る" })
        .getAttribute("href");
    }

    it("AC-15a: /repos/vercel/next.js?q=react&page=3 のとき「トップへ戻る」の href が /?q=react&page=3 である", async () => {
      await renderPage(target, { q: "react", page: "3" });

      expect(
        screen.getByRole("link", { name: "トップへ戻る" }),
      ).toHaveAttribute("href", "/?q=react&page=3");
    });

    it("AC-15b: クエリなしで直接開いたとき「トップへ戻る」の href が / である", async () => {
      await renderPage(target, {});

      expect(
        screen.getByRole("link", { name: "トップへ戻る" }),
      ).toHaveAttribute("href", "/");
    });

    it.each([
      {
        label: "page=abc",
        searchParams: { q: "react", page: "abc" },
        expected: "/?q=react&page=1",
      },
      {
        label: "q=//evil.example",
        searchParams: { q: "//evil.example" },
        expected: "/?q=%2F%2Fevil.example&page=1",
      },
      {
        label: "q=https://evil.example/",
        searchParams: { q: "https://evil.example/" },
        expected: "/?q=https%3A%2F%2Fevil.example%2F&page=1",
      },
      {
        label: "257 文字の q",
        searchParams: { q: "a".repeat(257) },
        expected: "/",
      },
      {
        label: "全角空白のみの q（page=3）",
        searchParams: { q: "　", page: "3" },
        expected: "/",
      },
    ])(
      'AC-15c: クエリが $label のとき「トップへ戻る」の href が $expected で、"/" で始まり "//" で始まらない',
      async ({ searchParams, expected }) => {
        await renderPage(target, searchParams);

        const href = backHrefOf();
        expect(href).toBe(expected);
        expect(href?.startsWith("/")).toBe(true);
        expect(href?.startsWith("//")).toBe(false);
      },
    );

    it('AC-15d: q が "日本語 & react"・page "2" のとき href が /?q=%E6%97%A5%E6%9C%AC%E8%AA%9E+%26+react&page=2 で、読み戻すと q が "日本語 & react" になる', async () => {
      await renderPage(target, { q: "日本語 & react", page: "2" });

      const href = backHrefOf();
      expect(href).toBe("/?q=%E6%97%A5%E6%9C%AC%E8%AA%9E+%26+react&page=2");
      const url = new URL(href ?? "", "http://localhost");
      expect(url.searchParams.get("q")).toBe("日本語 & react");
      expect(url.searchParams.get("page")).toBe("2");
    });

    it("AC-15f: 検索条件 q=react&page=3 が付いていても、getRepository は (vercel, next.js) だけで1回呼ばれ、見出しと6項目はクエリなしと同じ", async () => {
      await renderPage(target, { q: "react", page: "3" });

      expect(getRepository).toHaveBeenCalledTimes(1);
      expect(getRepository).toHaveBeenCalledWith("vercel", "next.js");
      expect(
        screen.getByRole("heading", { level: 1, name: "vercel/next.js" }),
      ).toBeInTheDocument();
      const terms = screen.getAllByRole("term").map((e) => e.textContent);
      const definitions = screen
        .getAllByRole("definition")
        .map((e) => e.textContent);
      expect(terms.map((term, i) => [term, definitions[i]])).toEqual([
        ["オーナー", "vercel"],
        ["言語", "TypeScript"],
        ["Star数", "1,234,567"],
        ["Watcher数", "7"],
        ["Fork数", "0"],
        ["Issue数", "5"],
      ]);
    });

    it("AC-15f（補強）: 検索条件が付いていても NOT_FOUND のときは notFound() になる", async () => {
      getRepository.mockRejectedValue(
        new GitHubApiError("NOT_FOUND", { status: 404 }),
      );

      await expect(
        callPage(target, { q: "react", page: "3" }),
      ).rejects.toMatchObject({ digest: NOT_FOUND_DIGEST });
    });

    it("仕様 6.1（補強）: 検索条件が付いていても API エラーの表示は変わらず、「トップへ戻る」リンクは出ない", async () => {
      getRepository.mockRejectedValue(
        new GitHubApiError("UPSTREAM", { status: 502 }),
      );

      await renderPage(target, { q: "react", page: "3" });

      expect(
        within(screen.getByRole("alert")).getByText(
          "データの取得中にエラーが発生しました",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "トップへ戻る" })).toBeNull();
    });
  });
});
