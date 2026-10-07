// @ts-check

/**
 * @typedef {{ name: string; text: string }} SpecFile
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
