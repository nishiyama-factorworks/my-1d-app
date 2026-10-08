import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RepoDetail } from "@/lib/github/types";
import { RepoDetailView } from "./repo-detail-view";

// 6 項目の数値はすべて異なる値にして、ラベルと値の取り違えを検出する。
function makeRepo(overrides: Partial<RepoDetail> = {}): RepoDetail {
  return {
    fullName: "vercel/next.js",
    ownerLogin: "vercel",
    ownerAvatarUrl: "https://avatars.githubusercontent.com/u/14985020?v=4",
    language: "TypeScript",
    stargazersCount: 1234567,
    watchersCount: 7,
    forksCount: 0,
    openIssuesCount: 5,
    htmlUrl: "https://github.com/vercel/next.js",
    ...overrides,
  };
}

// <dt> と <dd> を出現順に組にして [ラベル, 値] の配列にする。
function getPairs(): [string | null, string | null][] {
  const terms = screen.getAllByRole("term");
  const definitions = screen.getAllByRole("definition");
  return terms.map((term, i) => [
    term.textContent,
    definitions[i]?.textContent ?? null,
  ]);
}

describe("RepoDetailView: 詳細の表示", () => {
  it("AC-11a: レベル1の見出しに vercel/next.js が表示される", () => {
    render(<RepoDetailView repo={makeRepo()} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "vercel/next.js" }),
    ).toBeInTheDocument();
  });

  it("AC-11a: オーナーアイコンが代替テキスト vercel で表示される", () => {
    render(<RepoDetailView repo={makeRepo()} />);

    expect(screen.getByRole("img", { name: "vercel" })).toBeInTheDocument();
  });

  it("AC-11a: アイコンの画像の元 URL は ownerAvatarUrl である", () => {
    render(<RepoDetailView repo={makeRepo()} />);

    const src = screen.getByRole("img", { name: "vercel" }).getAttribute("src");
    expect(src).not.toBeNull();
    expect(new URL(src ?? "", "http://localhost").searchParams.get("url")).toBe(
      "https://avatars.githubusercontent.com/u/14985020?v=4",
    );
  });

  it("AC-11a: ラベル オーナー・言語・Star数・Watcher数・Fork数・Issue数 に、vercel・TypeScript・各数値が対で表示される", () => {
    render(<RepoDetailView repo={makeRepo()} />);

    expect(getPairs()).toEqual([
      ["オーナー", "vercel"],
      ["言語", "TypeScript"],
      ["Star数", "1,234,567"],
      ["Watcher数", "7"],
      ["Fork数", "0"],
      ["Issue数", "5"],
    ]);
  });

  it("AC-13: Star数100・Watcher数7・Issue数5 のとき、それぞれの値が表示され、Watcher数にStar数を表示しない", () => {
    render(
      <RepoDetailView
        repo={makeRepo({
          stargazersCount: 100,
          watchersCount: 7,
          forksCount: 42,
          openIssuesCount: 5,
        })}
      />,
    );

    const pairs = getPairs();
    expect(pairs).toEqual([
      ["オーナー", "vercel"],
      ["言語", "TypeScript"],
      ["Star数", "100"],
      ["Watcher数", "7"],
      ["Fork数", "42"],
      ["Issue数", "5"],
    ]);
    expect(pairs.find(([label]) => label === "Watcher数")?.[1]).not.toBe("100");
  });

  it("AC-14a: Star数1234567は 1,234,567、Fork数0は 0 と表示される", () => {
    render(
      <RepoDetailView
        repo={makeRepo({ stargazersCount: 1234567, forksCount: 0 })}
      />,
    );

    const pairs = getPairs();
    expect(pairs).toContainEqual(["Star数", "1,234,567"]);
    expect(pairs).toContainEqual(["Fork数", "0"]);
  });

  it("AC-14b: language が null のとき言語欄に - が表示される", () => {
    render(<RepoDetailView repo={makeRepo({ language: null })} />);

    expect(getPairs()).toContainEqual(["言語", "-"]);
  });

  it("AC-11b: 名前が「GitHub で開く」のリンクの href が htmlUrl と等しく、target を持たず、rel が noopener noreferrer である", () => {
    render(<RepoDetailView repo={makeRepo()} />);

    const link = screen.getByRole("link", { name: "GitHub で開く" });
    expect(link).toHaveAttribute("href", "https://github.com/vercel/next.js");
    expect(link).not.toHaveAttribute("target");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("AC-11c: 名前が「トップへ戻る」のリンクの href が / で、モーダル（role=dialog）は無い", () => {
    render(<RepoDetailView repo={makeRepo()} />);

    expect(screen.getByRole("link", { name: "トップへ戻る" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
