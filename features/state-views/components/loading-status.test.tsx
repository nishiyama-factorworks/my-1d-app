import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingStatus } from "./loading-status";

describe("LoadingStatus: 読み込み中の表示", () => {
  it('AC-16a・AC-16b: role="status" の中に「読み込み中…」が表示される', () => {
    render(<LoadingStatus />);

    // 「…」は U+2026。「...」（ピリオド 3 つ）では一致しない
    expect(screen.getByRole("status")).toHaveTextContent(/^読み込み中…$/);
  });
});
