// @vitest-environment node
import { describe, expect, it } from "vitest";

import { normalizeKeyword, parseSearchParams } from "./query";

describe("normalizeKeyword", () => {
  it('AC-25a: "  react  " を正規化すると "react" になる', () => {
    expect(normalizeKeyword("  react  ")).toBe("react");
  });

  it('AC-25a: 内側の空白は残り、前後の空白だけが除かれる（" next js " → "next js"）', () => {
    expect(normalizeKeyword(" next js ")).toBe("next js");
  });

  it.each([
    { label: "空文字", input: "" },
    { label: "半角空白のみ", input: "   " },
    { label: "全角空白のみ（U+3000）", input: "　" },
    { label: "タブのみ", input: "\t\t" },
    { label: "改行のみ", input: "\n\r\n" },
  ])("AC-25b: $label を正規化すると null になる", ({ input }) => {
    expect(normalizeKeyword(input)).toBeNull();
  });
});

describe("parseSearchParams", () => {
  it.each([
    { label: "キー無し", params: {} },
    { label: '"abc"', params: { page: "abc" } },
    { label: '"0"', params: { page: "0" } },
    { label: '"-3"', params: { page: "-3" } },
    { label: '"2.5"', params: { page: "2.5" } },
  ])("AC-25c: page が $label のとき 1 になる", ({ params }) => {
    expect(parseSearchParams(params).page).toBe(1);
  });

  it.each([
    { label: '先頭ゼロ "03"', page: "03" },
    { label: '指数表記 "1e3"', page: "1e3" },
    { label: '先頭空白 " 3"', page: " 3" },
    { label: '末尾に文字 "3abc"', page: "3abc" },
    { label: '符号付き "+3"', page: "+3" },
    { label: "空文字", page: "" },
    { label: "安全でない巨大整数", page: "9999999999999999999999" },
    { label: "MAX_SAFE_INTEGER + 1", page: "9007199254740992" },
  ])("AC-25k: page が $label のとき 1 になる", ({ page }) => {
    expect(parseSearchParams({ page }).page).toBe(1);
  });

  it("AC-25k: page が MAX_SAFE_INTEGER ちょうどのときそのまま採用される", () => {
    expect(parseSearchParams({ page: "9007199254740991" }).page).toBe(9007199254740991);
  });

  it('AC-25d: page="3"、q="react" のとき page=3、q="react" になる', () => {
    expect(parseSearchParams({ q: "react", page: "3" })).toEqual({ q: "react", page: 3 });
  });

  it('AC-25d: page="35" のとき切り詰められず 35 になる', () => {
    expect(parseSearchParams({ q: "react", page: "35" }).page).toBe(35);
  });

  it.each([
    { label: '配列 ["a","b"]', params: { q: ["a", "b"] }, expected: "a" },
    { label: "空配列", params: { q: [] }, expected: null },
    { label: "未指定", params: {}, expected: null },
  ])("AC-25e: q が $label のとき $expected になる", ({ params, expected }) => {
    expect(parseSearchParams(params).q).toBe(expected);
  });

  it.each([
    { label: '["2","5"]', page: ["2", "5"], expected: 2 },
    { label: '["abc","5"]', page: ["abc", "5"], expected: 1 },
    { label: "[]", page: [] as string[], expected: 1 },
  ])("AC-25l: page が配列 $label のとき $expected になる", ({ page, expected }) => {
    expect(parseSearchParams({ page }).page).toBe(expected);
  });

  it('AC-25a: q が前後空白付き "  react  " のとき "react" に正規化される', () => {
    expect(parseSearchParams({ q: "  react  " }).q).toBe("react");
  });

  it("AC-25b: q が空白のみのとき null になる", () => {
    expect(parseSearchParams({ q: "   " }).q).toBeNull();
  });
});
