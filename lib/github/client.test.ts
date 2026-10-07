// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getRepository,
  isGitHubApiError,
  searchRepositories,
  type GitHubErrorKind,
} from "@/lib/github";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

// 呼ばれるたびに新しい Response を返す（本文は 1 度しか読めないため）。
function stubFetch(make: () => Response | Promise<Response>) {
  const mock = vi.fn((input: string | URL, init?: RequestInit) => {
    void input;
    void init;
    return Promise.resolve(make());
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function stubFetchReject(error: unknown) {
  const mock = vi.fn(() => Promise.reject(error));
  vi.stubGlobal("fetch", mock);
  return mock;
}

function calledUrl(mock: { mock: { calls: unknown[][] } }): URL {
  return new URL(String(mock.mock.calls[0]?.[0]));
}

function calledHeaders(mock: { mock: { calls: unknown[][] } }): Headers {
  const init = mock.mock.calls[0]?.[1] as RequestInit | undefined;
  return new Headers(init?.headers);
}

async function catchError(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  return undefined;
}

function searchBody(count = 30, totalCount = 1234) {
  return {
    total_count: totalCount,
    incomplete_results: false,
    items: Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      full_name: `owner${i}/repo${i}`,
      private: false,
      owner: {
        login: `owner${i}`,
        avatar_url: `https://avatars.githubusercontent.com/u/${i}`,
      },
    })),
  };
}

function repoBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    full_name: "vercel/next.js",
    private: false,
    owner: {
      login: "vercel",
      avatar_url: "https://avatars.githubusercontent.com/u/14985020",
    },
    language: "TypeScript",
    stargazers_count: 100,
    watchers_count: 999,
    subscribers_count: 7,
    forks_count: 20,
    open_issues_count: 5,
    html_url: "https://github.com/vercel/next.js",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("searchRepositories", () => {
  it("AC-5a: q=react page=2 のとき /search/repositories に q・page・per_page=30 を付けて呼び、sort と order を付けない", async () => {
    const mock = stubFetch(() => jsonResponse(searchBody()));

    await searchRepositories({ q: "react", page: 2 });

    expect(mock).toHaveBeenCalledTimes(1);
    const url = calledUrl(mock);
    expect(url.origin).toBe("https://api.github.com");
    expect(url.pathname).toBe("/search/repositories");
    expect(url.searchParams.get("q")).toBe("react");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("30");
    expect(url.searchParams.has("sort")).toBe(false);
    expect(url.searchParams.has("order")).toBe(false);
  });

  it("AC-5a: page を省略すると page=1 で呼ぶ", async () => {
    const mock = stubFetch(() => jsonResponse(searchBody()));

    await searchRepositories({ q: "react" });

    expect(calledUrl(mock).searchParams.get("page")).toBe("1");
  });

  it("AC-5a: q に & # 空白 を含むとき、1つの q パラメータとしてエンコードされ per_page は 30 のままになる", async () => {
    const mock = stubFetch(() => jsonResponse(searchBody()));
    const q = "a&per_page=1 #x";

    await searchRepositories({ q });

    const url = calledUrl(mock);
    expect(url.searchParams.get("q")).toBe(q);
    expect(url.searchParams.getAll("per_page")).toEqual(["30"]);
    expect(url.hash).toBe("");
  });

  it("AC-5b: 検索 API の total_count=1234 と 30件を totalCount と items 30件として返す", async () => {
    stubFetch(() => jsonResponse(searchBody(30, 1234)));

    const result = await searchRepositories({ q: "react" });

    expect(result.totalCount).toBe(1234);
    expect(result.items).toHaveLength(30);
    expect(result.items[0]).toEqual({
      fullName: "owner0/repo0",
      ownerLogin: "owner0",
      ownerAvatarUrl: "https://avatars.githubusercontent.com/u/0",
    });
  });
});

describe("getRepository", () => {
  it("AC-13a: 詳細 API の各数値と言語を RepoDetail として返し、Star 数と Watcher 数は別の値になる", async () => {
    stubFetch(() => jsonResponse(repoBody()));

    const detail = await getRepository("vercel", "next.js");

    expect(detail).toEqual({
      fullName: "vercel/next.js",
      ownerLogin: "vercel",
      ownerAvatarUrl: "https://avatars.githubusercontent.com/u/14985020",
      language: "TypeScript",
      stargazersCount: 100,
      watchersCount: 7,
      forksCount: 20,
      openIssuesCount: 5,
      htmlUrl: "https://github.com/vercel/next.js",
    });
    expect(detail.stargazersCount).not.toBe(detail.watchersCount);
  });

  it("AC-13b: 詳細 API の language が null のとき null を返し、失敗しない", async () => {
    stubFetch(() => jsonResponse(repoBody({ language: null })));

    const detail = await getRepository("vercel", "next.js");

    expect(detail.language).toBeNull();
  });

  it("getRepository は /repos/{owner}/{repo} を呼ぶ", async () => {
    const mock = stubFetch(() => jsonResponse(repoBody()));

    await getRepository("vercel", "next.js");

    const url = calledUrl(mock);
    expect(url.origin).toBe("https://api.github.com");
    expect(url.pathname).toBe("/repos/vercel/next.js");
  });

  it("getRepository は owner と repo をそのまま 1 セグメントずつのパスにして呼ぶ", async () => {
    const mock = stubFetch(() => jsonResponse(repoBody()));

    await getRepository("my-org", "my_repo.js");

    expect(String(mock.mock.calls[0]?.[0])).toBe(
      "https://api.github.com/repos/my-org/my_repo.js",
    );
  });
});

