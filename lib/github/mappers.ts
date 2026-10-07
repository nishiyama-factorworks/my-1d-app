import { GitHubApiError } from "./errors";
import type {
  RepoDetail,
  RepoSummary,
  SearchRepositoriesResult,
} from "./types";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

// 想定外の形は値を含めずに UPSTREAM として扱う（レスポンス内容を漏らさない）。
function fail(): never {
  throw new GitHubApiError("UPSTREAM");
}

function str(obj: UnknownRecord, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : fail();
}

function num(obj: UnknownRecord, key: string): number {
  const v = obj[key];
  return typeof v === "number" ? v : fail();
}

function record(obj: UnknownRecord, key: string): UnknownRecord {
  const v = obj[key];
  return isRecord(v) ? v : fail();
}

function parseHttpsUrl(value: string): URL {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : fail();
  } catch {
    // new URL の例外は値を含み得るため、cause を残さず UPSTREAM に統一する。
    return fail();
  }
}

// 似せたホスト（evilgithubusercontent.com 等）を通さないよう、完全一致かサブドメインのみ許可する。
function safeUrl(value: string, host: string, allowSubdomain: boolean): string {
  const hostname = parseHttpsUrl(value).hostname;
  const ok =
    hostname === host || (allowSubdomain && hostname.endsWith(`.${host}`));
  return ok ? value : fail();
}

function isPrivate(item: unknown): boolean {
  return isRecord(item) && item.private === true;
}

function mapSummary(item: unknown): RepoSummary {
  if (!isRecord(item)) return fail();
  const owner = record(item, "owner");
  return {
    fullName: str(item, "full_name"),
    ownerLogin: str(owner, "login"),
    ownerAvatarUrl: safeUrl(
      str(owner, "avatar_url"),
      "githubusercontent.com",
      true,
    ),
  };
}

export function mapSearchResponse(json: unknown): SearchRepositoriesResult {
  if (!isRecord(json)) return fail();
  const items = json.items;
  if (!Array.isArray(items)) return fail();
  return {
    totalCount: num(json, "total_count"),
    items: items.filter((item) => !isPrivate(item)).map(mapSummary),
  };
}

export function mapRepositoryResponse(json: unknown): RepoDetail {
  if (!isRecord(json)) return fail();
  if (isPrivate(json)) throw new GitHubApiError("NOT_FOUND");
  const language = json.language;
  if (language !== null && typeof language !== "string") return fail();
  return {
    ...mapSummary(json),
    language,
    stargazersCount: num(json, "stargazers_count"),
    watchersCount: num(json, "subscribers_count"),
    forksCount: num(json, "forks_count"),
    openIssuesCount: num(json, "open_issues_count"),
    htmlUrl: safeUrl(str(json, "html_url"), "github.com", false),
  };
}
