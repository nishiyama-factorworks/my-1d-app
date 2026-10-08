// @ts-check

/**
 * @typedef {{ name: string; text: string }} SpecFile
 * @typedef {{ number: number; title: string; state: "OPEN" | "CLOSED"; url?: string }} IssueSummary
 * @typedef {{ specNumber: string; issueNumbers: number[] }} Duplicate
 * @typedef {{ issue: IssueSummary; specNumber: string; dependencies: string[]; assumed: number[] }} ReadyEntry
 * @typedef {{ specNumber: string; reason: "open" | "no-issue" | "duplicate"; issueNumber?: number }} Blocker
 * @typedef {{ issue: IssueSummary; specNumber: string; blockers: Blocker[] }} WaitingEntry
 * @typedef {{ ready: ReadyEntry[]; waiting: WaitingEntry[]; warnings: string[] }} Classification
 */

// 正規表現は入れ子の量指定子を使わない単純な形に保つ（ReDoS を避けるため）。
// 括弧は入れ子を想定せず、閉じ括弧以外の連続だけを対象にする。
const PAREN_PATTERN = /（[^）]*）|\([^)]*\)/g;
const NUMBER_OR_RANGE_PATTERN = /(\d{4})(?:〜(\d{4}))?/g;

/**
 * 4 桁の番号の範囲を、ゼロ埋め 4 桁の文字列の連続に展開する。
 * @param {string} from
 * @param {string} to
 * @returns {string[]}
 */
function expandRange(from, to) {
  const result = [];
  for (let n = Number(from); n <= Number(to); n++) {
    result.push(String(n).padStart(4, "0"));
  }
  return result;
}

/**
 * 仕様の本文から、最初の「- 関連:」行にある依存の仕様番号を返す。
 * @param {string} specText
 * @returns {string[]}
 */
export function parseDependencies(specText) {
  const relatedLine = specText
    .split(/\r?\n/)
    .find((line) => line.startsWith("- 関連:"));
  if (relatedLine === undefined) return [];

  const marker = "依存:";
  const markerIndex = relatedLine.indexOf(marker);
  if (markerIndex === -1) return [];

  // 依存より前の番号（親仕様のファイル名など）と括弧内の補足の番号は拾わない
  const dependencyPart = relatedLine
    .slice(markerIndex + marker.length)
    .replace(PAREN_PATTERN, "");

  /** @type {string[]} */
  const numbers = [];
  for (const match of dependencyPart.matchAll(NUMBER_OR_RANGE_PATTERN)) {
    const [, from, to] = match;
    numbers.push(...(to === undefined ? [from] : expandRange(from, to)));
  }
  return [...new Set(numbers)];
}

/**
 * Issue のタイトルから仕様番号（4桁）を取り出す。無ければ null。
 * @param {string} title
 * @returns {string | null}
 */
export function extractSpecNumber(title) {
  const match = /^\[[^\]]+\]\s*(\d{4})\s/.exec(title);
  return match === null ? null : match[1];
}

/**
 * 仕様ファイルの一覧から {仕様番号 -> 依存の仕様番号の配列} を作る。
 * ファイルの読み取りは呼び出し側の責務で、ここでは行わない。
 * @param {SpecFile[]} files
 * @returns {Map<string, string[]>}
 */
export function collectSpecDependencies(files) {
  /** @type {Map<string, string[]>} */
  const result = new Map();
  for (const { name, text } of files) {
    if (!/^\d{4}-.+\.md$/.test(name)) continue;
    result.set(name.slice(0, 4), parseDependencies(text));
  }
  return result;
}

/**
 * Issue を仕様番号で対応づける。同じ番号が複数あるものは bySpec に入れず duplicates に入れる。
 * @param {IssueSummary[]} issues
 * @returns {{ bySpec: Map<string, IssueSummary>; duplicates: Duplicate[] }}
 */
export function indexIssuesBySpec(issues) {
  /** @type {Map<string, IssueSummary[]>} */
  const grouped = new Map();
  for (const issue of issues) {
    const specNumber = extractSpecNumber(issue.title);
    if (specNumber === null) continue;
    grouped.set(specNumber, [...(grouped.get(specNumber) ?? []), issue]);
  }

  /** @type {Map<string, IssueSummary>} */
  const bySpec = new Map();
  /** @type {Duplicate[]} */
  const duplicates = [];
  for (const [specNumber, group] of grouped) {
    if (group.length === 1) {
      bySpec.set(specNumber, group[0]);
    } else {
      duplicates.push({
        specNumber,
        issueNumbers: group.map((i) => i.number).sort((a, b) => a - b),
      });
    }
  }
  return { bySpec, duplicates };
}

/**
 * 依存がすべて完了した OPEN の Issue（ready）と、未完了の依存がある Issue（waiting）に分ける。
 * @param {{ issues: IssueSummary[]; specDependencies: Map<string, string[]>; assumeClosed: number[] }} input
 * @returns {Classification}
 */
export function classifyIssues({ issues, specDependencies, assumeClosed }) {
  const { bySpec, duplicates } = indexIssuesBySpec(issues);
  const duplicateSpecs = new Set(duplicates.map((d) => d.specNumber));
  const assumed = new Set(assumeClosed);

  /** @type {string[]} */
  const duplicateWarnings = duplicates.map(
    (d) =>
      `警告: 仕様番号 ${d.specNumber} の Issue が複数あります（${d.issueNumbers.map((n) => `#${n}`).join(", ")}）。この番号は未解決として扱います`,
  );
  /** @type {string[]} */
  const missingSpecWarnings = [];
  /** @type {ReadyEntry[]} */
  const ready = [];
  /** @type {WaitingEntry[]} */
  const waiting = [];

  const sorted = [...issues].sort((a, b) => a.number - b.number);
  for (const issue of sorted) {
    if (issue.state !== "OPEN" || assumed.has(issue.number)) continue;
    const specNumber = extractSpecNumber(issue.title);
    if (specNumber === null || duplicateSpecs.has(specNumber)) continue;

    const dependencies = specDependencies.get(specNumber);
    if (dependencies === undefined) {
      missingSpecWarnings.push(
        `警告: #${issue.number}（${specNumber}）の仕様ファイルが見つかりません。判定の対象外にします`,
      );
      continue;
    }
    if (dependencies.length === 0) continue;

    /** @type {Blocker[]} */
    const blockers = [];
    /** @type {number[]} */
    const assumedDependencies = [];
    for (const dependency of dependencies) {
      if (duplicateSpecs.has(dependency)) {
        blockers.push({ specNumber: dependency, reason: "duplicate" });
        continue;
      }
      const target = bySpec.get(dependency);
      if (target === undefined) {
        blockers.push({ specNumber: dependency, reason: "no-issue" });
      } else if (target.state === "CLOSED") {
        // すでに完了している依存は、仮定の対象にしても「仮定」とは表示しない
      } else if (assumed.has(target.number)) {
        assumedDependencies.push(target.number);
      } else {
        blockers.push({
          specNumber: dependency,
          reason: "open",
          issueNumber: target.number,
        });
      }
    }

    if (blockers.length > 0) {
      waiting.push({ issue, specNumber, blockers });
    } else {
      ready.push({
        issue,
        specNumber,
        dependencies,
        assumed: assumedDependencies,
      });
    }
  }

  return {
    ready,
    waiting,
    warnings: [...duplicateWarnings, ...missingSpecWarnings],
  };
}
