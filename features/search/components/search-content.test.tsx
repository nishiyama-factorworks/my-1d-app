import { render, screen } from "@testing-library/react";
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
  it("AC-4a（仕様 0006 6.1、T5 で置き換え）: 検索 API が GitHubApiError で失敗したとき、renderSearchContent は同じエラーで reject される", async () => {
    const error = new GitHubApiError("RATE_LIMIT");
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
