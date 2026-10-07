import Link from "next/link";
import { buildSearchPath } from "@/lib/search/paths";

type OutOfRangeTarget = { kind: "first" } | { kind: "last"; page: number };

type OutOfRangeNoticeProps = {
  q: string;
  target: OutOfRangeTarget;
};

export function OutOfRangeNotice({ q, target }: OutOfRangeNoticeProps) {
  const page = target.kind === "first" ? 1 : target.page;
  const label =
    target.kind === "first"
      ? "先頭のページへ"
      : `最終ページ（${target.page}ページ目）へ`;

  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <p>指定されたページは存在しません</p>
      <Link href={buildSearchPath(q, page)} className="underline">
        {label}
      </Link>
    </div>
  );
}
