// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GitHubApiError, classifyHttpError, isGitHubApiError } from "./errors";

describe("classifyHttpError", () => {
  it("AC-24a: 429 のとき RATE_LIMIT に分類される", () => {
    const e = classifyHttpError(429, new Headers(), "search");
    expect(e.kind).toBe("RATE_LIMIT");
    expect(e.status).toBe(429);
  });

  it("AC-24a: 403 で x-ratelimit-remaining が 0 のとき RATE_LIMIT に分類され、x-ratelimit-reset からリセット時刻を保持する", () => {
    const headers = new Headers({
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": "1700000000",
    });
    const e = classifyHttpError(403, headers, "repo");
    expect(e.kind).toBe("RATE_LIMIT");
    expect(e.status).toBe(403);
    expect(e.resetAt).toEqual(new Date(1700000000000));
  });

  it("AC-24a: 429 でも x-ratelimit-reset があればリセット時刻を保持する", () => {
    const headers = new Headers({ "x-ratelimit-reset": "1700000000" });
    const e = classifyHttpError(429, headers, "search");
    expect(e.kind).toBe("RATE_LIMIT");
    expect(e.resetAt).toEqual(new Date(1700000000000));
  });

  it("AC-24a: x-ratelimit-reset が無い、または数値でないときはリセット時刻を持たない", () => {
    const none = classifyHttpError(
      403,
      new Headers({ "x-ratelimit-remaining": "0" }),
      "search",
    );
    expect(none.kind).toBe("RATE_LIMIT");
    expect(none.resetAt).toBeUndefined();

    const invalid = classifyHttpError(
      403,
      new Headers({
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "abc",
      }),
      "search",
    );
    expect(invalid.kind).toBe("RATE_LIMIT");
    expect(invalid.resetAt).toBeUndefined();
  });

  it("AC-24b: 詳細 API の 404 は NOT_FOUND に分類される", () => {
    const e = classifyHttpError(404, new Headers(), "repo");
    expect(e.kind).toBe("NOT_FOUND");
    expect(e.status).toBe(404);
  });

  it("AC-24c: 検索 API の 422 は VALIDATION に分類される", () => {
    const e = classifyHttpError(422, new Headers(), "search");
    expect(e.kind).toBe("VALIDATION");
    expect(e.status).toBe(422);
  });

  it.each([500, 502, 503])("AC-24d: %i は UPSTREAM に分類される", (status) => {
    const e = classifyHttpError(status, new Headers(), "search");
    expect(e.kind).toBe("UPSTREAM");
    expect(e.status).toBe(status);
    expect(e.resetAt).toBeUndefined();
  });

  it("AC-24d: 403 で x-ratelimit-remaining が 0 でないとき、および 401 は UPSTREAM に分類される", () => {
    const forbidden = classifyHttpError(
      403,
      new Headers({ "x-ratelimit-remaining": "42" }),
      "repo",
    );
    expect(forbidden.kind).toBe("UPSTREAM");

    const noHeader = classifyHttpError(403, new Headers(), "repo");
    expect(noHeader.kind).toBe("UPSTREAM");

    const unauthorized = classifyHttpError(401, new Headers(), "search");
    expect(unauthorized.kind).toBe("UPSTREAM");
    expect(unauthorized.status).toBe(401);
  });

  it("AC-24d: 検索 API の 404、詳細 API の 422 は UPSTREAM に分類される", () => {
    expect(classifyHttpError(404, new Headers(), "search").kind).toBe(
      "UPSTREAM",
    );
    expect(classifyHttpError(422, new Headers(), "repo").kind).toBe("UPSTREAM");
  });
});

describe("GitHubApiError", () => {
  it("AC-23d: メッセージは種別ごとの固定文言で、cause を持たない", () => {
    const e = classifyHttpError(429, new Headers(), "search");
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe("GitHub API rate limit exceeded");
    expect(e.cause).toBeUndefined();
  });
});

describe("isGitHubApiError", () => {
  it("isGitHubApiError: GitHubApiError のときだけ true を返す", () => {
    expect(isGitHubApiError(new GitHubApiError("NETWORK"))).toBe(true);
    expect(isGitHubApiError(new Error("x"))).toBe(false);
    expect(isGitHubApiError({ kind: "NETWORK" })).toBe(false);
    expect(isGitHubApiError(null)).toBe(false);
    expect(isGitHubApiError("NETWORK")).toBe(false);
  });
});
