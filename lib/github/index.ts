export { searchRepositories, getRepository } from "./client";
export { GitHubApiError, isGitHubApiError } from "./errors";
export type {
  GitHubErrorKind,
  RepoDetail,
  RepoSummary,
  SearchRepositoriesParams,
  SearchRepositoriesResult,
} from "./types";
