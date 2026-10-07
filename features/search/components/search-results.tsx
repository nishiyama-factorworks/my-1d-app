import Image from "next/image";
import Link from "next/link";
import type { RepoSummary } from "@/lib/github/types";
import { SEARCH_RESULT_LIMIT } from "@/lib/search/constants";
import { formatNumber } from "@/lib/search/format";
import { repoPathFromFullName } from "../lib/repo-path";

export function SearchResults({
  totalCount,
  items,
}: {
  totalCount: number;
  items: readonly RepoSummary[];
}) {
  return (
    <section className="flex flex-col gap-4">
      <p>{`総ヒット件数: ${formatNumber(totalCount)} 件`}</p>
      {totalCount > SEARCH_RESULT_LIMIT && <p>上位1,000件まで表示します</p>}
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.fullName} className="flex items-center gap-3">
            <Image
              src={item.ownerAvatarUrl}
              alt={item.ownerLogin}
              width={40}
              height={40}
              className="rounded-full"
            />
            <Link
              href={repoPathFromFullName(item.fullName)}
              className="break-all underline"
            >
              {item.fullName}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
