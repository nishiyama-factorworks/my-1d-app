import "server-only";

import { classifyHttpError, GitHubApiError } from "./errors";

const GITHUB_API_ORIGIN = "https://api.github.com";
const TIMEOUT_MS = 10_000;

type Endpoint = "search" | "repo";

// レート制限と鮮度の釣り合い。根拠は ADR 0005。
const REVALIDATE_SECONDS = { search: 300, repo: 600 } as const satisfies Record<
  Endpoint,
  number
>;

// E2E 専用の接続先の上書き（仕様 0013、ADR 0006）。ループバックのオリジンだけを許す。
// 値が不正なときに黙って api.github.com へ送らず、fetch の前に VALIDATION で止める。
// 上書き中は、トークンを偽の API へ送らないため Authorization を付けない。
function resolveBaseOrigin(raw: string | undefined): {
  origin: string;
  overridden: boolean;
} {
  if (raw === undefined || raw === "") {
    return { origin: GITHUB_API_ORIGIN, overridden: false };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // 元の例外には値が含まれ得るため、引き継がない。
    throw new GitHubApiError("VALIDATION");
  }
  const isLoopback =
    url.hostname === "127.0.0.1" || url.hostname === "localhost";
  const isOriginOnly =
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === "";
  if (
    url.protocol !== "http:" ||
    !isLoopback ||
    url.port === "" ||
    !isOriginOnly
  ) {
    throw new GitHubApiError("VALIDATION");
  }
  return { origin: url.origin, overridden: true };
}

function buildHeaders(withToken: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  // トークンは呼び出しごとに読む。この関数の外へ渡さない。
  const token = withToken ? process.env.GITHUB_TOKEN : undefined;
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
  // 接続先は呼び出しごとに読む（GITHUB_TOKEN と同じ。モジュール読み込み時に固定しない）。
  const base = resolveBaseOrigin(process.env.GITHUB_API_BASE_URL);
  const url = new URL(path, base.origin);
  // 絶対 URL や "//host" 形式で別オリジンへ向けられないようにする（トークン漏えい防止）。
  // 上書き中も、上書き後のオリジンに対して同じ検査を行う。
  if (url.origin !== base.origin) {
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
        headers: buildHeaders(!base.overridden),
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
