import { SEARCH_PER_PAGE, SEARCH_RESULT_LIMIT } from "./constants";

// GitHub の検索 API は上位 1000 件までしか返さないため、総件数が超えていても 1000 件で頭打ちにする。
export function calculateMaxPage(totalCount: number): number {
  return Math.ceil(Math.min(totalCount, SEARCH_RESULT_LIMIT) / SEARCH_PER_PAGE);
}
