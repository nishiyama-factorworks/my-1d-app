// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatLanguage, formatNumber } from "./format";

describe("formatNumber", () => {
  it.each([
    { name: 'AC-25g: 0 のとき "0" になる', input: 0, expected: "0" },
    { name: 'AC-25g: 999 のとき "999" になる', input: 999, expected: "999" },
    {
      name: 'AC-25g: 1234 のとき "1,234" になる',
      input: 1234,
      expected: "1,234",
    },
    {
      name: 'AC-25g: 1234567 のとき "1,234,567" になる',
      input: 1234567,
      expected: "1,234,567",
    },
    {
      name: 'AC-25g: 1000 のとき "1,000" になる',
      input: 1000,
      expected: "1,000",
    },
    {
      name: "AC-25g: Number.MAX_SAFE_INTEGER のとき桁区切りされる",
      input: Number.MAX_SAFE_INTEGER,
      expected: "9,007,199,254,740,991",
    },
  ])("$name", ({ input, expected }) => {
    expect(formatNumber(input)).toBe(expected);
  });
});

describe("formatLanguage", () => {
  it.each([
    { name: 'AC-25h: null のとき "-" になる', input: null, expected: "-" },
    { name: 'AC-25h: 空文字のとき "-" になる', input: "", expected: "-" },
    {
      name: 'AC-25h: "TypeScript" のときそのまま返る',
      input: "TypeScript",
      expected: "TypeScript",
    },
  ])("$name", ({ input, expected }) => {
    expect(formatLanguage(input)).toBe(expected);
  });
});
