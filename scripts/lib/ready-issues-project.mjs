// @ts-check
import { sanitizeForTerminal } from "./ready-issues-format.mjs";

/**
 * @typedef {{ id: string; name: string; options?: { id: string; name: string }[] }} ProjectField
 * @typedef {{ id: string; status: string | null; content: { type: string; number: number | null; repository: string | null } }} ProjectItem
 * @typedef {{ ok: true } | { ok: false; message: string }} StatusFieldResult
 * @typedef {{ issueNumber: number; specNumber: string; title: string; action: "update" | "keep" | "absent"; issueUrl: string; currentStatus: string | null }} PlanEntry
 */

/**
 * @param {string[]} names
 * @returns {string}
 */
function joinNames(names) {
  return names.map(sanitizeForTerminal).join(", ");
}

/**
 * @param {ProjectField[]} fields
 * @returns {StatusFieldResult}
 */
export function findStatusField(fields) {
  const status = fields.find((field) => field.name === "Status");
  if (!status) {
    return {
      ok: false,
      message: `Status フィールドが見つかりません（存在したフィールド: ${joinNames(fields.map((f) => f.name))}）`,
    };
  }
  const options = status.options ?? [];
  if (!options.some((option) => option.name === "Ready")) {
    return {
      ok: false,
      message: `Status の選択肢に Ready がありません（存在した選択肢: ${joinNames(options.map((o) => o.name))}）`,
    };
  }
  return { ok: true };
}

/**
 * @param {{ candidates: import("./ready-issues-core.mjs").ReadyEntry[]; items: ProjectItem[]; repository: string }} input
 * @returns {PlanEntry[]}
 */
export function planProjectUpdates({ candidates, items, repository }) {
  return candidates.map(({ issue, specNumber }) => {
    const item = items.find(
      ({ content }) =>
        content.type === "Issue" &&
        content.number === issue.number &&
        content.repository === repository,
    );
    const currentStatus = item?.status ?? null;
    /** @type {PlanEntry["action"]} */
    const action = !item
      ? "absent"
      : currentStatus === "Backlog"
        ? "update"
        : "keep";
    return {
      issueNumber: issue.number,
      specNumber,
      title: issue.title,
      action,
      issueUrl: issue.url ?? "",
      currentStatus,
    };
  });
}

/**
 * @param {PlanEntry} entry
 * @returns {string}
 */
function formatEntry(entry) {
  // Issue のタイトルは他者が書いた入力。先頭の「[種別] NNNN 」を除いて制御文字を取り除く。
  const title = sanitizeForTerminal(
    entry.title.replace(/^\[[^\]]*\]\s*\d{4}\s*/u, ""),
  );
  const head = `#${entry.issueNumber} ${entry.specNumber} ${title}`;
  const current = sanitizeForTerminal(entry.currentStatus ?? "なし");
  if (entry.action === "update") {
    return `${head}: ${current} → Ready（更新予定）`;
  }
  if (entry.action === "keep") {
    return `${head}: 変更しない（現在: ${current}）`;
  }
  return `${head}: ボードに無い`;
}

/**
 * @param {PlanEntry[]} entries
 * @returns {string[]}
 */
export function formatPlan(entries) {
  return entries.map(formatEntry);
}
