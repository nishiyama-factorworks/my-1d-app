// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GitHubApiError } from "@/lib/github/errors";
import { repoPathFromFullName } from "./repo-path";

describe("repoPathFromFullName", () => {
  it('AC-10: "vercel/next.js" から /repos/vercel/next.js を作る', () => {
    expect(repoPathFromFullName("vercel/next.js")).toBe("/repos/vercel/next.js");
  });

  it('AC-10: repo 名の "." "-" "_" はそのまま残る', () => {
    expect(repoPathFromFullName("a-b/c.d_e")).toBe("/repos/a-b/c.d_e");
  });

  it.each(["vercel", "/next.js", "vercel/"])(
    'AC-10: "/" を含まない、または owner・repo が空の fullName（%j）は GitHubApiError（UPSTREAM）を投げる',
    (fullName) => {
      expect(() => repoPathFromFullName(fullName)).toThrow(GitHubApiError);
      try {
        repoPathFromFullName(fullName);
      } catch (e) {
        expect(e).toBeInstanceOf(GitHubApiError);
        expect((e as GitHubApiError).kind).toBe("UPSTREAM");
      }
    },
  );
});