describe("トークンとヘッダ", () => {
  const calls = [
    [
      "searchRepositories",
      () => searchRepositories({ q: "react" }),
      () => jsonResponse(searchBody()),
    ],
    [
      "getRepository",
      () => getRepository("vercel", "next.js"),
      () => jsonResponse(repoBody()),
    ],
  ] as const;

  it.each(calls)(
    "AC-23a: GITHUB_TOKEN があるとき %s は Authorization・Accept・X-GitHub-Api-Version を付けて呼ぶ",
    async (_name, call, response) => {
      vi.stubEnv("GITHUB_TOKEN", "test-token-dummy");
      const mock = stubFetch(response);

      await call();

      const headers = calledHeaders(mock);
      expect(headers.get("authorization")).toBe("Bearer test-token-dummy");
      expect(headers.get("accept")).toBe("application/vnd.github+json");
      expect(headers.get("x-github-api-version")).toBe("2022-11-28");
    },
  );

  describe.each([
    ["未設定（undefined）", undefined],
    ["空文字", ""],
  ])("AC-23b: GITHUB_TOKEN が%s", (_label, value) => {
    it.each(calls)(
      "%s は Authorization 無しで呼び、成功する",
      async (_name, call, response) => {
        vi.stubEnv("GITHUB_TOKEN", value);
        const mock = stubFetch(response);

        await expect(call()).resolves.toBeDefined();

        expect(calledHeaders(mock).has("authorization")).toBe(false);
      },
    );
  });
});

describe("失敗の分類", () => {
  const fns = [
    ["searchRepositories", () => searchRepositories({ q: "react" })],
    ["getRepository", () => getRepository("vercel", "next.js")],
  ] as const;

  async function expectKind(
    p: Promise<unknown>,
    kind: GitHubErrorKind,
  ): Promise<unknown> {
    const e = await catchError(p);
    expect(isGitHubApiError(e)).toBe(true);
    if (isGitHubApiError(e)) expect(e.kind).toBe(kind);
    return e;
  }

  it.each(fns)(
    "AC-24a: %s は 429 のとき RATE_LIMIT で失敗する",
    async (_name, call) => {
      stubFetch(() => new Response("{}", { status: 429 }));

      await expectKind(call(), "RATE_LIMIT");
    },
  );

  it.each(fns)(
    "AC-24a: %s は 403 + x-ratelimit-remaining: 0 のとき RATE_LIMIT で失敗し、リセット時刻を持つ",
    async (_name, call) => {
      stubFetch(
        () =>
          new Response("{}", {
            status: 403,
            headers: {
              "x-ratelimit-remaining": "0",
              "x-ratelimit-reset": "1700000000",
            },
          }),
      );

      const e = await expectKind(call(), "RATE_LIMIT");

      if (isGitHubApiError(e)) {
        expect(e.resetAt).toEqual(new Date(1700000000 * 1000));
      }
    },
  );

  it("AC-24b: getRepository で 404 のとき NOT_FOUND で失敗する", async () => {
    stubFetch(() => new Response("{}", { status: 404 }));

    await expectKind(getRepository("vercel", "next.js"), "NOT_FOUND");
  });

  it("AC-24c: searchRepositories で 422 のとき VALIDATION で失敗する", async () => {
    stubFetch(() => new Response("{}", { status: 422 }));

    await expectKind(searchRepositories({ q: "react" }), "VALIDATION");
  });

  describe.each(fns)("AC-24d: %s", (_name, call) => {
    it.each([500, 502, 503])(
      "AC-24d: %i のとき UPSTREAM で失敗する",
      async (status) => {
        stubFetch(() => new Response("{}", { status }));

        await expectKind(call(), "UPSTREAM");
      },
    );

    it("AC-24d: 想定外の JSON のとき UPSTREAM で失敗する", async () => {
      stubFetch(() => jsonResponse({ unexpected: true }));

      await expectKind(call(), "UPSTREAM");
    });
  });

  it.each(fns)(
    "AC-24e: %s は fetch が接続失敗したとき NETWORK で失敗する",
    async (_name, call) => {
      stubFetchReject(new TypeError("fetch failed"));

      await expectKind(call(), "NETWORK");
    },
  );

  describe("AC-24e: 公開関数でのタイムアウト", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it.each(fns)(
      "AC-24e: %s は 10 秒で応答が無いとき NETWORK で失敗する",
      async (_name, call) => {
        vi.useFakeTimers();
        const mock = vi.fn(
          (_input: string | URL, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => {
                reject(new DOMException("aborted", "AbortError"));
              });
            }),
        );
        vi.stubGlobal("fetch", mock);

        const result = catchError(call());
        await vi.advanceTimersByTimeAsync(10_000);

        const e = await result;
        expect(isGitHubApiError(e)).toBe(true);
        if (isGitHubApiError(e)) expect(e.kind).toBe("NETWORK");
      },
    );
  });
});

