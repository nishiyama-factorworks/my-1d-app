export type PageItem = number | "ellipsis-start" | "ellipsis-end";

// 現在ページの前後に表示するページ数。
const PAGE_WINDOW = 2;

// 先頭・末尾は常に表示し、現在ページの前後 PAGE_WINDOW ページを窓とする。
// 窓との間が 1 ページだけ抜ける場合は「…」より番号の方が幅を取らず分かりやすいので番号を出し、
// 2 ページ以上抜ける場合のみ「…」にする。
export function buildPageItems(
  currentPage: number,
  maxPage: number,
): readonly PageItem[] {
  const windowStart = Math.max(1, currentPage - PAGE_WINDOW);
  const windowEnd = Math.min(maxPage, currentPage + PAGE_WINDOW);

  const pages = new Set<number>([1, maxPage]);
  for (let page = windowStart; page <= windowEnd; page++) {
    pages.add(page);
  }
  const sorted = [...pages].sort((a, b) => a - b);

  const items: PageItem[] = [];
  sorted.forEach((page, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined) {
      const gap = page - previous;
      if (gap === 2) {
        items.push(previous + 1);
      } else if (gap > 2) {
        items.push(page <= windowStart ? "ellipsis-start" : "ellipsis-end");
      }
    }
    items.push(page);
  });
  return items;
}
