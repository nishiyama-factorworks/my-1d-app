// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isGitHubApiError } from "./errors";
import { githubGet } from "./http";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function stubFetch(impl: (url: URL, init: RequestInit) => Promise<Response>) {
  const mock = vi.fn((input: string | URL, init?: RequestInit) =>
    impl(new URL(String(input)), init ?? {}),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

function calledUrl(mock: ReturnType<typeof stubFetch>): URL {
  return new URL(String(mock.mock.calls[0]?.[0]));
}

function calledHeaders(mock: ReturnType<typeof stubFetch>): Headers {
  return new Headers(mock.mock.calls[0]?.[1]?.headers);
}

async function catchError(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  return undefined;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("githubGet: ヘッダとトークン", () => {
  it("AC-23a: GITHUB_TOKEN があるとき Authorization・Accept・X-GitHub-Api-Version ヘッダを付けて呼ぶ", async () => {
    vi.stubEnv("GITHUB_TOKEN", "test-token-dummy");
    const fetchMock = stubFetch(async () => jsonResponse({ ok: true }));

    await githubGet("repo", "/repos/vercel/next.js");

    const headers = calledHeaders(fetchMock);
    expect(headers.get("Authorization")).toBe("Bearer test-token-dummy");
    expect(headers.get("Accept")).toBe("application/vnd.github+json");
    expect(headers.get("X-GitHub-Api-Version")).toBe("2022-11-28");
  });

  it("AC-23b: GITHUB_TOKEN が未設定のとき Authorization ヘッダ無しで呼び、成功する", async () => {
    vi.stubEnv("GITHUB_TOKEN", undefined);
    const fetchMock = stubFetch(async () => jsonResponse({ ok: true }));

    const result = await githubGet("repo", "/repos/vercel/next.js");

    expect(result).toEqual({ ok: true });
    const headers = calledHeaders(fetchMock);
    expect(headers.has("Authorization")).toBe(false);
    expect(headers.get("Accept")).toBe("application/vnd.github+json");
  });

  it("AC-23b: GITHUB_TOKEN が空文字のときも Authorization ヘッダを付けない", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    const fetchMock = stubFetch(async () => jsonResponse({ ok: true }));

    await githubGet("repo", "/repos/vercel/next.js");

    expect(calledHeaders(fetchMock).has("Authorization")).toBe(false);
  });
});

describe("githubGet: URL の組み立て", () => {
  it("ベース URL は https://api.github.com で、指定したパスを呼ぶ", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({}));

    await githubGet("search", "/search/repositories");

    const url = calledUrl(fetchMock);
    expect(url.origin).toBe("https://api.github.com");
    expect(url.pathname).toBe("/search/repositories");
  });

  it("クエリは URLSearchParams でエンコードされ、1つのパラメータとして渡る", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({}));

    await githubGet("search", "/search/repositories", {
      q: "a&per_page=1 #x",
      page: "2",
    });

    const url = calledUrl(fetchMock);
    expect(url.searchParams.get("q")).toBe("a&per_page=1 #x");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.has("per_page")).toBe(false);
    expect(url.hash).toBe("");
  });
});

