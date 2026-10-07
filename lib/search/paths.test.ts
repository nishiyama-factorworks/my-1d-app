// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildSearchPath } from "./paths";

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
