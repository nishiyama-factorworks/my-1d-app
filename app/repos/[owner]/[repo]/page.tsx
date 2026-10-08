import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiErrorView } from "@/features/state-views/components/api-error-view";
import { RepoDetailView } from "@/features/repo-detail/components/repo-detail-view";
import { getRepository } from "@/lib/github";
import { isGitHubApiError } from "@/lib/github/errors";
import type { RepoDetail } from "@/lib/github/types";
import { buildBackPath } from "@/lib/search/back-path";

// 追加の API 呼び出しを避けるため、タイトルは URL の params から作る。
export async function generateMetadata({
  params,
}: PageProps<"/repos/[owner]/[repo]">): Promise<Metadata> {
  const { owner, repo } = await params;
  return { title: `${owner}/${repo}` };
}

export default async function RepoDetailPage({
  params,
  searchParams,
}: PageProps<"/repos/[owner]/[repo]">) {
  const { owner, repo } = await params;

  let detail: RepoDetail;
  try {
    detail = await getRepository(owner, repo);
  } catch (e) {
    // notFound() は例外を投げるため、try の中で呼ぶと自分の catch に捕まる。
    // NOT_FOUND 以外の GitHubApiError は、本番では例外の message が error.tsx に届かないため
    // ここで種別ごとの固定文言を描画する。想定外の例外はそのまま投げる（app/error.tsx が受ける）。
    if (!isGitHubApiError(e)) {
      throw e;
    }
    if (e.kind === "NOT_FOUND") {
      notFound();
    }
    return (
      <main className="flex flex-1 flex-col items-center gap-6 p-8">
        <h1 className="text-2xl font-semibold">
          リポジトリを表示できませんでした
        </h1>
        <ApiErrorView kind={e.kind} resetAt={e.resetAt} />
      </main>
    );
  }

  // 生の文字列を連結せず、検証済みの値から戻り先を組み立てる（オープンリダイレクト対策）。
  const backHref = buildBackPath(await searchParams);

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-8">
      <RepoDetailView repo={detail} backHref={backHref} />
    </main>
  );
}
