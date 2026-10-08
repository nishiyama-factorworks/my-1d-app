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

function renderResults({
  totalCount,
  items,
  q = "react",
  page = 1,
}: {
  totalCount: number;
  items: RepoSummary[];
  q?: string;
  page?: number;
}) {
  return render(
    <SearchResults totalCount={totalCount} items={items} q={q} page={page} />,
  );
}

describe("SearchResults: 一覧の表示", () => {
  it("AC-6a: 30件のとき30行が表示され、各行にオーナー名の代替テキストのアイコンと owner/repo のリンクが1つずつある", () => {
    renderResults({ totalCount: 100, items: makeItems(30) });

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
    renderResults({ totalCount: 1, items: makeItems(1) });

    const src = screen.getByRole("img", { name: "owner0" }).getAttribute("src");
    expect(src).not.toBeNull();
    expect(new URL(src ?? "", "http://localhost").searchParams.get("url")).toBe(
      "https://avatars.githubusercontent.com/u/0?v=4",
    );
  });

  it("AC-6b: 12件のとき12行が表示される", () => {
    renderResults({ totalCount: 12, items: makeItems(12) });

    expect(
      within(screen.getByRole("list")).getAllByRole("listitem"),
    ).toHaveLength(12);
  });

  it("AC-7: totalCount が 12345 のとき「総ヒット件数: 12,345 件」と表示される", () => {
    renderResults({ totalCount: 12345, items: makeItems(1) });

    expect(screen.getByText("総ヒット件数: 12,345 件")).toBeInTheDocument();
  });

  it("AC-5: API が返した順（zeta/zz, alpha/aa, mid/mm）のまま表示し、並べ替えない", () => {
    renderResults({
      totalCount: 3,
      items: [makeItem("zeta/zz"), makeItem("alpha/aa"), makeItem("mid/mm")],
    });

    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual([
      "zeta/zz",
      "alpha/aa",
      "mid/mm",
    ]);
  });

  it("AC-10・AC-15e: vercel/next.js の行のリンク先のパスは /repos/vercel/next.js で、検索条件のクエリが付き、別タブ指定のない通常のリンクである", () => {
    renderResults({ totalCount: 1, items: [makeItem("vercel/next.js")] });

    const link = screen.getByRole("link", { name: "vercel/next.js" });
    const href = link.getAttribute("href") ?? "";
    expect(href).toBe("/repos/vercel/next.js?q=react&page=1");
    expect(new URL(href, "http://localhost").pathname).toBe(
      "/repos/vercel/next.js",
    );
    expect(link).not.toHaveAttribute("target");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("AC-7（仕様6.1）: 0件のとき「総ヒット件数: 0 件」と空の一覧を表示する", () => {
    renderResults({ totalCount: 0, items: [] });

    expect(screen.getByText("総ヒット件数: 0 件")).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});

describe("SearchResults: 行リンクに付く検索条件（0009）", () => {
  it("AC-15e: q=react・page=3 のとき、行 vercel/next.js の href は /repos/vercel/next.js?q=react&page=3 である", () => {
    renderResults({
      totalCount: 100,
      items: [makeItem("vercel/next.js")],
      q: "react",
      page: 3,
    });

    expect(
      screen.getByRole("link", { name: "vercel/next.js" }),
    ).toHaveAttribute("href", "/repos/vercel/next.js?q=react&page=3");
  });

  it("AC-15d: q が「日本語 & react」・page 2 のとき、href は符号化され、読み戻すと q は元の文字列になる", () => {
    renderResults({
      totalCount: 100,
      items: [makeItem("vercel/next.js")],
      q: "日本語 & react",
      page: 2,
    });

    const href =
      screen
        .getByRole("link", { name: "vercel/next.js" })
        .getAttribute("href") ?? "";
    expect(href).toBe(
      "/repos/vercel/next.js?q=%E6%97%A5%E6%9C%AC%E8%AA%9E+%26+react&page=2",
    );
    expect(new URL(href, "http://localhost").searchParams.get("q")).toBe(
      "日本語 & react",
    );
  });

  it("AC-15e: 30 行すべてのリンクに同じ q・page が付く", () => {
    renderResults({
      totalCount: 100,
      items: makeItems(30),
      q: "react",
      page: 3,
    });

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(30);
    links.forEach((link, i) => {
      expect(link).toHaveAttribute(
        "href",
        `/repos/owner${i}/repo${i}?q=react&page=3`,
      );
    });
  });
});

describe("SearchResults: 1,000件上限の注記", () => {
  const NOTE = "上位1,000件まで表示します";

  it.each([{ totalCount: 1001 }, { totalCount: 50000 }])(
    `AC-9a: 総件数が $totalCount のとき「${NOTE}」を表示する`,
    ({ totalCount }) => {
      renderResults({ totalCount, items: makeItems(1) });

      expect(screen.getByText(NOTE)).toBeInTheDocument();
    },
  );

  it.each([{ totalCount: 1000 }, { totalCount: 0 }])(
    "AC-9a: 総件数が $totalCount のとき注記を表示しない",
    ({ totalCount }) => {
      renderResults({
        totalCount,
        items: makeItems(totalCount === 0 ? 0 : 1),
      });

      expect(screen.queryByText(NOTE)).toBeNull();
    },
  );
});

describe("SearchResults: 代替テキスト（0011）", () => {
  it("AC-26c2: 各行のオーナーアイコンの img の alt はオーナーのログイン名である", () => {
    renderResults({ totalCount: 3, items: makeItems(3) });

    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    rows.forEach((row, i) => {
      expect(within(row).getByRole("img")).toHaveAttribute("alt", `owner${i}`);
    });
  });
});
