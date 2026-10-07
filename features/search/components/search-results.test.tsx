import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RepoSummary } from "@/lib/github/types";
import { SearchResults } from "./search-results";

function makeItems(n: number): RepoSummary[] {
  return Array.from({ length: n }, (_, i) => ({
    fullName: `owner${i}/repo${i}`,
    ownerLogin: `owner${i}`,
    ownerAvatarUrl: `https://avatars.githubusercontent.com/u/${i}?v=4`,
  }));
}

function makeItem(fullName: string): RepoSummary {
  const [owner = ""] = fullName.split("/");
  return {
    fullName,
    ownerLogin: owner,
    ownerAvatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
  };
}

describe("SearchResults: 一覧の表示", () => {
  it("AC-6a: 30件のとき30行が表示され、各行にオーナー名の代替テキストのアイコンと owner/repo のリンクが1つずつある", () => {
    render(<SearchResults totalCount={100} items={makeItems(30)} />);

    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows).toHaveLength(30);
    rows.forEach((row, i) => {
      expect(
        within(row).getByRole("img", { name: `owner${i}` }),
      ).toBeInTheDocument();
      const links = within(row).getAllByRole("link");
      expect(links).toHaveLength(1);
      expect(
        within(row).getByRole("link", { name: `owner${i}/repo${i}` }),
      ).toBe(links[0]);
    });
  });

  it("AC-6a: アイコンの画像の元 URL は ownerAvatarUrl である", () => {
    render(<SearchResults totalCount={1} items={makeItems(1)} />);

    const src = screen.getByRole("img", { name: "owner0" }).getAttribute("src");
    expect(src).not.toBeNull();
    expect(new URL(src ?? "", "http://localhost").searchParams.get("url")).toBe(
      "https://avatars.githubusercontent.com/u/0?v=4",
    );
  });

  it("AC-6b: 12件のとき12行が表示される", () => {
    render(<SearchResults totalCount={12} items={makeItems(12)} />);

    expect(
      within(screen.getByRole("list")).getAllByRole("listitem"),
    ).toHaveLength(12);
  });

  it("AC-7: totalCount が 12345 のとき「総ヒット件数: 12,345 件」と表示される", () => {
    render(<SearchResults totalCount={12345} items={makeItems(1)} />);

    expect(screen.getByText("総ヒット件数: 12,345 件")).toBeInTheDocument();
  });

  it("AC-5: API が返した順（zeta/zz, alpha/aa, mid/mm）のまま表示し、並べ替えない", () => {
    render(
      <SearchResults
        totalCount={3}
        items={[makeItem("zeta/zz"), makeItem("alpha/aa"), makeItem("mid/mm")]}
      />,
    );

    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual([
      "zeta/zz",
      "alpha/aa",
      "mid/mm",
    ]);
  });

  it("AC-10: vercel/next.js の行のリンク先は /repos/vercel/next.js で、別タブ指定のない通常のリンクである", () => {
    render(
      <SearchResults totalCount={1} items={[makeItem("vercel/next.js")]} />,
    );

    const link = screen.getByRole("link", { name: "vercel/next.js" });
    expect(link).toHaveAttribute("href", "/repos/vercel/next.js");
    expect(link).not.toHaveAttribute("target");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("AC-7（仕様6.1）: 0件のとき「総ヒット件数: 0 件」と空の一覧を表示する", () => {
    render(<SearchResults totalCount={0} items={[]} />);

    expect(screen.getByText("総ヒット件数: 0 件")).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
