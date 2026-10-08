import { SEARCH_KEYWORD_MAX_LENGTH } from "./constants";
import { buildSearchPath } from "./paths";
import { parseSearchParams, type SearchParamsInput } from "./query";

// 受け取った文字列を連結せず、検証・正規化済みの値だけで組み立てる（オープンリダイレクト対策）。
// 長さは正規化後に数える（lib/github/client.ts と同じ UTF-16 の数え方）。
// 検索として成立しない条件は、不正な検索に戻さずトップ "/" に落とす。
export function buildBackPath(params: SearchParamsInput): string {
  const { q, page } = parseSearchParams(params);
  if (q === null || q.length > SEARCH_KEYWORD_MAX_LENGTH) return "/";
  return buildSearchPath(q, page);
}
