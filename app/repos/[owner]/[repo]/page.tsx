import { notFound } from "next/navigation";
import { RepoDetailView } from "@/features/repo-detail/components/repo-detail-view";
import { getRepository } from "@/lib/github";
import { isGitHubApiError } from "@/lib/github/errors";
import type { RepoDetail } from "@/lib/github/types";

export default async function RepoDetailPage({
  params,
}: PageProps<"/repos/[owner]/[repo]">) {
  const { owner, repo } = await params;

  let detail: RepoDetail;
  try {
    detail = await getRepository(owner, repo);
  } catch (e) {
    // notFound() は例外を投げるため、try の中で呼ぶと自分の catch に捕まる。
    // NOT_FOUND 以外は専用のエラー表示（0010）まで握りつぶさずそのまま投げる。
    if (isGitHubApiError(e) && e.kind === "NOT_FOUND") {
      notFound();
    }
    throw e;
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-8">
      <RepoDetailView repo={detail} />
    </main>
  );
}
