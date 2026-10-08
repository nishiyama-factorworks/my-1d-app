import type { GitHubErrorKind } from "@/lib/github/types";
import { formatTimeInTokyo } from "../lib/format-time-in-tokyo";
import { RetryButton } from "./retry-button";

type Props = {
  kind: GitHubErrorKind;
  resetAt?: Date;
};

// 英語の固定メッセージやステータス番号は受け取らず、種別から日本語の文言だけを決める。
function describeError({ kind, resetAt }: Props): {
  title: string;
  detail?: string;
} {
  switch (kind) {
    case "RATE_LIMIT":
      return {
        title: "GitHub API の利用制限に達しました",
        detail: resetAt
          ? `${formatTimeInTokyo(resetAt)}（日本時間）に解除されます。`
          : "しばらく時間をおいてから再試行してください。",
      };
    case "NETWORK":
      return {
        title: "GitHub に接続できませんでした",
        detail: "通信環境を確認してから再試行してください。",
      };
    default:
      return { title: "データの取得中にエラーが発生しました" };
  }
}

export function ApiErrorView(props: Props) {
  const { title, detail } = describeError(props);
  return (
    <div role="alert" className="py-8 text-center">
      <p>{title}</p>
      {detail && <p>{detail}</p>}
      <RetryButton />
    </div>
  );
}
