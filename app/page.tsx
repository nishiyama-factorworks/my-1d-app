import { SearchForm } from "@/features/search/components/search-form";
import { SearchResults } from "@/features/search/components/search-results";
import { APP_NAME } from "@/lib/app-config";
import { searchRepositories } from "@/lib/github";
import { SEARCH_PER_PAGE } from "@/lib/search/constants";
import { parseSearchParams } from "@/lib/search/query";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { q, page } = parseSearchParams(await searchParams);
  const initialQuery = q ?? "";

  // GitHubApiError は握りつぶさずそのまま投げる。専用のエラー表示は 0010 で作る。
  const result =
    q === null
      ? null
      : await searchRepositories({ q, page, perPage: SEARCH_PER_PAGE });

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold">{APP_NAME}</h1>
      {/* key: 戻る・進むや同じページ内の遷移で、入力欄が古い値のまま残るのを防ぐ */}
      <SearchForm key={initialQuery} initialQuery={initialQuery} />
      {result && (
        <SearchResults totalCount={result.totalCount} items={result.items} />
      )}
    </main>
  );
}
