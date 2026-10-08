import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubApiError } from "@/lib/github/errors";
import { ApiErrorView } from "./api-error-view";

// RetryButton が useRouter を呼ぶ。App Router のコンテキストが無いので useRouter だけを差し替える。
const { push, replace, refresh } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh }),
}));

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  refresh.mockReset();
});

describe("ApiErrorView: 種別ごとの表示", () => {
  it("AC-18a: RATE_LIMIT・resetAt=2026-10-08T06:42:00Z のとき、role=alert の中に「GitHub API の利用制限に達しました」と「15:42（日本時間）に解除されます。」と「再試行」ボタンがある", () => {
    render(
      <ApiErrorView
        kind="RATE_LIMIT"
        resetAt={new Date("2026-10-08T06:42:00Z")}
      />,
    );

    const alert = within(screen.getByRole("alert"));
    expect(
      alert.getByText("GitHub API の利用制限に達しました"),
    ).toBeInTheDocument();
    expect(
      alert.getByText("15:42（日本時間）に解除されます。"),
    ).toBeInTheDocument();
    expect(alert.getByRole("button", { name: "再試行" })).toBeInTheDocument();
  });

  it("AC-18b: RATE_LIMIT・resetAt なしのとき、「しばらく時間をおいてから再試行してください。」が表示され、「（日本時間）」は表示されない", () => {
    render(<ApiErrorView kind="RATE_LIMIT" />);

    const alert = within(screen.getByRole("alert"));
    expect(
      alert.getByText("GitHub API の利用制限に達しました"),
    ).toBeInTheDocument();
    expect(
      alert.getByText("しばらく時間をおいてから再試行してください。"),
    ).toBeInTheDocument();
    expect(alert.getByRole("button", { name: "再試行" })).toBeInTheDocument();
    expect(screen.queryByText(/（日本時間）/)).not.toBeInTheDocument();
  });

  it.each(["UPSTREAM", "VALIDATION"] as const)(
    "AC-19a: %s のとき role=alert の中に「データの取得中にエラーが発生しました」と「再試行」ボタンがある",
    (kind) => {
      render(<ApiErrorView kind={kind} />);

      const alert = within(screen.getByRole("alert"));
      expect(
        alert.getByText("データの取得中にエラーが発生しました"),
      ).toBeInTheDocument();
      expect(alert.getByRole("button", { name: "再試行" })).toBeInTheDocument();
      expect(screen.queryByText(/利用制限/)).not.toBeInTheDocument();
      expect(screen.queryByText(/接続できません/)).not.toBeInTheDocument();
    },
  );

  it("AC-19b: NETWORK のとき「GitHub に接続できませんでした」と「通信環境を確認してから再試行してください。」と「再試行」ボタンがある", () => {
    render(<ApiErrorView kind="NETWORK" />);

    const alert = within(screen.getByRole("alert"));
    expect(
      alert.getByText("GitHub に接続できませんでした"),
    ).toBeInTheDocument();
    expect(
      alert.getByText("通信環境を確認してから再試行してください。"),
    ).toBeInTheDocument();
    expect(alert.getByRole("button", { name: "再試行" })).toBeInTheDocument();
  });
});

describe("ApiErrorView: 内部情報を出さない", () => {
  it.each([
    { kind: "RATE_LIMIT", status: 403 },
    { kind: "VALIDATION", status: 422 },
    { kind: "UPSTREAM", status: 502 },
    { kind: "NETWORK", status: undefined },
  ] as const)(
    "AC-19c: $kind のとき画面のテキストに英語の固定メッセージ・HTTP ステータス番号が含まれない",
    ({ kind, status }) => {
      const error = new GitHubApiError(kind, { status });

      render(<ApiErrorView kind={error.kind} resetAt={error.resetAt} />);

      const text = document.body.textContent ?? "";
      expect(text).not.toContain(error.message);
      if (status !== undefined) {
        expect(text).not.toContain(String(status));
      }
    },
  );
});

describe("ApiErrorView: 再試行", () => {
  it("AC-19d: 「再試行」を押すと router.refresh() が1回呼ばれ、push・replace は呼ばれない", async () => {
    const user = userEvent.setup();
    render(<ApiErrorView kind="UPSTREAM" />);

    await user.click(screen.getByRole("button", { name: "再試行" }));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('AC-19d: 再試行ボタンは type="button" である', () => {
    render(<ApiErrorView kind="UPSTREAM" />);

    expect(screen.getByRole("button", { name: "再試行" })).toHaveAttribute(
      "type",
      "button",
    );
  });
});

describe("ApiErrorView: キーボード操作（0011）", () => {
  it.each([
    { label: "Enter", key: "{Enter}" },
    { label: "Space", key: " " },
  ])(
    "AC-26b1: 「再試行」ボタンにフォーカスして $label を押すと router.refresh() が1回呼ばれる",
    async ({ key }) => {
      const user = userEvent.setup();
      render(<ApiErrorView kind="UPSTREAM" />);
      screen.getByRole("button", { name: "再試行" }).focus();

      await user.keyboard(key);

      expect(refresh).toHaveBeenCalledTimes(1);
    },
  );
});
