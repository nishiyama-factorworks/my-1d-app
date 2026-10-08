// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import RootLayout, { metadata } from "./layout";

// フォントの取得は外部通信になるため、プロセス境界の外として差し替える。
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "font-test" }),
  Geist_Mono: () => ({ variable: "font-test" }),
}));

describe("ルートレイアウト: メタデータ（0011）", () => {
  it("AC-28d: ルートの metadata.title は default が「GitHub リポジトリ検索」、template が「%s | GitHub リポジトリ検索」である", () => {
    expect(metadata.title).toEqual({
      default: "GitHub リポジトリ検索",
      template: "%s | GitHub リポジトリ検索",
    });
  });

  it("AC-28d: ルートの metadata.description は「GitHub のリポジトリをキーワードで検索し、詳細を確認できます」である", () => {
    expect(metadata.description).toBe(
      "GitHub のリポジトリをキーワードで検索し、詳細を確認できます",
    );
  });

  it("AC-28d（補強）: 詳細の not-found.tsx は metadata・generateMetadata を export しない", async () => {
    const mod = await import("./repos/[owner]/[repo]/not-found");

    expect(mod).not.toHaveProperty("metadata");
    expect(mod).not.toHaveProperty("generateMetadata");
  });

  it("AC-28d（補強）: app/error.tsx は metadata・generateMetadata を export しない", async () => {
    const mod = await import("./error");

    expect(mod).not.toHaveProperty("metadata");
    expect(mod).not.toHaveProperty("generateMetadata");
  });
});

describe("ルートレイアウト: html 要素（0011）", () => {
  it("AC-26e: ルートレイアウトの html 要素の lang が ja である", () => {
    const html = renderToStaticMarkup(
      <RootLayout params={Promise.resolve({})}>
        <p>child</p>
      </RootLayout>,
    );

    expect(html.startsWith('<html lang="ja"')).toBe(true);
    expect(html).toMatch(/<body[^>]*>.*<p>child<\/p>.*<\/body>/);
  });
});
