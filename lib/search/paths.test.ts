// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildRepoPath, buildSearchPath } from "./paths";

describe("buildRepoPath", () => {
  it("AC-25j: owner が vercel、repo が next.js のとき /repos/vercel/next.js を返す", () => {
    expect(buildRepoPath("vercel", "next.js")).toBe("/repos/vercel/next.js");
  });

  it.each([
    { label: "空白", owner: "a b", repo: "c", expected: "/repos/a%20b/c" },
    {
      label: "スラッシュ",
      owner: "x/y",
      repo: "z",
      expected: "/repos/x%2Fy/z",
    },
    {
      label: "? と #",
      owner: "o",
      repo: "r?x#y",
      expected: "/repos/o/r%3Fx%23y",
    },
    { label: "%", owner: "o", repo: "100%", expected: "/repos/o/100%25" },
    { label: "+", owner: "o", repo: "c++", expected: "/repos/o/c%2B%2B" },
    {
      label: "日本語",
      owner: "日本",
      repo: "r",
      expected: "/repos/%E6%97%A5%E6%9C%AC/r",
    },
  ])(
    "AC-25j: $label を含む owner/repo のとき各セグメントが符号化されたパスを返す",
    ({ owner, repo, expected }) => {
      expect(buildRepoPath(owner, repo)).toBe(expected);
    },
  );

  it("AC-25j: owner が外部 URL 形式でも、パスは /repos/ で始まりセグメントが 2 つのままになる", () => {
    const path = buildRepoPath("https://evil.example", "r");

    expect(path.startsWith("/repos/")).toBe(true);
    expect(path.slice("/repos/".length).split("/")).toHaveLength(2);
  });
});

describe("buildSearchPath", () => {
  it('AC-25i: キーワード "日本語 & react"、ページ2のとき /?q=%E6%97%A5%E6%9C%AC%E8%AA%9E+%26+react&page=2 を返す', () => {
    expect(buildSearchPath("日本語 & react", 2)).toBe(
      "/?q=%E6%97%A5%E6%9C%AC%E8%AA%9E+%26+react&page=2",
    );
  });

  it('AC-25i: 生成したパスのクエリを読み取ると q が "日本語 & react"、page が "2" に戻る', () => {
    const path = buildSearchPath("日本語 & react", 2);
    const params = new URLSearchParams(path.slice(path.indexOf("?") + 1));

    expect(params.get("q")).toBe("日本語 & react");
    expect(params.get("page")).toBe("2");
  });

  it("AC-25i: ページが1でも page=1 を省略しない", () => {
    expect(buildSearchPath("react", 1)).toBe("/?q=react&page=1");
  });

  it.each([
    { label: "c++", q: "c++" },
    { label: "a=b", q: "a=b" },
    { label: "#tag", q: "#tag" },
    { label: "100%", q: "100%" },
    { label: "https://evil.example", q: "https://evil.example" },
    { label: "//evil.example", q: "//evil.example" },
    { label: "\\evil.example", q: "\\evil.example" },
  ])(
    'AC-25i: $label を含むキーワードでも、パスは "/?" で始まり、q を読み取ると元の値に戻る',
    ({ q }) => {
      const path = buildSearchPath(q, 3);

      expect(path.startsWith("/?")).toBe(true);
      expect(path.startsWith("//")).toBe(false);
      const params = new URLSearchParams(path.slice(2));
      expect(params.get("q")).toBe(q);
      expect(params.get("page")).toBe("3");
    },
  );
});
