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

// 似せたホストやサブドメインを通さないよう、ホスト名の完全一致のみ許可する。
// 認証情報・ポート付きは拒否し、検証後の正規化済み href を返す。
function safeUrl(value: string, host: string): string {
  const url = parseHttpsUrl(value);
  const ok =
    url.hostname === host &&
    url.username === "" &&
    url.password === "" &&
    url.port === "";
  return ok ? url.href : fail();
}

// 公開と確認できたものだけを公開扱いにする（安全側に倒す）。
function isPublic(item: unknown): boolean {
  return (
    isRecord(item) &&
    item.private === false &&
    (item.visibility === undefined || item.visibility === "public")
  );
}

function mapSummary(item: unknown): RepoSummary {
  if (!isRecord(item)) return fail();
  const owner = record(item, "owner");
  return {
    fullName: str(item, "full_name"),
    ownerLogin: str(owner, "login"),
    ownerAvatarUrl: safeUrl(
      str(owner, "avatar_url"),
      "avatars.githubusercontent.com",
    ),
  };
}

export function mapSearchResponse(json: unknown): SearchRepositoriesResult {
  if (!isRecord(json)) return fail();
  const items = json.items;
  if (!Array.isArray(items)) return fail();
  return {
    totalCount: num(json, "total_count"),
    items: items.filter(isPublic).map(mapSummary),
  };
}

export function mapRepositoryResponse(json: unknown): RepoDetail {
  if (!isRecord(json)) return fail();
  const language = json.language;
  if (language !== null && typeof language !== "string") return fail();
  const detail: RepoDetail = {
    ...mapSummary(json),
    language,
    stargazersCount: num(json, "stargazers_count"),
    watchersCount: num(json, "subscribers_count"),
    forksCount: num(json, "forks_count"),
    openIssuesCount: num(json, "open_issues_count"),
    htmlUrl: safeUrl(str(json, "html_url"), "github.com"),
  };
  // 形の検証を先に行い、想定外の JSON は UPSTREAM に分類する。公開と確認できないものは NOT_FOUND。
  if (!isPublic(json)) throw new GitHubApiError("NOT_FOUND");
  return detail;
}
