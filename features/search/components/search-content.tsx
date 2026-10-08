import { use, type ReactNode } from "react";
import { ApiErrorView } from "@/features/state-views/components/api-error-view";
import { EmptyResults } from "@/features/search/components/empty-results";
import { isGitHubApiError } from "@/lib/github/errors";
import { OutOfRangeNotice } from "@/features/search/components/out-of-range-notice";
import { Pagination } from "@/features/search/components/pagination";
import { SearchResults } from "@/features/search/components/search-results";
import { searchRepositories } from "@/lib/github";
import { SEARCH_PER_PAGE, SEARCH_RESULT_LIMIT } from "@/lib/search/constants";
import { calculateMaxPage } from "@/lib/search/pagination";

// 取得を <Suspense> の内側で待たせるため、ページは Promise のまま受け渡し、ここで use で読む。
export function SearchContent({ content }: { content: Promise<ReactNode> }) {
  return use(content);
}

// 範囲外の判定は 2 段で行う。
// 前段: GitHub は 1,000 件より先を 422 で拒否し、呼ぶだけでレート制限も消費するため、
//       取得可能な最大ページ超なら API を呼ばずに判定する。
// 後段: 実際の総件数は取得するまで分からないため、取得後に最終ページ超かを判定する。
export async function renderSearchContent({
  q,
  page,
}: {
  q: string;
  page: number;
}) {
  if (page > calculateMaxPage(SEARCH_RESULT_LIMIT)) {
    return <OutOfRangeNotice q={q} target={{ kind: "first" }} />;
  }

  let result;
  try {
    result = await searchRepositories({ q, page, perPage: SEARCH_PER_PAGE });
  } catch (error) {
    // GitHubApiError だけを種別ごとの表示にする。想定外の例外は握りつぶさず投げる。
    if (isGitHubApiError(error)) {
      return <ApiErrorView kind={error.kind} resetAt={error.resetAt} />;
    }
    throw error;
  }

  // 総件数 0 のときは page に関わらず範囲外にせず、0 件の案内を表示する
  if (result.totalCount === 0) {
    return <EmptyResults q={q} />;
  }

  const maxPage = calculateMaxPage(result.totalCount);
  if (page > maxPage) {
    return <OutOfRangeNotice q={q} target={{ kind: "last", page: maxPage }} />;
  }

  return (
    <>
      <SearchResults totalCount={result.totalCount} items={result.items} />
      <Pagination q={q} currentPage={page} maxPage={maxPage} />
    </>
  );
}
