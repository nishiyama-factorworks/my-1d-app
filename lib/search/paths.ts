// パスの区切り（セグメント）に値を入れるため、クエリ用の URLSearchParams ではなく
// encodeURIComponent を使う。
// - URLSearchParams は空白を "+" にするが、パス中の "+" は空白ではなく文字どおりの "+" になる
// - "/" "?" "#" "%" を符号化するので、値がセグメントの外へはみ出さない
export function buildRepoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

// URLSearchParams を使う理由:
// - GET フォーム送信と空白の表記（+）が一致する
// - 値の符号化漏れが起きない
// - キーの順序が q -> page に固定される
// 行リンクと戻り先でクエリの表記を揃えるため、1 か所で作る。page が 1 でも省略しない。
function searchQueryString(q: string, page: number): string {
  return new URLSearchParams([
    ["q", q],
    ["page", String(page)],
  ]).toString();
}

export function buildRepoPathWithSearch(
  owner: string,
  repo: string,
  search: { q: string; page: number },
): string {
  return `${buildRepoPath(owner, repo)}?${searchQueryString(search.q, search.page)}`;
}

// 先頭は固定の "/?" で、値は必ず符号化してから連結するため、
// "//" で始まる外部 URL にはならない。
export function buildSearchPath(q: string, page: number): string {
  return `/?${searchQueryString(q, page)}`;
}
