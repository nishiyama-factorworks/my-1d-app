import "server-only";

import { classifyHttpError, GitHubApiError } from "./errors";

const BASE_URL = "https://api.github.com";
const TIMEOUT_MS = 10_000;

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
  endpoint: "search" | "repo",
  path: string,
  query?: Record<string, string>,
): Promise<unknown> {
  const url = new URL(path, BASE_URL);
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
      });
    } catch {
      // 元の例外メッセージには URL 等が含まれ得るため、意図的に引き継がない。
      throw new GitHubApiError("NETWORK");
    }
    if (!res.ok) {
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