describe("githubGet: 宛先の固定", () => {
  it.each([
    "//evil.example/x",
    "https://evil.example/",
    "http://api.github.com/x",
  ])(
    "AC-23e: 絶対 URL（%s）を path に渡すと fetch を呼ばず VALIDATION で失敗する",
    async (path) => {
      const fetchMock = stubFetch(async () => jsonResponse({}));

      const e = await catchError(githubGet("repo", path));

      expect(isGitHubApiError(e)).toBe(true);
      expect(e).toMatchObject({ kind: "VALIDATION" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("AC-23e: /repos/vercel/next.js のような通常のパスは成功する", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ ok: true }));

    const result = await githubGet("repo", "/repos/vercel/next.js");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("githubGet: 失敗の分類", () => {
  it("非機能: HTTP エラー応答のとき本文ストリームを破棄（cancel）する", async () => {
    let cancelled = false;
    stubFetch(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              cancelled = true;
            },
          }),
          { status: 429, headers: { "x-ratelimit-reset": "1700000000" } },
        ),
    );

    const e = await catchError(githubGet("search", "/search/repositories"));

    expect(e).toMatchObject({ kind: "RATE_LIMIT" });
    expect(cancelled).toBe(true);
  });

  it("非機能: エラー応答の本文の cancel が永久に解決しなくても、待たずに RATE_LIMIT で失敗する", async () => {
    stubFetch(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              return new Promise(() => {});
            },
          }),
          { status: 429 },
        ),
    );

    const outcome = await Promise.race([
      catchError(githubGet("search", "/search/repositories")),
      new Promise<string>((resolve) => setTimeout(() => resolve("HUNG"), 500)),
    ]);

    expect(outcome).not.toBe("HUNG");
    expect(outcome).toMatchObject({ kind: "RATE_LIMIT" });
  });

  it("AC-24e: fetch が TypeError で失敗したとき NETWORK になる", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });

    const e = await catchError(githubGet("repo", "/repos/vercel/next.js"));

    expect(isGitHubApiError(e)).toBe(true);
    expect(e).toMatchObject({ kind: "NETWORK", status: undefined });
  });

  it("AC-24e: 10秒以内に応答が無いとき中断され NETWORK になる", async () => {
    vi.useFakeTimers();
    stubFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );

    let settled = false;
    const result = catchError(githubGet("repo", "/repos/vercel/next.js")).then(
      (e) => {
        settled = true;
        return e;
      },
    );

    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const e = await result;
    expect(settled).toBe(true);
    expect(isGitHubApiError(e)).toBe(true);
    expect(e).toMatchObject({ kind: "NETWORK" });
  });

  it("AC-24e: ヘッダ受信後、本文の読み取り中に10秒を超えたときも NETWORK になる", async () => {
    vi.useFakeTimers();
    stubFetch(async (_url, init) => {
      // ヘッダは返るが、本文は中断されるまで届かない
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init.signal?.addEventListener("abort", () => {
            controller.error(new DOMException("aborted", "AbortError"));
          });
        },
      });
      return new Response(body, { status: 200 });
    });

    const result = catchError(githubGet("repo", "/repos/vercel/next.js"));
    await vi.advanceTimersByTimeAsync(10_000);

    const e = await result;
    expect(isGitHubApiError(e)).toBe(true);
    expect(e).toMatchObject({ kind: "NETWORK" });
  });

  it("AC-24e: 応答後はタイマーが解除される", async () => {
    vi.useFakeTimers();
    stubFetch(async () => jsonResponse({ ok: true }));

    await githubGet("repo", "/repos/vercel/next.js");

    expect(vi.getTimerCount()).toBe(0);
  });

  it("AC-24d: 応答本文が JSON として読めないとき UPSTREAM になる", async () => {
    stubFetch(
      async () => new Response("<html>not json</html>", { status: 200 }),
    );

    const e = await catchError(githubGet("repo", "/repos/vercel/next.js"));

    expect(isGitHubApiError(e)).toBe(true);
    expect(e).toMatchObject({ kind: "UPSTREAM" });
  });

  it("HTTP エラー応答のとき classifyHttpError の結果で失敗する（429 は RATE_LIMIT）", async () => {
    stubFetch(async () =>
      jsonResponse(
        { message: "rate limited" },
        { status: 429, headers: { "x-ratelimit-reset": "1700000000" } },
      ),
    );

    const e = await catchError(githubGet("search", "/search/repositories"));

    expect(isGitHubApiError(e)).toBe(true);
    expect(e).toMatchObject({
      kind: "RATE_LIMIT",
      status: 429,
      resetAt: new Date(1700000000000),
    });
  });
});

describe("githubGet: キャッシュの再検証時間", () => {
  function calledInit(mock: ReturnType<typeof stubFetch>) {
    return mock.mock.calls[0]?.[1];
  }

  it("AC-29a: endpoint が search のとき fetch の next.revalidate に 300 を渡す", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({}));

    await githubGet("search", "/search/repositories", { q: "react" });

    expect(calledInit(fetchMock)?.next).toEqual({ revalidate: 300 });
  });

  it("AC-29b: endpoint が repo のとき fetch の next.revalidate に 600 を渡す", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({}));

    await githubGet("repo", "/repos/vercel/next.js");

    expect(calledInit(fetchMock)?.next).toEqual({ revalidate: 600 });
  });

  it.each(["search", "repo"] as const)(
    "AC-29a・29b（補強）: endpoint が %s のとき cache オプションは指定しない",
    async (endpoint) => {
      const fetchMock = stubFetch(async () => jsonResponse({}));

      await githubGet(endpoint, "/repos/vercel/next.js");

      expect(calledInit(fetchMock)?.cache).toBeUndefined();
    },
  );

  it.each(["search", "repo"] as const)(
    "AC-29a・29b（補強）: endpoint が %s のとき再検証時間を付けても signal は渡したままである",
    async (endpoint) => {
      const fetchMock = stubFetch(async () => jsonResponse({}));

      await githubGet(endpoint, "/repos/vercel/next.js");

      expect(calledInit(fetchMock)?.signal).toBeInstanceOf(AbortSignal);
    },
  );
});
