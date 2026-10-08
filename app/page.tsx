import {
  SearchContent,
  renderSearchContent,
} from "@/features/search/components/search-content";
import { SearchForm } from "@/features/search/components/search-form";
import { LoadingStatus } from "@/features/state-views/components/loading-status";
import { APP_NAME } from "@/lib/app-config";
import { buildSearchPath } from "@/lib/search/paths";
import { parseSearchParams } from "@/lib/search/query";
import type { Metadata } from "next";
import { Suspense } from "react";

// ルートレイアウトの title.template は同じセグメントの page.tsx には適用されないため、
// absolute で完成形のタイトルを返す。
export async function generateMetadata({
  searchParams,
}: PageProps<"/">): Promise<Metadata> {
  const { q } = parseSearchParams(await searchParams);
  if (q === null) {
    return { title: { absolute: APP_NAME } };
  }
  return { title: { absolute: `${q} の検索結果 | ${APP_NAME}` } };
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const { q, page } = parseSearchParams(await searchParams);
  const initialQuery = q ?? "";

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold">{APP_NAME}</h1>
      {/* key: 戻る・進むや同じページ内の遷移で、入力欄が古い値のまま残るのを防ぐ */}
      <SearchForm key={initialQuery} initialQuery={initialQuery} />
      {q !== null && (
        // key: q・page が変わる遷移でも fallback（読み込み中）を出し、古い一覧を残さない。
        // 取得は await せず Promise のまま渡し、<Suspense> の内側で待たせる。
        <Suspense key={buildSearchPath(q, page)} fallback={<LoadingStatus />}>
          <SearchContent content={renderSearchContent({ q, page })} />
        </Suspense>
      )}
    </main>
  );
}
