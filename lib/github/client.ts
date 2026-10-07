import "server-only";

import { GitHubApiError } from "./errors";
import { githubGet } from "./http";
import { mapRepositoryResponse, mapSearchResponse } from "./mappers";
import type {
  RepoDetail,
  SearchRepositoriesParams,
  SearchRepositoriesResult,
} from "./types";

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 30;

const OWNER_PATTERN = /^[A-Za-z0-9-]{1,39}$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const MAX_PER_PAGE = 100;
// GitHub のドキュメントが定める検索クエリの上限文字数に合わせる
const MAX_Q_LENGTH = 256;

export async function searchRepositories({
  q,
  page = DEFAULT_PAGE,
  perPage = DEFAULT_PER_PAGE,
}: SearchRepositoriesParams): Promise<SearchRepositoriesResult> {
  if (
    q.trim() === "" ||
    q.length > MAX_Q_LENGTH ||
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(perPage) ||
    perPage < 1 ||
    perPage > MAX_PER_PAGE
  ) {
    throw new GitHubApiError("VALIDATION");
  }
  const json = await githubGet("search", "/search/repositories", {
    q,
    page: String(page),
    per_page: String(perPage),
  });
  return mapSearchResponse(json);
}

export async function getRepository(
  owner: string,
  repo: string,
): Promise<RepoDetail> {
  if (
    !OWNER_PATTERN.test(owner) ||
    !REPO_PATTERN.test(repo) ||
    repo === "." ||
    repo === ".."
  ) {
    throw new GitHubApiError("NOT_FOUND");
  }
  const json = await githubGet(
    "repo",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
  );
  return mapRepositoryResponse(json);
}
