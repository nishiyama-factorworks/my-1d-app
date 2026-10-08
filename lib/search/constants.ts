export const SEARCH_PER_PAGE = 30;
export const SEARCH_RESULT_LIMIT = 1000;
// GitHub のドキュメントが定める検索クエリの上限文字数に合わせる。
// lib/github/client.ts の検証もこの定数を使い、値を二重管理しない。
export const SEARCH_KEYWORD_MAX_LENGTH = 256;
