import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">
        リポジトリが見つかりませんでした
      </h1>
      <p>URL を確認するか、トップから検索し直してください。</p>
      <Link href="/" className="underline">
        トップへ戻る
      </Link>
    </main>
  );
}
