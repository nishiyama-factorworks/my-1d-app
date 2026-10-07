import "server-only";

import { githubGet } from "./http";
import { mapRepositoryResponse, mapSearchResponse } from "./mappers";
import type {
  RepoDetail,
  SearchRepositoriesParams,
  SearchRepositoriesResult,
} from "./types";

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 30;

export async function searchRepositories({
  q,
  page = DEFAULT_PAGE,
  perPage = DEFAULT_PER_PAGE,
}: SearchRepositoriesParams): Promise<SearchRepositoriesResult> {
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
  const json = await githubGet(
    "repo",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
  );
  return mapRepositoryResponse(json);
}
