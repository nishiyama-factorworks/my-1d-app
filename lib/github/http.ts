import "server-only";

import { classifyHttpError, GitHubApiError } from "./errors";

const BASE_URL = "https://api.github.com";
const TIMEOUT_MS = 10_000;

type Endpoint = "search" | "repo";

// レート制限と鮮度の釣り合い。根拠は ADR 0005。
const REVALIDATE_SECONDS = { search: 300, repo: 600 } as const satisfies Record<
  Endpoint,
  number
>;

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  // トークンは呼び出しごとに読む。この関数の外へ渡さない。
  const token = process.env.GITHUB_TOKEN;
  if (typeof token === "string" && token !== "") {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function githubGet(
  endpoint: Endpoint,
  path: string,
  query?: Record<string, string>,
): Promise<unknown> {
  const url = new URL(path, BASE_URL);
  // 絶対 URL や "//host" 形式で別オリジンへ向けられないようにする（トークン漏えい防止）。
  if (url.origin !== BASE_URL) {
    throw new GitHubApiError("VALIDATION");
  }
  if (query) {
    url.search = new URLSearchParams(query).toString();
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: buildHeaders(),
        signal: controller.signal,
        next: { revalidate: REVALIDATE_SECONDS[endpoint] },
      });
    } catch {
      // 元の例外メッセージには URL 等が含まれ得るため、意図的に引き継がない。
      throw new GitHubApiError("NETWORK");
    }
    if (!res.ok) {
      // エラー本文は使わないので破棄し、接続を解放する。
      // cancel の失敗は分類結果に影響せず、元の HTTP エラーを優先するため無視する。
      // 完了を待つと cancel が滞ったときにエラー分類まで遅れるため、待たない。
      void res.body?.cancel().catch(() => {});
      throw classifyHttpError(res.status, res.headers, endpoint);
    }
    try {
      return await res.json();
    } catch {
      // 本文の読み取り中にタイムアウトした場合は、JSON の不正ではなく通信の失敗として扱う。
      if (controller.signal.aborted) throw new GitHubApiError("NETWORK");
      throw new GitHubApiError("UPSTREAM", { status: res.status });
    }
  } finally {
    clearTimeout(timer);
  }
}
