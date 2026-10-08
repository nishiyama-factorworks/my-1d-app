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

  it.each([
    { label: "U+200B", input: "\u200B" },
    { label: "U+200C", input: "\u200C" },
    { label: "U+200D", input: "\u200D" },
    { label: "U+2060", input: "\u2060" },
  ])(
    "AC-1: ゼロ幅文字 $label の 1 文字だけを正規化すると null になる",
    ({ input }) => {
      expect(normalizeKeyword(input)).toBeNull();
    },
  );

  it.each([
    { label: "U+200B を 2 文字", input: "\u200B\u200B" },
    { label: "半角空白・U+200B・半角空白", input: " \u200B " },
    { label: "U+200B・半角空白・U+200B", input: "\u200B \u200B" },
    { label: "全角空白(U+3000)・U+200D・タブ", input: "\u3000\u200D\t" },
  ])(
    "AC-2: $label（空白とゼロ幅文字だけ）を正規化すると null になる",
    ({ input }) => {
      expect(normalizeKeyword(input)).toBeNull();
    },
  );

  it.each([
    { label: "U+200B+foo", input: "\u200Bfoo", expected: "\u200Bfoo" },
    { label: "a+U+200B+b", input: "a\u200Bb", expected: "a\u200Bb" },
    {
      label: "半角空白+foo+U+200B+半角空白",
      input: " foo\u200B ",
      expected: "foo\u200B",
    },
  ])(
    "AC-3: $label は前後の空白だけを除いた値になる（ゼロ幅文字は残る）",
    ({ input, expected }) => {
      expect(normalizeKeyword(input)).toBe(expected);
    },
  );
});

describe("parseSearchParams", () => {
  it.each([
    { label: "キー無し", params: {} },
    { label: "undefined", params: { page: undefined } },
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
    expect(parseSearchParams({ page: "9007199254740991" }).page).toBe(
      9007199254740991,
    );
  });

  it('AC-25d: page="3"、q="react" のとき page=3、q="react" になる', () => {
    expect(parseSearchParams({ q: "react", page: "3" })).toEqual({
      q: "react",
      page: 3,
    });
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
    { label: "[]", page: new Array<string>(), expected: 1 },
  ])(
    "AC-25l: page が配列 $label のとき $expected になる",
    ({ page, expected }) => {
      expect(parseSearchParams({ page }).page).toBe(expected);
    },
  );

  it('AC-25a: q が前後空白付き "  react  " のとき "react" に正規化される', () => {
    expect(parseSearchParams({ q: "  react  " }).q).toBe("react");
  });

  it.each([
    { label: "半角空白のみ", q: "   " },
    { label: "全角空白のみ（U+3000）", q: "　" },
  ])("AC-25b: q が $label のとき null になる", ({ q }) => {
    expect(parseSearchParams({ q }).q).toBeNull();
  });

  it("AC-4: q が %E2%80%8B（U+200B だけ）のとき null になる", () => {
    expect(parseSearchParams({ q: "\u200B" }).q).toBeNull();
  });
});
