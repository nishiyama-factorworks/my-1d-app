import Image from "next/image";
import Link from "next/link";
import type { RepoDetail } from "@/lib/github/types";
import { formatLanguage, formatNumber } from "@/lib/search/format";

export function RepoDetailView({ repo }: { repo: RepoDetail }) {
  const items: [string, string][] = [
    ["オーナー", repo.ownerLogin],
    ["言語", formatLanguage(repo.language)],
    ["Star数", formatNumber(repo.stargazersCount)],
    ["Watcher数", formatNumber(repo.watchersCount)],
    ["Fork数", formatNumber(repo.forksCount)],
    ["Issue数", formatNumber(repo.openIssuesCount)],
  ];

  return (
    <article className="flex flex-col gap-4">
      {/* 長い owner/repo が狭い画面ではみ出さないよう break-all を付ける */}
      <h1 className="text-2xl font-bold break-all">{repo.fullName}</h1>
      <Image
        src={repo.ownerAvatarUrl}
        alt={repo.ownerLogin}
        width={80}
        height={80}
        className="rounded-full"
      />
      <dl className="flex flex-col gap-2">
        {items.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="font-bold">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex gap-4">
        <a href={repo.htmlUrl} rel="noopener noreferrer" className="underline">
          GitHub で開く
        </a>
        <Link href="/" className="underline">
          トップへ戻る
        </Link>
      </div>
    </article>
  );
}
