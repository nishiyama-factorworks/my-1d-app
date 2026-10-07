// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GitHubApiError } from "./errors";
import { mapRepositoryResponse, mapSearchResponse } from "./mappers";

function makeSearchItem(i: number) {
  return {
    id: 1000 + i,
    node_id: `node-${i}`,
    name: `repo-${i}`,
    full_name: `owner-${i}/repo-${i}`,
    stargazers_count: i,
    owner: {
      login: `owner-${i}`,
      id: 2000 + i,
      avatar_url: `https://avatars.githubusercontent.com/u/${2000 + i}?v=4`,
    },
  };
}

function makeSearchResponse(count = 30, totalCount = 1234) {
  return {
    total_count: totalCount,
    incomplete_results: false,
    items: Array.from({ length: count }, (_, i) => makeSearchItem(i)),
  };
}

function makeRepoResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 12345,
    full_name: "vercel/next.js",
    html_url: "https://github.com/vercel/next.js",
    language: "TypeScript",
    stargazers_count: 120000,
    watchers_count: 120000,
    subscribers_count: 1500,
    forks_count: 25000,
    open_issues_count: 3000,
    owner: {
      login: "vercel",
      id: 14985020,
      avatar_url: "https://avatars.githubusercontent.com/u/14985020?v=4",
    },
    ...overrides,
  };
}

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

function expectUpstream(fn: () => unknown) {
  const e = catchError(fn);
  expect(e).toBeInstanceOf(GitHubApiError);
  expect((e as GitHubApiError).kind).toBe("UPSTREAM");
}

describe("mapSearchResponse", () => {
  it("AC-5b: total_count=1234 と 30件の items を totalCount と RepoSummary 30件に変換し、各要素が fullName・ownerLogin・ownerAvatarUrl を持つ", () => {
    const result = mapSearchResponse(makeSearchResponse(30, 1234));

    expect(result.totalCount).toBe(1234);
    expect(result.items).toHaveLength(30);
    expect(result.items[0]).toEqual({
      fullName: "owner-0/repo-0",
      ownerLogin: "owner-0",
      ownerAvatarUrl: "https://avatars.githubusercontent.com/u/2000?v=4",
    });
    expect(result.items[29]).toEqual({
      fullName: "owner-29/repo-29",
      ownerLogin: "owner-29",
      ownerAvatarUrl: "https://avatars.githubusercontent.com/u/2029?v=4",
    });
  });

  it("AC-5b: items が空配列のとき totalCount と空の items を返す", () => {
    const result = mapSearchResponse(makeSearchResponse(0, 0));

    expect(result).toEqual({ totalCount: 0, items: [] });
  });

  it("仕様7節に無い項目（id や API の生の値）が検索結果に含まれない", () => {
    const result = mapSearchResponse(makeSearchResponse(3, 3));

    expect(Object.keys(result).sort()).toEqual(["items", "totalCount"]);
    for (const item of result.items) {
      expect(Object.keys(item).sort()).toEqual([
        "fullName",
        "ownerAvatarUrl",
        "ownerLogin",
      ]);
    }
  });

  it.each([
    ["入力が null", null],
    ["入力がオブジェクトでない", "not an object"],
    ["items が配列でない", { total_count: 1, items: "x" }],
    ["items が無い", { total_count: 1 }],
    ["total_count が文字列", { total_count: "1234", items: [] }],
    ["total_count が無い", { items: [] }],
    ["要素の owner が無い", { total_count: 1, items: [{ full_name: "a/b" }] }],
    [
      "要素の full_name が数値",
      {
        total_count: 1,
        items: [{ full_name: 1, owner: { login: "a", avatar_url: "u" } }],
      },
    ],
    [
      "要素の owner.avatar_url が無い",
      {
        total_count: 1,
        items: [{ full_name: "a/b", owner: { login: "a" } }],
      },
    ],
  ])(
    "AC-24d: 想定外の形（%s）は UPSTREAM の GitHubApiError になる",
    (_, json) => {
      expectUpstream(() => mapSearchResponse(json));
    },
  );
});

