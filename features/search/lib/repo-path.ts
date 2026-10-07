import { GitHubApiError } from "@/lib/github/errors";
import { buildRepoPath } from "@/lib/search/paths";

export function repoPathFromFullName(fullName: string): string {
  // owner の login に "/" は含まれないため、最初の "/" で分ければ
  // repo 側に "/" があっても owner が壊れない。
  const index = fullName.indexOf("/");
  const owner = fullName.slice(0, index);
  const repo = fullName.slice(index + 1);
  if (index === -1 || owner === "" || repo === "") {
    throw new GitHubApiError("UPSTREAM");
  }
  return buildRepoPath(owner, repo);
}
