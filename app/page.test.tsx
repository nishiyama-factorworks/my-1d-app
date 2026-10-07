import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Page from "./page";

describe("トップページ", () => {
  it("AC-21b: トップページを描画するとプレースホルダーの見出しが表示される", () => {
    render(<Page />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "GitHub リポジトリ検索",
    );
  });
});
