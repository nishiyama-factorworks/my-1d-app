import { render, screen } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import Page from "./page";

// SearchForm が useRouter を呼ぶ。App Router のコンテキストが無いと例外になるため、
// プロセス境界の外（履歴更新・RSC 取得）にあたる useRouter だけを差し替える。
const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

beforeEach(() => {
  push.mockReset();
});

// async な Server Component は JSX としては描画できないため、
// ページ関数を直接呼んで await し、返った要素を描画する。
describe("トップページ", () => {
  it("AC-21b: トップページを描画するとプレースホルダーの見出しが表示される", async () => {
    render(
      await Page({
        params: Promise.resolve({}),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "GitHub リポジトリ検索",
    );
  });

  it("AC-1: トップページにラベル「キーワード」の入力欄と「検索」ボタンがある", async () => {
    render(
      await Page({
        params: Promise.resolve({}),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(
      screen.getByRole("searchbox", { name: "キーワード" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "検索" })).toBeInTheDocument();
  });

  it('AC-22c: URL が /?q=react&page=3 のとき入力欄の初期値が "react" になる', async () => {
    render(
      await Page({
        params: Promise.resolve({}),
        searchParams: Promise.resolve({ q: "react", page: "3" }),
      }),
    );

    expect(screen.getByRole("searchbox", { name: "キーワード" })).toHaveValue(
      "react",
    );
  });

  it("AC-22c: URL に q が無いとき入力欄は空になる", async () => {
    render(
      await Page({
        params: Promise.resolve({}),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole("searchbox", { name: "キーワード" })).toHaveValue(
      "",
    );
  });

  it("AC-22c: q が空白のみのとき入力欄は空になる", async () => {
    render(
      await Page({
        params: Promise.resolve({}),
        searchParams: Promise.resolve({ q: "   " }),
      }),
    );

    expect(screen.getByRole("searchbox", { name: "キーワード" })).toHaveValue(
      "",
    );
  });
});
