import { render, screen } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { GitHubApiError } from "@/lib/github/errors";
import type { GitHubErrorKind, RepoDetail } from "@/lib/github/types";
import Page from "./page";

// 取得 API（ネットワーク境界）だけを差し替える。ファクトリで丸ごと置き換えるので
// 本物の client.ts（server-only）は読み込まれない。next/navigation はモックしない。
const { getRepository } = vi.hoisted(() => ({
  getRepository: vi.fn<(owner: string, repo: string) => Promise<RepoDetail>>(),
}));

vi.mock("@/lib/github", () => ({ getRepository }));

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

beforeEach(() => {
  getRepository.mockReset();
  getRepository.mockResolvedValue(makeRepo());
});

// async な Server Component は JSX としては描画できないため、
// ページ関数を直接呼んで await し、返った要素を描画する。
function callPage(params: { owner: string; repo: string }) {
  return Page({
    params: Promise.resolve(params),
    searchParams: Promise.resolve({}),
  });
}

async function renderPage(params: { owner: string; repo: string }) {
  render(await callPage(params));
}

const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404";

describe("詳細ページ", () => {
  it("AC-12: /repos/vercel/next.js を直接開くと getRepository(vercel, next.js) を1回呼ぶ", async () => {
    await renderPage({ owner: "vercel", repo: "next.js" });

    expect(getRepository).toHaveBeenCalledTimes(1);
    expect(getRepository).toHaveBeenCalledWith("vercel", "next.js");
  });

  it("AC-12: 取得した内容（見出し・項目）がページに表示される", async () => {
    await renderPage({ owner: "vercel", repo: "next.js" });

    expect(
      screen.getByRole("heading", { level: 1, name: "vercel/next.js" }),
    ).toBeInTheDocument();
    const terms = screen.getAllByRole("term").map((e) => e.textContent);
    const definitions = screen
      .getAllByRole("definition")
      .map((e) => e.textContent);
    const pairs = terms.map((term, i) => [term, definitions[i]]);
    expect(pairs).toContainEqual(["Star数", "1,234,567"]);
    expect(pairs).toContainEqual(["オーナー", "vercel"]);
  });

  it("AC-12: 見出しはURLではなくAPIの応答（fullName）から取り、URLの owner・repo は加工せずに渡す", async () => {
    getRepository.mockResolvedValue(makeRepo({ fullName: "vercel/next.js" }));

    await renderPage({ owner: "VERCEL", repo: "NEXT.JS" });

    expect(getRepository).toHaveBeenCalledWith("VERCEL", "NEXT.JS");
    expect(
      screen.getByRole("heading", { level: 1, name: "vercel/next.js" }),
    ).toBeInTheDocument();
  });

  it("AC-11c: 詳細はモーダルではなく独立したページとして表示され、トップへ戻るリンクがある", async () => {
    await renderPage({ owner: "vercel", repo: "next.js" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("link", { name: "トップへ戻る" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("AC-20a: getRepository が NOT_FOUND で失敗したとき notFound() が呼ばれ、詳細は表示されない", async () => {
    getRepository.mockRejectedValue(
      new GitHubApiError("NOT_FOUND", { status: 404 }),
    );

    await expect(
      callPage({ owner: "vercel", repo: "no-such-repo" }),
    ).rejects.toMatchObject({ digest: NOT_FOUND_DIGEST });

    // reject されるため描画する要素は返らない（= 詳細は表示されない）
    expect(getRepository).toHaveBeenCalledTimes(1);
  });

  const otherKinds: { kind: GitHubErrorKind }[] = [
    { kind: "RATE_LIMIT" },
    { kind: "VALIDATION" },
    { kind: "UPSTREAM" },
    { kind: "NETWORK" },
  ];

  it.each(otherKinds)(
    "AC-20b: getRepository が $kind で失敗したとき notFound() を呼ばず、同じエラーをそのまま投げる",
    async ({ kind }) => {
      const error = new GitHubApiError(kind);
      getRepository.mockRejectedValue(error);

      await expect(callPage({ owner: "vercel", repo: "next.js" })).rejects.toBe(
        error,
      );
    },
  );

  it("AC-20b: GitHubApiError 以外の例外もそのまま投げる", async () => {
    const error = new Error("unexpected");
    getRepository.mockRejectedValue(error);

    await expect(callPage({ owner: "vercel", repo: "next.js" })).rejects.toBe(
      error,
    );
  });
});
