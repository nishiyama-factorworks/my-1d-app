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

  it("AC-19e: 例外が起きたときエラーの message は表示されない", () => {
    render(
      <ErrorPage error={new Error("internal secret detail")} retry={vi.fn()} />,
    );

    expect(
      screen.queryByText(/internal secret detail/),
    ).not.toBeInTheDocument();
  });

  it("AC-19e: 「再試行」を押すと retry が1回呼ばれる", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<ErrorPage error={new Error("boom")} retry={retry} />);

    await user.click(screen.getByRole("button", { name: "再試行" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
