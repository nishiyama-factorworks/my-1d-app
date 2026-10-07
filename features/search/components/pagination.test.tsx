import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pagination } from "./pagination";

function renderNav(props: {
  q?: string;
  currentPage: number;
  maxPage: number;
}) {
  render(
    <Pagination
      q={props.q ?? "react"}
      currentPage={props.currentPage}
      maxPage={props.maxPage}
    />,
  );
  return screen.getByRole("navigation", { name: "ページネーション" });
}

function linkNames(nav: HTMLElement): (string | null)[] {
  return within(nav)
    .getAllByRole("link")
    .map((el) => el.textContent);
}

function itemTexts(nav: HTMLElement): (string | null)[] {
  return within(nav)
    .getAllByRole("listitem")
    .map((el) => el.textContent);
}

describe("Pagination: 並びと現在ページ", () => {
  it("AC-8a: 最大 4・現在 2 のとき、ラベル「ページネーション」の nav に「前へ」「1」「2」「3」「4」「次へ」のリンクがこの順に並ぶ", () => {
    const nav = renderNav({ currentPage: 2, maxPage: 4 });

    expect(linkNames(nav)).toEqual(["前へ", "1", "2", "3", "4", "次へ"]);
  });

  it('AC-8a: 現在ページの 2 だけに aria-current="page" が付く', () => {
    const nav = renderNav({ currentPage: 2, maxPage: 4 });

    expect(within(nav).getByRole("link", { name: "2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    for (const name of ["1", "3", "4"]) {
      expect(within(nav).getByRole("link", { name })).not.toHaveAttribute(
        "aria-current",
      );
    }
  });
});

describe("Pagination: 前へ・次へ", () => {
  it('AC-8b: 現在 1 のとき「前へ」は aria-disabled="true" で href を持たず、「次へ」は /?q=react&page=2 へのリンクである', () => {
    const nav = renderNav({ currentPage: 1, maxPage: 4 });

    const prev = within(nav).getByRole("link", { name: "前へ" });
    expect(prev).toHaveAttribute("aria-disabled", "true");
    expect(prev).not.toHaveAttribute("href");
    expect(prev).not.toHaveAttribute("tabindex");
    expect(within(nav).getByRole("link", { name: "次へ" })).toHaveAttribute(
      "href",
      "/?q=react&page=2",
    );
  });

  it('AC-8c: 最大 4・現在 4 のとき「次へ」は aria-disabled="true" で href を持たず、「前へ」は /?q=react&page=3 へのリンクである', () => {
    const nav = renderNav({ currentPage: 4, maxPage: 4 });

    const next = within(nav).getByRole("link", { name: "次へ" });
    expect(next).toHaveAttribute("aria-disabled", "true");
    expect(next).not.toHaveAttribute("href");
    expect(next).not.toHaveAttribute("tabindex");
    expect(within(nav).getByRole("link", { name: "前へ" })).toHaveAttribute(
      "href",
      "/?q=react&page=3",
    );
  });

  it("AC-8b/8c: 押せる「前へ」「次へ」には aria-disabled が付かない", () => {
    const nav = renderNav({ currentPage: 2, maxPage: 4 });

    const prev = within(nav).getByRole("link", { name: "前へ" });
    const next = within(nav).getByRole("link", { name: "次へ" });
    expect(prev).not.toHaveAttribute("aria-disabled");
    expect(prev).toHaveAttribute("href", "/?q=react&page=1");
    expect(next).not.toHaveAttribute("aria-disabled");
    expect(next).toHaveAttribute("href", "/?q=react&page=3");
  });
});

describe("Pagination: 非表示", () => {
  it.each([{ maxPage: 1 }, { maxPage: 0 }])(
    "AC-8d: 最大ページ数が $maxPage のときページネーションを表示しない",
    ({ maxPage }) => {
      render(<Pagination q="react" currentPage={1} maxPage={maxPage} />);

      expect(screen.queryByRole("navigation")).toBeNull();
    },
  );
});

describe("Pagination: 省略", () => {
  it("AC-8e: 最大 34・現在 17 のとき、項目は 前へ・1・…・15〜19・…・34・次へ の順になり、「…」はリンクでない", () => {
    const nav = renderNav({ currentPage: 17, maxPage: 34 });

    expect(itemTexts(nav)).toEqual([
      "前へ",
      "1",
      "…",
      "15",
      "16",
      "17",
      "18",
      "19",
      "…",
      "34",
      "次へ",
    ]);
    expect(linkNames(nav)).toEqual([
      "前へ",
      "1",
      "15",
      "16",
      "17",
      "18",
      "19",
      "34",
      "次へ",
    ]);
  });

  it("AC-8g: 最大 34・現在 5 のとき、項目は 前へ・1〜7・…・34・次へ の順になる", () => {
    const nav = renderNav({ currentPage: 5, maxPage: 34 });

    expect(itemTexts(nav)).toEqual([
      "前へ",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "…",
      "34",
      "次へ",
    ]);
  });
});

describe("Pagination: リンク先", () => {
  it("AC-8f: 検索 q=react で、ページ番号 5 のリンク先は /?q=react&page=5 である", () => {
    const nav = renderNav({ q: "react", currentPage: 4, maxPage: 34 });

    expect(within(nav).getByRole("link", { name: "5" })).toHaveAttribute(
      "href",
      "/?q=react&page=5",
    );
  });

  it("AC-8f: q に空白を含むときもリンク先が二重に符号化されない", () => {
    const nav = renderNav({ q: "a b", currentPage: 1, maxPage: 4 });

    expect(within(nav).getByRole("link", { name: "2" })).toHaveAttribute(
      "href",
      "/?q=a+b&page=2",
    );
  });
});
