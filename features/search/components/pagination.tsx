import Link from "next/link";
import { buildSearchPath } from "@/lib/search/paths";
import { buildPageItems } from "../lib/page-items";

type PaginationProps = {
  q: string;
  currentPage: number;
  maxPage: number;
};

const ITEM_CLASS = "inline-block min-w-8 rounded border px-2 py-1 text-center";
const CURRENT_CLASS = `${ITEM_CLASS} bg-foreground text-background`;
const DISABLED_CLASS = `${ITEM_CLASS} cursor-not-allowed border-transparent text-gray-400`;

// 押せない状態は href を持たない span で表し、スクリーンリーダーには無効なリンクとして伝える。
function DisabledLink({ label }: { label: string }) {
  return (
    <span role="link" aria-disabled="true" className={DISABLED_CLASS}>
      {label}
    </span>
  );
}

export function Pagination({ q, currentPage, maxPage }: PaginationProps) {
  if (maxPage <= 1) {
    return null;
  }

  return (
    <nav aria-label="ページネーション">
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          {currentPage > 1 ? (
            <Link
              href={buildSearchPath(q, currentPage - 1)}
              className={ITEM_CLASS}
            >
              前へ
            </Link>
          ) : (
            <DisabledLink label="前へ" />
          )}
        </li>
        {buildPageItems(currentPage, maxPage).map((item) =>
          typeof item === "number" ? (
            <li key={item}>
              <Link
                href={buildSearchPath(q, item)}
                aria-current={item === currentPage ? "page" : undefined}
                className={item === currentPage ? CURRENT_CLASS : ITEM_CLASS}
              >
                {item}
              </Link>
            </li>
          ) : (
            <li key={item}>
              <span className="px-2">…</span>
            </li>
          ),
        )}
        <li>
          {currentPage < maxPage ? (
            <Link
              href={buildSearchPath(q, currentPage + 1)}
              className={ITEM_CLASS}
            >
              次へ
            </Link>
          ) : (
            <DisabledLink label="次へ" />
          )}
        </li>
      </ul>
    </nav>
  );
}