describe("入力検証（searchRepositories）", () => {
  async function expectValidation(
    params: Parameters<typeof searchRepositories>[0],
  ) {
    const mock = stubFetch(() => jsonResponse(searchBody()));

    const e = await catchError(searchRepositories(params));

    expect(isGitHubApiError(e)).toBe(true);
    if (isGitHubApiError(e)) expect(e.kind).toBe("VALIDATION");
    expect(mock).not.toHaveBeenCalled();
  }

  it.each([
    ["空文字", ""],
    ["空白のみ", "   "],
    ["全角空白とタブのみ", "\u3000\t "],
  ])(
    "AC-5c: q が%sのとき fetch を呼ばず VALIDATION で失敗する",
    async (_label, q) => {
      await expectValidation({ q });
    },
  );

  it.each([
    ["0", 0],
    ["負数", -1],
    ["小数", 1.5],
    ["NaN", Number.NaN],
  ])(
    "AC-5d: page が%sのとき fetch を呼ばず VALIDATION で失敗する",
    async (_label, page) => {
      await expectValidation({ q: "react", page });
    },
  );

  it.each([
    ["0", 0],
    ["101", 101],
    ["小数", 1.5],
  ])(
    "AC-5d: perPage が%sのとき fetch を呼ばず VALIDATION で失敗する",
    async (_label, perPage) => {
      await expectValidation({ q: "react", perPage });
    },
  );

  it.each([1, 100])(
    "AC-5d: perPage が境界値 %i のとき fetch を呼び、per_page に反映して成功する",
    async (perPage) => {
      const mock = stubFetch(() => jsonResponse(searchBody()));

      await searchRepositories({ q: "react", perPage });

      expect(mock).toHaveBeenCalledTimes(1);
      expect(calledUrl(mock).searchParams.get("per_page")).toBe(
        String(perPage),
      );
    },
  );

  it.each([
    ["英字257文字", "a".repeat(257)],
    ["英字1文字と空白256文字の257文字", `a${" ".repeat(256)}`],
  ])(
    "AC-5e: q が%sのとき fetch を呼ばず VALIDATION で失敗する",
    async (_label, q) => {
      await expectValidation({ q });
    },
  );

  it("AC-5e: q が256文字ちょうどのとき fetch を呼んで成功する", async () => {
    const mock = stubFetch(() => jsonResponse(searchBody()));
    const q = "a".repeat(256);

    await searchRepositories({ q });

    expect(mock).toHaveBeenCalledTimes(1);
    expect(calledUrl(mock).searchParams.get("q")).toBe(q);
  });

  it("AC-5d: page が境界値 1 のとき fetch を呼んで成功する", async () => {
    const mock = stubFetch(() => jsonResponse(searchBody()));

    await searchRepositories({ q: "react", page: 1 });

    expect(mock).toHaveBeenCalledTimes(1);
    expect(calledUrl(mock).searchParams.get("page")).toBe("1");
  });
});

describe("入力検証（getRepository）", () => {
  const validOwner = "vercel";
  const validRepo = "next.js";

  async function expectNotFound(owner: string, repo: string) {
    const mock = stubFetch(() => jsonResponse(repoBody()));

    const e = await catchError(getRepository(owner, repo));

    expect(isGitHubApiError(e)).toBe(true);
    if (isGitHubApiError(e)) expect(e.kind).toBe("NOT_FOUND");
    expect(mock).not.toHaveBeenCalled();
  }

  it.each([
    ["空文字", ""],
    ["40文字", "a".repeat(40)],
    ["記号を含む", "ver$cel"],
    ["スラッシュを含む", "ver/cel"],
  ])(
    "AC-13c: owner が%sのとき fetch を呼ばず NOT_FOUND で失敗する",
    async (_label, owner) => {
      await expectNotFound(owner, validRepo);
    },
  );

  it.each([
    ["空文字", ""],
    ["101文字", "a".repeat(101)],
    ["スラッシュを含む", "next/js"],
    ["ドット1つ", "."],
    ["ドット2つ", ".."],
  ])(
    "AC-13c: repo が%sのとき fetch を呼ばず NOT_FOUND で失敗する",
    async (_label, repo) => {
      await expectNotFound(validOwner, repo);
    },
  );

  it.each([
    ["vercel", "next.js"],
    ["my-org", "my_repo"],
    ["a".repeat(39), "repo"],
    ["vercel", "a".repeat(100)],
  ])(
    "AC-13c: 有効な owner=%s repo=%s のとき fetch を呼んで成功する",
    async (owner, repo) => {
      const mock = stubFetch(() => jsonResponse(repoBody()));

      await expect(getRepository(owner, repo)).resolves.toBeDefined();

      expect(mock).toHaveBeenCalledTimes(1);
    },
  );
});
