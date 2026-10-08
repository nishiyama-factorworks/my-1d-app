"use client";

type Props = {
  error: Error & { digest?: string };
  retry: () => void;
};

// 内部情報の漏えいを避けるため error.message と digest は表示しない。
export default function RouteError({ retry }: Props) {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">エラーが発生しました</h1>
      <div role="alert" className="py-8 text-center">
        <p>予期しないエラーが発生しました</p>
        <button type="button" onClick={() => retry()}>
          再試行
        </button>
      </div>
    </main>
  );
}
