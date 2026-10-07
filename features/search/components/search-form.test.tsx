import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("SearchForm: 送信と遷移", () => {
  it("AC-2a: 「react」を入力して「検索」ボタンを押すと /?q=react&page=1 へ遷移する", async () => {
    const user = userEvent.setup();
    render(<SearchForm initialQuery="" />);

    await user.type(screen.getByRole("searchbox", { name: "キーワード" }), "react");
    await user.click(screen.getByRole("button", { name: "検索" }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/?q=react&page=1");
  });

  it("AC-2b: 入力欄で Enter を押すと /?q=react&page=1 へ遷移する", async () => {
    const user = userEvent.setup();
    render(<SearchForm initialQuery="" />);

    await user.type(
      screen.getByRole("searchbox", { name: "キーワード" }),
      "react{Enter}",
    );

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/?q=react&page=1");
  });

  it("AC-22a: 前後に空白がある入力は trim されて /?q=next.js&page=1 へ遷移する", async () => {
    const user = userEvent.setup();
    render(<SearchForm initialQuery="" />);

    await user.type(
      screen.getByRole("searchbox", { name: "キーワード" }),
      "  next.js  ",
    );
    await user.click(screen.getByRole("button", { name: "検索" }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/?q=next.js&page=1");
  });

  it("AC-22b: 日本語や & を含む入力が URL エンコードされ、復元すると元の文字列に戻る", async () => {
    const user = userEvent.setup();
    const keyword = "日本語 & react";
    render(<SearchForm initialQuery="" />);

    await user.type(screen.getByRole("searchbox", { name: "キーワード" }), keyword);
    await user.click(screen.getByRole("button", { name: "検索" }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(
      "/?q=%E6%97%A5%E6%9C%AC%E8%AA%9E+%26+react&page=1",
    );
    const url = String(push.mock.calls[0]?.[0]);
    expect(new URLSearchParams(url.slice(url.indexOf("?"))).get("q")).toBe(
      keyword,
    );
  });

  it("AC-2a: initialQuery が「react」のまま「検索」を押すと /?q=react&page=1 へ遷移する", async () => {
    const user = userEvent.setup();
    render(<SearchForm initialQuery="react" />);

    await user.click(screen.getByRole("button", { name: "検索" }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/?q=react&page=1");
  });
});
