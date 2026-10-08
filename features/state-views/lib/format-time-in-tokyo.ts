// 実行環境のタイムゾーンに依存させないため timeZone を明示する。
// hourCycle: "h23" は深夜 0 時が "24:00" になるのを防ぐ。
const TOKYO_TIME_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatTimeInTokyo(date: Date): string {
  return TOKYO_TIME_FORMAT.format(date);
}
