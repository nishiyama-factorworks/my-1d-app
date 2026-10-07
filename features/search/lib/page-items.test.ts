// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildPageItems } from "./page-items";

describe("buildPageItems", () => {
  it("AC-8a: 現在 2・最大 4 のとき [1, 2, 3, 4] になる", () => {
    expect(buildPageItems(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it("AC-8e: 現在 17・最大 34 のとき 1、…、15〜19、…、34 になる", () => {
    expect(buildPageItems(17, 34)).toEqual([
      1,
      "ellipsis-start",
      15,
      16,
      17,
      18,
      19,
      "ellipsis-end",
      34,
    ]);
  });

  it("AC-8g: 現在 5・最大 34 のとき 1〜7、…、34 になり、1 と 3 の間の 2 は省略しない", () => {
    expect(buildPageItems(5, 34)).toEqual([
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      "ellipsis-end",
      34,
    ]);
  });

  it("AC-8g: 現在 30・最大 34 のとき 1、…、28〜34 になり、32 と 34 の間の 33 は省略しない", () => {
    expect(buildPageItems(30, 34)).toEqual([
      1,
      "ellipsis-start",
      28,
      29,
      30,
      31,
      32,
      33,
      34,
    ]);
  });

  it("AC-8g: 現在 6・最大 34 のとき 1 と 4 の間（2 ページ）は「…」になる", () => {
    expect(buildPageItems(6, 34)).toEqual([
      1,
      "ellipsis-start",
      4,
      5,
      6,
      7,
      8,
      "ellipsis-end",
      34,
    ]);
  });

  it.each([
    { currentPage: 1, maxPage: 34, expected: [1, 2, 3, "ellipsis-end", 34] },
    {
      currentPage: 4,
      maxPage: 34,
      expected: [1, 2, 3, 4, 5, 6, "ellipsis-end", 34],
    },
    {
      currentPage: 34,
      maxPage: 34,
      expected: [1, "ellipsis-start", 32, 33, 34],
    },
  ])(
    "AC-8e: 現在 $currentPage / 最大 $maxPage のとき 1 と $maxPage を含み、窓が範囲内に収まる",
    ({ currentPage, maxPage, expected }) => {
      expect(buildPageItems(currentPage, maxPage)).toEqual(expected);
    },
  );

  it.each([
    { currentPage: 1, maxPage: 2, expected: [1, 2] },
    { currentPage: 4, maxPage: 7, expected: [1, 2, 3, 4, 5, 6, 7] },
    { currentPage: 1, maxPage: 7, expected: [1, 2, 3, "ellipsis-end", 7] },
  ])(
    "AC-8e: 現在 $currentPage / 最大 $maxPage のように少ないページ数でも番号が重複しない",
    ({ currentPage, maxPage, expected }) => {
      expect(buildPageItems(currentPage, maxPage)).toEqual(expected);
    },
  );
});
