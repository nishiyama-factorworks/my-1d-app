import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchForm } from "./search-form";

// useRouter は App Router のコンテキストが無いと例外になる。
// push の先（履歴更新・RSC 取得）はプロセス境界の外なので useRouter だけを差し替える。
const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

beforeEach(() => {
  push.mockReset();
});

describe("SearchForm: 表示と初期値", () => {
  it("AC-1: ラベル「キーワード」の入力欄と「検索」ボタンが表示される", () => {
    render(<SearchForm initialQuery="" />);

    expect(
      screen.getByRole("searchbox", { name: "キーワード" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "検索" })).toBeInTheDocument();
  });

  it("AC-1: フォームが検索ランドマークとして公開される", () => {
    render(<SearchForm initialQuery="" />);

    expect(screen.getByRole("search")).toBeInTheDocument();
  });

  it("AC-1: 入力欄に文字数の上限が付いていない", () => {
    render(<SearchForm initialQuery="" />);

    expect(
      screen.getByRole("searchbox", { name: "キーワード" }),
    ).not.toHaveAttribute("maxlength");
  });

  it('AC-22c: initialQuery が "react" のとき入力欄の初期値が "react" になる', () => {
    render(<SearchForm initialQuery="react" />);

    expect(screen.getByRole("searchbox", { name: "キーワード" })).toHaveValue(
      "react",
    );
  });

  it('AC-22c: initialQuery が "" のとき入力欄は空になる', () => {
    render(<SearchForm initialQuery="" />);

    expect(screen.getByRole("searchbox", { name: "キーワード" })).toHaveValue(
      "",
    );
  });

  it("AC-1: 通常時は案内が空で、入力欄は invalid でない", () => {
    render(<SearchForm initialQuery="" />);

    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(screen.getByRole("searchbox", { name: "キーワード" })).toBeValid();
  });
});
