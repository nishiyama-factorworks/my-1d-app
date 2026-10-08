import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound from "./not-found";

describe("詳細ページの not-found.tsx", () => {
  it("AC-20c: レベル1の見出し「リポジトリが見つかりませんでした」と「URL を確認するか、トップから検索し直してください。」が表示される", () => {
    render(<NotFound />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "リポジトリが見つかりませんでした",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("URL を確認するか、トップから検索し直してください。"),
    ).toBeInTheDocument();
  });

  it("AC-20c: 名前が「トップへ戻る」のリンクの href が / である", () => {
    render(<NotFound />);

    expect(screen.getByRole("link", { name: "トップへ戻る" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
