// @ts-check

/**
 * @typedef {import("./ready-issues-core.mjs").Classification} Classification
 */

/**
 * 端末に表示する外部由来の文字列から制御文字を取り除く。
 * @param {string} text
 * @returns {string}
 */
export function sanitizeForTerminal(text) {
  // Issue のタイトルは他者が書いた入力。ESC などが残ると端末に制御列として解釈されるため除去する。
  return text.replace(/\p{Cc}/gu, "");
}

/**
 * Issue のタイトルから先頭の「[種別] NNNN 」を除き、サニタイズする。
 * @param {string} title
 * @returns {string}
 */
export function displayTitle(title) {
  return sanitizeForTerminal(title.replace(/^\[[^\]]*\]\s*\d{4}\s*/u, ""));
}

/**
 * @param {import("./ready-issues-core.mjs").Blocker} blocker
 * @returns {string}
 */
function formatBlocker(blocker) {
  const spec = sanitizeForTerminal(blocker.specNumber);
  if (blocker.reason === "no-issue") return `${spec} Issue なし`;
  if (blocker.reason === "duplicate") return `${spec} Issue が複数`;
  return spec;
}

/**
 * @param {string} heading
 * @param {string[]} rows
 * @returns {string[]}
 */
function section(heading, rows) {
  return [
    `== ${heading}（${rows.length}件）==`,
    ...(rows.length > 0 ? rows : ["（なし）"]),
  ];
}

/**
 * 判定結果を表示用の行の配列にする。
 * @param {Classification} classification
 * @returns {string[]}
 */
export function formatClassification(classification) {
  const readyRows = classification.ready.map((entry) => {
    const deps = entry.dependencies
      .map((d) => `${sanitizeForTerminal(d)} ✓`)
      .join(", ");
    const assumed =
      entry.assumed.length > 0
        ? `仮定: ${entry.assumed.map((n) => `#${n}`).join(", ")}`
        : "";
    return `#${entry.issue.number} ${sanitizeForTerminal(entry.specNumber)} ${displayTitle(entry.issue.title)}（依存: ${deps}）${assumed}`;
  });
  const waitingRows = classification.waiting.map(
    (entry) =>
      `#${entry.issue.number} ${sanitizeForTerminal(entry.specNumber)} ${displayTitle(entry.issue.title)}（待ち: ${entry.blockers.map(formatBlocker).join(", ")}）`,
  );

  return [
    ...section("Ready にできる Issue", readyRows),
    ...section("待ち", waitingRows),
    ...classification.warnings.map(sanitizeForTerminal),
  ];
}
