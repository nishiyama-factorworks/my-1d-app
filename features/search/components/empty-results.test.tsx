import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyResults } from "./empty-results";

describe("EmptyResults: 検索結果0件の表示", () => {
  it("AC-17: q が zzzxqy のとき「「zzzxqy」に一致するリポジトリは見つかりませんでした。」と「別のキーワードで検索してください。」が表示される", () => {
    render(<EmptyResults q="zzzxqy" />);

    expect(
      screen.getByText(
        "「zzzxqy」に一致するリポジトリは見つかりませんでした。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("別のキーワードで検索してください。"),
    ).toBeInTheDocument();
  });

  it("AC-17: 総ヒット件数・一覧の行・ページネーションは含まない", () => {
    render(<EmptyResults q="zzzxqy" />);

    expect(screen.queryByText(/総ヒット件数/)).not.toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("AC-17（補強）: q に < や & を含んでも文字として表示される", () => {
    const { container } = render(<EmptyResults q="<b>a&b</b>" />);

    expect(
      screen.getByText(
        "「<b>a&b</b>」に一致するリポジトリは見つかりませんでした。",
      ),
    ).toBeInTheDocument();
    expect(container.querySelector("b")).toBeNull();
  });

  it('AC-26d: 0件の2つの案内文は role="status" の要素の中にある', () => {
    render(<EmptyResults q="zzzxqy" />);

    const status = screen.getByRole("status");
    expect(
      within(status).getByText(
        "「zzzxqy」に一致するリポジトリは見つかりませんでした。",
      ),
    ).toBeInTheDocument();
    expect(
      within(status).getByText("別のキーワードで検索してください。"),
    ).toBeInTheDocument();
  });

  it("AC-27: 空白の無い256文字のキーワードでも、キーワードを含む案内文に折り返しの指定（break-all）がある", () => {
    render(<EmptyResults q={"a".repeat(256)} />);

    expect(
      screen.getByText(
        "「" +
          "a".repeat(256) +
          "」に一致するリポジトリは見つかりませんでした。",
      ),
    ).toHaveClass("break-all");
  });
});
