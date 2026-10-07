import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OutOfRangeNotice } from "./out-of-range-notice";

describe("OutOfRangeNotice: 範囲外ページの案内", () => {
  it("AC-9b: 先頭ページへの案内のとき「指定されたページは存在しません」と、/?q=react&page=1 への「先頭のページへ」リンクを表示する", () => {
    render(<OutOfRangeNotice q="react" target={{ kind: "first" }} />);

    expect(screen.getByText("指定されたページは存在しません")).toBeDefined();
    const link = screen.getByRole("link", { name: "先頭のページへ" });
    expect(link.getAttribute("href")).toBe("/?q=react&page=1");
  });

  it("AC-9c: 最終ページ 2 への案内のとき「指定されたページは存在しません」と、/?q=react&page=2 への「最終ページ（2ページ目）へ」リンクを表示する", () => {
    render(<OutOfRangeNotice q="react" target={{ kind: "last", page: 2 }} />);

    expect(screen.getByText("指定されたページは存在しません")).toBeDefined();
    const link = screen.getByRole("link", {
      name: "最終ページ（2ページ目）へ",
    });
    expect(link.getAttribute("href")).toBe("/?q=react&page=2");
  });

  it.each([
    { label: "先頭ページへ", target: { kind: "first" } as const },
    { label: "最終ページへ", target: { kind: "last", page: 2 } as const },
  ])("AC-9b/9c: $label の案内のとき、リンクは 1 つだけである", ({ target }) => {
    render(<OutOfRangeNotice q="react" target={target} />);

    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
