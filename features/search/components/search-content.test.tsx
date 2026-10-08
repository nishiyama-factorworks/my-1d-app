import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { GitHubApiError } from "@/lib/github/errors";
import type {
  SearchRepositoriesParams,
  SearchRepositoriesResult,
} from "@/lib/github/types";
import { renderSearchContent } from "./search-content";

// 子コンポーネントが useRouter を呼んでも落ちないよう、ルーター（プロセス境界）だけ差し替える。
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// 検索 API（ネットワーク境界）だけを差し替える。
const { searchRepositories } = vi.hoisted(() => ({
  searchRepositories:
    vi.fn<
      (params: SearchRepositoriesParams) => Promise<SearchRepositoriesResult>
    >(),
}));

vi.mock("@/lib/github", () => ({ searchRepositories }));

beforeEach(() => {
  searchRepositories.mockReset();
  searchRepositories.mockResolvedValue({ totalCount: 0, items: [] });
});

describe("renderSearchContent", () => {
  // 仕様変更 0010: 0006 6.1 の暫定挙動（GitHubApiError は reject）を、AC-18a〜19b の表示に置き換えた。
  it("AC-18a〜19b（仕様 0010 で 0006 6.1 を置き換え）: GitHubApiError では reject せず、エラー表示を返す", async () => {
    searchRepositories.mockRejectedValue(new GitHubApiError("RATE_LIMIT"));

    render(await renderSearchContent({ q: "react", page: 1 }));

    const alert = within(screen.getByRole("alert"));
    expect(
      alert.getByText("GitHub API の利用制限に達しました"),
    ).toBeInTheDocument();
    expect(alert.getByRole("button", { name: "再試行" })).toBeInTheDocument();
  });

  it("AC-19e の前提: GitHubApiError 以外の例外は同じインスタンスのまま reject される", async () => {
    const error = new Error("unexpected");
    searchRepositories.mockRejectedValue(error);

    await expect(renderSearchContent({ q: "react", page: 1 })).rejects.toBe(
      error,
    );
  });

  it("AC-9b: page が 35 のとき検索 API を呼ばずに範囲外の案内を返す", async () => {
    render(await renderSearchContent({ q: "react", page: 35 }));

    expect(searchRepositories).not.toHaveBeenCalled();
    expect(
      screen.getByText("指定されたページは存在しません"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "先頭のページへ" }),
    ).toHaveAttribute("href", "/?q=react&page=1");
  });
});
