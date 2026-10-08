import { act, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ErrorPage from "@/app/error";
import RootLayout from "@/app/layout";
import Home from "@/app/page";
import RepoDetailPage from "@/app/repos/[owner]/[repo]/page";
import NotFound from "@/app/repos/[owner]/[repo]/not-found";
import { GitHubApiError } from "@/lib/github/errors";
import type {
  RepoDetail,
  SearchRepositoriesParams,
  SearchRepositoriesResult,
} from "@/lib/github/types";

// フォントの取得は外部通信になるため、プロセス境界の外として差し替える。
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "font-test" }),
  Geist_Mono: () => ({ variable: "font-test" }),
}));

// 検索・詳細の取得 API（ネットワーク境界）だけを差し替える。
const { searchRepositories, getRepository, push, refresh } = vi.hoisted(() => ({
  searchRepositories:
    vi.fn<
      (params: SearchRepositoriesParams) => Promise<SearchRepositoriesResult>
    >(),
  getRepository: vi.fn<(owner: string, repo: string) => Promise<RepoDetail>>(),
  push: vi.fn<(href: string) => void>(),
  refresh: vi.fn<() => void>(),
}));

vi.mock("@/lib/github", () => ({ searchRepositories, getRepository }));

// SearchForm・RetryButton が useRouter を呼ぶため、useRouter だけ差し替える。
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push, refresh }),
}));

const sampleItems = [0, 1, 2].map((i) => ({
  fullName: `owner${i}/repo${i}`,
  ownerLogin: `owner${i}`,
  ownerAvatarUrl: `https://avatars.githubusercontent.com/u/${i}?v=4`,
}));

const sampleRepo: RepoDetail = {
  fullName: "vercel/next.js",
  ownerLogin: "vercel",
  ownerAvatarUrl: "https://avatars.githubusercontent.com/u/14985020?v=4",
  language: "TypeScript",
  stargazersCount: 1234567,
  watchersCount: 7,
  forksCount: 0,
  openIssuesCount: 5,
  htmlUrl: "https://github.com/vercel/next.js",
};

type TestSearchParams = Record<string, string | string[] | undefined>;

async function renderHome(searchParams: TestSearchParams) {
  await act(async () => {
    render(
      await Home({
        params: Promise.resolve({}),
        searchParams: Promise.resolve(searchParams),
      }),
    );
  });
}

async function renderDetail() {
  render(
    await RepoDetailPage({
      params: Promise.resolve({ owner: "vercel", repo: "next.js" }),
      searchParams: Promise.resolve({}),
    }),
  );
}

type Screen = {
  screen: string;
  setup: () => Promise<void>;
};

const searchStatusScreens: Screen[] = [
  {
    screen: "0件（/?q=zzzxqy）",
    setup: async () => {
      searchRepositories.mockResolvedValue({ totalCount: 0, items: [] });
      await renderHome({ q: "zzzxqy" });
    },
  },
  {
    screen: "範囲外（/?q=react&page=35。API を呼ばない）",
    setup: async () => {
      await renderHome({ q: "react", page: "35" });
    },
  },
  {
    screen: "範囲外（/?q=react&page=3・総件数50）",
    setup: async () => {
      searchRepositories.mockResolvedValue({ totalCount: 50, items: [] });
      await renderHome({ q: "react", page: "3" });
    },
  },
];

const screens: Screen[] = [
  {
    screen: "トップ（q なし）",
    setup: async () => {
      await renderHome({});
    },
  },
  {
    screen: "検索結果（/?q=react&page=2・総件数100）",
    setup: async () => {
      searchRepositories.mockResolvedValue({
        totalCount: 100,
        items: sampleItems,
      });
      await renderHome({ q: "react", page: "2" });
    },
  },
  ...searchStatusScreens,
  {
    screen: "トップの API エラー（UPSTREAM）",
    setup: async () => {
      searchRepositories.mockRejectedValue(
        new GitHubApiError("UPSTREAM", { status: 502 }),
      );
      await renderHome({ q: "react" });
    },
  },
  {
    screen: "詳細",
    setup: async () => {
      getRepository.mockResolvedValue(sampleRepo);
      await renderDetail();
    },
  },
  {
    screen: "詳細の 404（not-found.tsx）",
    setup: async () => {
      render(<NotFound />);
    },
  },
  {
    screen: "詳細の API エラー（UPSTREAM）",
    setup: async () => {
      getRepository.mockRejectedValue(
        new GitHubApiError("UPSTREAM", { status: 502 }),
      );
      await renderDetail();
    },
  },
  {
    screen: "error.tsx",
    setup: async () => {
      render(<ErrorPage error={new Error("boom")} retry={vi.fn()} />);
    },
  },
];

// 見出しのレベルを h1〜h6 のタグ、または aria-level から読む
function headingLevel(el: HTMLElement): number {
  const ariaLevel = el.getAttribute("aria-level");
  if (ariaLevel !== null) {
    return Number(ariaLevel);
  }
  return Number(el.tagName.slice(1));
}

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  // 画面ごとに明示する。既定では未設定（呼ばれたら undefined が返って失敗する）
  searchRepositories.mockReset();
  getRepository.mockReset();
});

describe("全画面の構造", () => {
  it.each(screens)(
    "AC-26c1: $screen では h1 がちょうど1つ、main がちょうど1つで、見出しのレベルが飛ばない",
    async ({ setup }) => {
      await setup();

      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getAllByRole("main")).toHaveLength(1);
      const levels = screen.getAllByRole("heading").map(headingLevel);
      expect(levels[0]).toBe(1);
      levels.slice(1).forEach((level, i) => {
        expect(level).toBeLessThanOrEqual(levels[i] + 1);
      });
    },
  );

  it.each(searchStatusScreens)(
    'AC-26d: $screen では role="status" の要素がちょうど1つあり、案内文がその中にある',
    async ({ setup }) => {
      await setup();

      const statuses = screen.getAllByRole("status");
      expect(statuses).toHaveLength(1);
      const text = within(statuses[0]).getByText(
        /一致するリポジトリは見つかりませんでした|指定されたページは存在しません/,
      );
      expect(text).toBeInTheDocument();
    },
  );

  it("AC-26c1 の前提: ルートレイアウトは main と見出しを持たない", () => {
    const html = renderToStaticMarkup(
      <RootLayout params={Promise.resolve({})}>
        <p>child</p>
      </RootLayout>,
    );

    expect(html).not.toContain("<main");
    expect(html).not.toMatch(/<h[1-6][\s>]/);
  });
});
