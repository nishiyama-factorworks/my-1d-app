// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildBackPath } from "./back-path";
import type { SearchParamsInput } from "./query";

type Case = {
  label: string;
  input: SearchParamsInput;
  expected: string;
};

const AC_15A: Case = {
  label: "q=react&page=3",
  input: { q: "react", page: "3" },
  expected: "/?q=react&page=3",
};
const AC_15B: Case = { label: "クエリなし", input: {}, expected: "/" };

const TABLE: Case[] = [
  {
    label: "page=abc",
    input: { q: "react", page: "abc" },
    expected: "/?q=react&page=1",
  },
  {
    label: "page=0",
    input: { q: "react", page: "0" },
    expected: "/?q=react&page=1",
  },
  {
    label: "page=-1",
    input: { q: "react", page: "-1" },
    expected: "/?q=react&page=1",
  },
  {
    label: "page=1e3",
    input: { q: "react", page: "1e3" },
    expected: "/?q=react&page=1",
  },
  {
    label: "page=%203（先頭に空白）",
    input: { q: "react", page: " 3" },
    expected: "/?q=react&page=1",
  },
  {
    label: "page=3abc",
    input: { q: "react", page: "3abc" },
    expected: "/?q=react&page=1",
  },
  {
    label: "page=99999999999999999999（安全な整数でない）",
    input: { q: "react", page: "99999999999999999999" },
    expected: "/?q=react&page=1",
  },
  { label: "q=（空）", input: { q: "", page: "3" }, expected: "/" },
  {
    label: "q=%20%20（空白のみ）",
    input: { q: "  ", page: "3" },
    expected: "/",
  },
  {
    label: "q=%E3%80%80（全角空白のみ）",
    input: { q: "　", page: "3" },
    expected: "/",
  },
  { label: "page=3 のみ（q なし）", input: { page: "3" }, expected: "/" },
  {
    label: "q が 257 文字",
    input: { q: "a".repeat(257), page: "3" },
    expected: "/",
  },
  {
    label: "q=https://evil.example/",
    input: { q: "https://evil.example/" },
    expected: "/?q=https%3A%2F%2Fevil.example%2F&page=1",
  },
  {
    label: "q=//evil.example",
    input: { q: "//evil.example" },
    expected: "/?q=%2F%2Fevil.example&page=1",
  },
  {
    label: "q=react&q=vue（同じキーが複数）",
    input: { q: ["react", "vue"] },
    expected: "/?q=react&page=1",
  },
];

describe("buildBackPath", () => {
  it('AC-15a: { q: "react", page: "3" } のとき /?q=react&page=3 を返す', () => {
    expect(buildBackPath({ q: "react", page: "3" })).toBe("/?q=react&page=3");
  });

  it("AC-15b: クエリなし（{}）のとき / を返す", () => {
    expect(buildBackPath({})).toBe("/");
  });

  it.each(TABLE)(
    "AC-15c: $label のとき $expected を返す",
    ({ input, expected }) => {
      expect(buildBackPath(input)).toBe(expected);
    },
  );

  it.each([AC_15A, AC_15B, ...TABLE])(
    'AC-15c: $label のとき、宛先は "/" で始まり "//" で始まらず、スキーム・ホストを持たない',
    ({ input }) => {
      const result = buildBackPath(input);

      expect(result.startsWith("/")).toBe(true);
      expect(result.startsWith("//")).toBe(false);
      expect(new URL(result, "http://localhost").origin).toBe(
        "http://localhost",
      );
      expect(/^[a-z][a-z0-9+.-]*:/i.test(result)).toBe(false);
    },
  );

  it("AC-15c: q がちょうど 256 文字のときは有効で、/?q=<256文字>&page=1 を返す", () => {
    expect(buildBackPath({ q: "a".repeat(256) })).toBe(
      "/?q=" + "a".repeat(256) + "&page=1",
    );
  });

  it("AC-15c: 前後の空白を除くと 256 文字になる q は有効（正規化後の長さで判定する）", () => {
    expect(buildBackPath({ q: "  " + "a".repeat(256) + "  " })).toBe(
      "/?q=" + "a".repeat(256) + "&page=1",
    );
  });

  it("AC-15c（補強）: q の前後の空白は除かれる", () => {
    expect(buildBackPath({ q: "  react  ", page: "3" })).toBe(
      "/?q=react&page=3",
    );
  });

  it('AC-15d: { q: "日本語 & react", page: "2" } のとき符号化された戻り先を返し、読み戻すと q が "日本語 & react" になる', () => {
    const result = buildBackPath({ q: "日本語 & react", page: "2" });

    expect(result).toBe("/?q=%E6%97%A5%E6%9C%AC%E8%AA%9E+%26+react&page=2");
    expect(new URL(result, "http://localhost").searchParams.get("q")).toBe(
      "日本語 & react",
    );
  });
});