describe("mapRepositoryResponse", () => {
  it("AC-13a: stargazers_count・subscribers_count・forks_count・open_issues_count・language を RepoDetail に変換し、watchersCount は subscribers_count の値になる", () => {
    const result = mapRepositoryResponse(
      makeRepoResponse({ watchers_count: 99999, subscribers_count: 1500 }),
    );

    expect(result).toEqual({
      fullName: "vercel/next.js",
      ownerLogin: "vercel",
      ownerAvatarUrl: "https://avatars.githubusercontent.com/u/14985020?v=4",
      language: "TypeScript",
      stargazersCount: 120000,
      watchersCount: 1500,
      forksCount: 25000,
      openIssuesCount: 3000,
      htmlUrl: "https://github.com/vercel/next.js",
    });
    expect(result.watchersCount).not.toBe(99999);
  });

  it("AC-13b: language が null のとき language が null になり、例外を投げない", () => {
    const result = mapRepositoryResponse(makeRepoResponse({ language: null }));

    expect(result.language).toBeNull();
    expect(result.fullName).toBe("vercel/next.js");
  });

  it("仕様7節に無い項目（id や API の生の値）が詳細に含まれない", () => {
    const result = mapRepositoryResponse(makeRepoResponse());

    expect(Object.keys(result).sort()).toEqual([
      "forksCount",
      "fullName",
      "htmlUrl",
      "language",
      "openIssuesCount",
      "ownerAvatarUrl",
      "ownerLogin",
      "stargazersCount",
      "watchersCount",
    ]);
  });

  it.each([
    ["入力が null", null],
    ["stargazers_count が文字列", makeRepoResponse({ stargazers_count: "1" })],
    [
      "subscribers_count が無い",
      makeRepoResponse({ subscribers_count: undefined }),
    ],
    ["forks_count が文字列", makeRepoResponse({ forks_count: "2" })],
    [
      "open_issues_count が無い",
      makeRepoResponse({ open_issues_count: undefined }),
    ],
    ["owner が無い", makeRepoResponse({ owner: undefined })],
    [
      "owner.login が数値",
      makeRepoResponse({ owner: { login: 1, avatar_url: "u" } }),
    ],
    ["full_name が無い", makeRepoResponse({ full_name: undefined })],
    ["html_url が無い", makeRepoResponse({ html_url: undefined })],
    ["language が数値", makeRepoResponse({ language: 1 })],
  ])(
    "AC-24d: 想定外の形（%s）は UPSTREAM の GitHubApiError になる",
    (_, json) => {
      expectUpstream(() => mapRepositoryResponse(json));
    },
  );
});

const BAD_AVATAR_URLS = [
  "javascript:alert(1)",
  "http://avatars.githubusercontent.com/u/1",
  "https://evil.example/a.png",
  "https://evilgithubusercontent.com/a.png",
  "https://githubusercontent.com.evil.example/a",
  "not a url",
];

describe("mapSearchResponse: private と URL の検証", () => {
  it("AC-5f: private: true の要素だけが除外され、totalCount は API の値のままになる", () => {
    const json = {
      total_count: 99,
      items: [
        { ...makeSearchItem(0), private: true },
        { ...makeSearchItem(1), private: false },
        makeSearchItem(2),
      ],
    };

    const result = mapSearchResponse(json);

    expect(result.totalCount).toBe(99);
    expect(result.items.map((i) => i.fullName)).toEqual([
      "owner-1/repo-1",
      "owner-2/repo-2",
    ]);
  });

  it.each(BAD_AVATAR_URLS)(
    "AC-5g: owner.avatar_url が %s のとき UPSTREAM になる",
    (url) => {
      const item = makeSearchItem(0);
      item.owner.avatar_url = url;

      expectUpstream(() =>
        mapSearchResponse({ total_count: 1, items: [item] }),
      );
    },
  );

  it("AC-5g: owner.avatar_url が https://avatars.githubusercontent.com/u/1?v=4 のとき成功する", () => {
    const item = makeSearchItem(0);
    item.owner.avatar_url = "https://avatars.githubusercontent.com/u/1?v=4";

    const result = mapSearchResponse({ total_count: 1, items: [item] });

    expect(result.items[0].ownerAvatarUrl).toBe(
      "https://avatars.githubusercontent.com/u/1?v=4",
    );
  });
});

describe("mapRepositoryResponse: private と URL の検証", () => {
  it("AC-13d: private: true のとき NOT_FOUND の GitHubApiError になる", () => {
    const e = catchError(() =>
      mapRepositoryResponse(makeRepoResponse({ private: true })),
    );

    expect(e).toBeInstanceOf(GitHubApiError);
    expect((e as GitHubApiError).kind).toBe("NOT_FOUND");
  });

  it.each([
    ["private: false", { private: false }],
    ["private 未設定", {}],
  ])("AC-13d: %s のとき成功する", (_, overrides) => {
    const result = mapRepositoryResponse(makeRepoResponse(overrides));

    expect(result.fullName).toBe("vercel/next.js");
  });

  it.each(BAD_AVATAR_URLS)(
    "AC-13e: owner.avatar_url が %s のとき UPSTREAM になる",
    (url) => {
      expectUpstream(() =>
        mapRepositoryResponse(
          makeRepoResponse({ owner: { login: "vercel", avatar_url: url } }),
        ),
      );
    },
  );

  it.each([
    "javascript:alert(1)",
    "http://github.com/x",
    "https://evil.example/x",
    "https://github.com.evil.example/x",
    "https://notgithub.com/x",
  ])("AC-13e: html_url が %s のとき UPSTREAM になる", (url) => {
    expectUpstream(() =>
      mapRepositoryResponse(makeRepoResponse({ html_url: url })),
    );
  });

  it("AC-13e: html_url が https://github.com/vercel/next.js のとき成功する", () => {
    const result = mapRepositoryResponse(
      makeRepoResponse({ html_url: "https://github.com/vercel/next.js" }),
    );

    expect(result.htmlUrl).toBe("https://github.com/vercel/next.js");
  });
});
