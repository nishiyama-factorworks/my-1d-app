import type { GitHubErrorKind } from "./types";

const MESSAGES: Record<GitHubErrorKind, string> = {
  RATE_LIMIT: "GitHub API rate limit exceeded",
  NOT_FOUND: "GitHub resource not found",
  VALIDATION: "GitHub API request validation failed",
  UPSTREAM: "GitHub API returned an unexpected response",
  NETWORK: "Failed to connect to GitHub API",
};

export class GitHubApiError extends Error {
  readonly kind: GitHubErrorKind;
  readonly status: number | undefined;
  readonly resetAt: Date | undefined;

  constructor(
    kind: GitHubErrorKind,
    options: { status?: number; resetAt?: Date } = {},
  ) {
    super(MESSAGES[kind]);
    this.name = "GitHubApiError";
    this.kind = kind;
    this.status = options.status;
    this.resetAt = options.resetAt;
  }
}

export function isGitHubApiError(e: unknown): e is GitHubApiError {
  return e instanceof GitHubApiError;
}

function parseResetAt(headers: Headers): Date | undefined {
  const raw = headers.get("x-ratelimit-reset");
  if (raw === null || !/^\d+$/.test(raw)) return undefined;
  return new Date(Number(raw) * 1000);
}

export function classifyHttpError(
  status: number,
  headers: Headers,
  endpoint: "search" | "repo",
): GitHubApiError {
  // 403 はレート制限以外（権限不足など）もあるため、残量 0 のときだけ RATE_LIMIT とする。
  const isRateLimit =
    status === 429 ||
    (status === 403 && headers.get("x-ratelimit-remaining") === "0");
  if (isRateLimit) {
    return new GitHubApiError("RATE_LIMIT", {
      status,
      resetAt: parseResetAt(headers),
    });
  }
  if (status === 404 && endpoint === "repo") {
    return new GitHubApiError("NOT_FOUND", { status });
  }
  if (status === 422 && endpoint === "search") {
    return new GitHubApiError("VALIDATION", { status });
  }
  return new GitHubApiError("UPSTREAM", { status });
}
