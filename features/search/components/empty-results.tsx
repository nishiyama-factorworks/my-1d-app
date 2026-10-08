type EmptyResultsProps = {
  q: string;
};

export function EmptyResults({ q }: EmptyResultsProps) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-8">
      <p className="break-all">{`「${q}」に一致するリポジトリは見つかりませんでした。`}</p>
      <p>別のキーワードで検索してください。</p>
    </div>
  );
}
