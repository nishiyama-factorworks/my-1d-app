// URLSearchParams を使う理由:
// - GET フォーム送信と空白の表記（+）が一致する
// - 値の符号化漏れが起きない
// - キーの順序が q -> page に固定される
// 先頭は固定の "/?" で、値は必ず符号化してから連結するため、
// "//" で始まる外部 URL にはならない。page が 1 でも省略しない。
export function buildSearchPath(q: string, page: number): string {
  return (
    "/?" +
    new URLSearchParams([
      ["q", q],
      ["page", String(page)],
    ]).toString()
  );
}
