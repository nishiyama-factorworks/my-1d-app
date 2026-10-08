export type SearchRepositoriesParams = {
  q: string;
  page?: number; // 既定 1
  perPage?: number; // 既定は SEARCH_PER_PAGE（lib/search/constants.ts）
};

export type RepoSummary = {
  fullName: string;
  ownerLogin: string;
  ownerAvatarUrl: string;
};

export type SearchRepositoriesResult = {
  totalCount: number;
  items: RepoSummary[];
};

export type RepoDetail = {
  fullName: string;
  ownerLogin: string;
  ownerAvatarUrl: string;
  language: string | null;
  stargazersCount: number;
  watchersCount: number; // subscribers_count から（watchers_count は使わない）
  forksCount: number;
  openIssuesCount: number;
  htmlUrl: string;
};

export type GitHubErrorKind =
  "RATE_LIMIT" | "NOT_FOUND" | "VALIDATION" | "UPSTREAM" | "NETWORK";
