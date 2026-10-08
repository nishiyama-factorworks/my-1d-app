// @vitest-environment node
import { describe, expect, it } from "vitest";
import { repoPathFromFullName } from "./repo-path";

const SEARCH = { q: "react", page: 1 };

describe("repoPathFromFullName", () => {
  it('AC-10: "vercel/next.js" から /repos/vercel/next.js?q=react&page=1 を作る', () => {
    expect(repoPathFromFullName("vercel/next.js", SEARCH)).toBe(
      "/repos/vercel/next.js?q=react&page=1",
    );
  });

  it("AC-15e: 検索条件 { q: react, page: 3 } を付けると /repos/vercel/next.js?q=react&page=3 になる", () => {
    expect(
      repoPathFromFullName("vercel/next.js", { q: "react", page: 3 }),
    ).toBe("/repos/vercel/next.js?q=react&page=3");
  });

  it('AC-10: repo 名の "." "-" "_" はそのまま残る', () => {
    expect(repoPathFromFullName("a-b/c.d_e", SEARCH)).toBe(
      "/repos/a-b/c.d_e?q=react&page=1",
    );
  });

  it('AC-10: repo 側に "/" があっても最初の "/" で分け、repo 側は符号化される', () => {
    expect(repoPathFromFullName("a/b/c", SEARCH)).toBe(
      "/repos/a/b%2Fc?q=react&page=1",
    );
  });

  it.each(["vercel", "/next.js", "vercel/"])(
    'AC-10: "/" を含まない、または owner・repo が空の fullName（%j）は GitHubApiError（UPSTREAM）を投げる',
    (fullName) => {
      expect(() => repoPathFromFullName(fullName, SEARCH)).toThrow(
        expect.objectContaining({ name: "GitHubApiError", kind: "UPSTREAM" }),
      );
    },
  );
});
