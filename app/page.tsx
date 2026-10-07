import { SearchForm } from "@/features/search/components/search-form";
import { APP_NAME } from "@/lib/app-config";
import { parseSearchParams } from "@/lib/search/query";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { q } = parseSearchParams(await searchParams);
  const initialQuery = q ?? "";

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold">{APP_NAME}</h1>
      {/* key: 戻る・進むや同じページ内の遷移で、入力欄が古い値のまま残るのを防ぐ */}
      <SearchForm key={initialQuery} initialQuery={initialQuery} />
    </main>
  );
}
