import { OutOfRangeNotice } from "@/features/search/components/out-of-range-notice";
import { Pagination } from "@/features/search/components/pagination";
import { SearchForm } from "@/features/search/components/search-form";
import { SearchResults } from "@/features/search/components/search-results";
import { APP_NAME } from "@/lib/app-config";
import { searchRepositories } from "@/lib/github";
import { SEARCH_PER_PAGE, SEARCH_RESULT_LIMIT } from "@/lib/search/constants";
import { calculateMaxPage } from "@/lib/search/pagination";
import { parseSearchParams } from "@/lib/search/query";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { q, page } = parseSearchParams(await searchParams);
  const initialQuery = q ?? "";

  const content = q === null ? null : await renderSearchContent({ q, page });

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold">{APP_NAME}</h1>
      {/* key: 戻る・進むや同じページ内の遷移で、入力欄が古い値のまま残るのを防ぐ */}
      <SearchForm key={initialQuery} initialQuery={initialQuery} />
      {content}
    </main>
  );
}

// 範囲外の判定は 2 段で行う。
// 前段: GitHub は 1,000 件より先を 422 で拒否し、呼ぶだけでレート制限も消費するため、
//       取得可能な最大ページ超なら API を呼ばずに判定する。
// 後段: 実際の総件数は取得するまで分からないため、取得後に最終ページ超かを判定する。
// 0010 で取得を <Suspense> に移すときは、この判定も一緒に移すこと。
async function renderSearchContent({ q, page }: { q: string; page: number }) {
  if (page > calculateMaxPage(SEARCH_RESULT_LIMIT)) {
    return <OutOfRangeNotice q={q} target={{ kind: "first" }} />;
  }

  // GitHubApiError は握りつぶさずそのまま投げる。専用のエラー表示は 0010 で作る。
  const result = await searchRepositories({
    q,
    page,
    perPage: SEARCH_PER_PAGE,
  });
  const maxPage = calculateMaxPage(result.totalCount);

  // 総件数 0 のときは page に関わらず範囲外にせず、0 件として表示する
  if (result.totalCount >= 1 && page > maxPage) {
    return <OutOfRangeNotice q={q} target={{ kind: "last", page: maxPage }} />;
  }

  return (
    <>
      <SearchResults totalCount={result.totalCount} items={result.items} />
      <Pagination q={q} currentPage={page} maxPage={maxPage} />
    </>
  );
}
