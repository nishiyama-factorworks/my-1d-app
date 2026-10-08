import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ErrorPage from "./error";

describe("想定外の例外の受け皿 error.tsx", () => {
  it("AC-19e: 例外が起きたとき role=alert の中に「予期しないエラーが発生しました」と「再試行」ボタンが表示される", () => {
    render(
      <ErrorPage error={new Error("internal secret detail")} retry={vi.fn()} />,
    );

    const alert = screen.getByRole("alert");
    expect(
      within(alert).getByText("予期しないエラーが発生しました"),
    ).toBeInTheDocument();
    expect(
      within(alert).getByRole("button", { name: "再試行" }),
    ).toBeInTheDocument();
  });

  it("AC-19e: 例外が起きたときエラーの message と digest は表示されない", () => {
    const error = Object.assign(new Error("internal secret detail"), {
      digest: "123456",
    });
    render(<ErrorPage error={error} retry={vi.fn()} />);

    const text = document.body.textContent ?? "";
    expect(text).not.toContain("internal secret detail");
    expect(text).not.toContain("123456");
  });

  it("AC-19e（補強）: エラー表示は main ランドマークの中にある", () => {
    render(<ErrorPage error={new Error("boom")} retry={vi.fn()} />);

    expect(
      within(screen.getByRole("main")).getByRole("alert"),
    ).toBeInTheDocument();
  });

  it('AC-26c1: レベル1の見出し「エラーが発生しました」が main の中にあり、role="alert" の外にある', () => {
    render(<ErrorPage error={new Error("boom")} retry={vi.fn()} />);

    const heading = screen.getByRole("heading", {
      level: 1,
      name: "エラーが発生しました",
    });
    expect(within(screen.getByRole("main")).getByRole("heading")).toBe(heading);
    expect(heading.closest('[role="alert"]')).toBeNull();
  });

  it("AC-19e: 「再試行」を押すと retry が1回呼ばれる", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<ErrorPage error={new Error("boom")} retry={retry} />);

    await user.click(screen.getByRole("button", { name: "再試行" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("error.tsx: キーボード操作（0011）", () => {
  it.each([
    { label: "Enter", key: "{Enter}" },
    { label: "Space", key: " " },
  ])(
    "AC-26b1: 「再試行」ボタンにフォーカスして $label を押すと retry が1回呼ばれる",
    async ({ key }) => {
      const user = userEvent.setup();
      const retry = vi.fn();
      render(<ErrorPage error={new Error("boom")} retry={retry} />);
      screen.getByRole("button", { name: "再試行" }).focus();

      await user.keyboard(key);

      expect(retry).toHaveBeenCalledTimes(1);
    },
  );
});
