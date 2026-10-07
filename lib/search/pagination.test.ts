// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SEARCH_PER_PAGE, SEARCH_RESULT_LIMIT } from "./constants";
import { calculateMaxPage } from "./pagination";

describe("calculateMaxPage", () => {
  it.each([
    { totalCount: 0, expected: 0 },
    { totalCount: 1, expected: 1 },
    { totalCount: 30, expected: 1 },
    { totalCount: 31, expected: 2 },
    { totalCount: 1000, expected: 34 },
    { totalCount: 1001, expected: 34 },
    { totalCount: 100000, expected: 34 },
  ])(
    "AC-25f: 総件数が $totalCount のとき最大ページ数は $expected になる",
    ({ totalCount, expected }) => {
      expect(calculateMaxPage(totalCount)).toBe(expected);
    },
  );
});

describe("検索の定数", () => {
  it("AC-25f: 1ページの件数は30件、検索結果の上限は1000件である", () => {
    expect(SEARCH_PER_PAGE).toBe(30);
    expect(SEARCH_RESULT_LIMIT).toBe(1000);
  });
});
