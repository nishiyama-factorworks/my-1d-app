import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Loading from "./loading";

describe("詳細ページの loading.tsx", () => {
  it('AC-16b: 詳細の読み込み中は role="status" の「読み込み中…」が表示される', () => {
    render(<Loading />);

    // 「…」は U+2026。「...」（ピリオド 3 つ）では一致しない
    expect(screen.getByRole("status")).toHaveTextContent(/^読み込み中…$/);
  });
});
