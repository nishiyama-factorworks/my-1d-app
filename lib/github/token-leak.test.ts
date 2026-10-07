// @vitest-environment node
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getRepository, searchRepositories } from "@/lib/github";

const SENTINEL = "test-token-SENTINEL-0003";
const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;

type ConsoleSpy = ReturnType<typeof vi.spyOn>;
let consoleSpies: ConsoleSpy[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("GITHUB_TOKEN", SENTINEL);
  consoleSpies = CONSOLE_METHODS.map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {}),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const calls = {
  search: () => searchRepositories({ q: "react" }),
  repo: () => getRepository("vercel", "next.js"),
};

// SENTINEL をヘッダと本文に含めたレスポンス（サーバーがトークンを反射した想定）。
function leakyResponse(status: number, extra: Record<string, string> = {}) {
  return () =>
    new Response(JSON.stringify({ message: `echo ${SENTINEL}` }), {
      status,
      headers: {
        "content-type": "application/json",
        "x-leaked": SENTINEL,
        authorization: `Bearer ${SENTINEL}`,
        ...extra,
      },
    });
}

function stubFetchResponse(make: () => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(make())),
  );
}

type Failure = { name: string; setup: () => void };

const failures: Failure[] = [
  { name: "429", setup: () => stubFetchResponse(leakyResponse(429)) },
  {
    name: "403 + x-ratelimit-remaining: 0",
    setup: () =>
      stubFetchResponse(
        leakyResponse(403, {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "1700000000",
        }),
      ),
  },
  { name: "404", setup: () => stubFetchResponse(leakyResponse(404)) },
  { name: "422", setup: () => stubFetchResponse(leakyResponse(422)) },
  { name: "500", setup: () => stubFetchResponse(leakyResponse(500)) },
  {
    name: "接続失敗（例外メッセージにトークンを含む）",
    setup: () => {
      const err = new TypeError(`fetch failed: Bearer ${SENTINEL}`);
      vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.reject(err)),
      );
    },
  },
  {
    name: "タイムアウト",
    setup: () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_url: string, init?: RequestInit) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () =>
                reject(new Error(`aborted Bearer ${SENTINEL}`)),
              );
            }),
        ),
      );
    },
  },
  {
    name: "不正な JSON",
    setup: () =>
      stubFetchResponse(
        () =>
          new Response(`not json ${SENTINEL}`, {
            status: 200,
            headers: { "x-leaked": SENTINEL },
          }),
      ),
  },
];

async function captureError(p: Promise<unknown>): Promise<unknown> {
  const settled = p.then(
    () => ({ ok: true as const }),
    (e: unknown) => ({ ok: false as const, error: e }),
  );
  // タイムアウトのケースで abort を発火させる。他では何も起きない。
  await vi.advanceTimersByTimeAsync(10_000);
  const r = await settled;
  if (r.ok) throw new Error("エラーが投げられるはずが成功した");
  return r.error;
}

function allConsoleArgs(): string {
  return consoleSpies
    .flatMap((spy) => spy.mock.calls)
    .map((args) => inspect(args, { depth: null, showHidden: true }))
    .join("\n");
}

function serializations(e: unknown): Record<string, string> {
  const err = e as Error;
  return {
    message: String(err.message),
    stack: String(err.stack),
    string: String(e),
    json: JSON.stringify(e) ?? "",
    inspect: inspect(e, { depth: null, showHidden: true }),
  };
}

describe("AC-23d: トークンが漏れない", () => {
  for (const [fnName, call] of Object.entries(calls)) {
    for (const failure of failures) {
      it(`AC-23d: ${fnName} で ${failure.name} のとき、エラーのどの表現にもトークンが含まれない`, async () => {
        failure.setup();

        const error = await captureError(call());

        expect(error).toBeInstanceOf(Error);
        for (const [form, text] of Object.entries(serializations(error))) {
          expect(text, `${form} にトークンが含まれている`).not.toContain(
            SENTINEL,
          );
        }
      });

      it(`AC-23d: ${fnName} で ${failure.name} のとき、console にトークンが出力されない`, async () => {
        failure.setup();

        await captureError(call());

        expect(allConsoleArgs()).not.toContain(SENTINEL);
      });
    }
  }

  it("AC-23d: 検索が成功したとき、戻り値と console にトークンが含まれない", async () => {
    stubFetchResponse(
      () =>
        new Response(
          JSON.stringify({
            total_count: 1,
            incomplete_results: false,
            items: [
              {
                id: 1,
                full_name: "a/b",
                owner: { login: "a", avatar_url: "https://example.com/a" },
              },
            ],
          }),
          { status: 200, headers: { "x-leaked": SENTINEL } },
        ),
    );

    const result = await searchRepositories({ q: "react" });

    expect(JSON.stringify(result)).not.toContain(SENTINEL);
    expect(allConsoleArgs()).not.toContain(SENTINEL);
  });

  it("AC-23d: 詳細取得が成功したとき、戻り値と console にトークンが含まれない", async () => {
    stubFetchResponse(
      () =>
        new Response(
          JSON.stringify({
            id: 1,
            full_name: "vercel/next.js",
            owner: { login: "vercel", avatar_url: "https://example.com/v" },
            language: "TypeScript",
            stargazers_count: 100,
            watchers_count: 999,
            subscribers_count: 7,
            forks_count: 20,
            open_issues_count: 5,
            html_url: "https://github.com/vercel/next.js",
          }),
          { status: 200, headers: { "x-leaked": SENTINEL } },
        ),
    );

    const result = await getRepository("vercel", "next.js");

    expect(JSON.stringify(result)).not.toContain(SENTINEL);
    expect(allConsoleArgs()).not.toContain(SENTINEL);
  });
});
