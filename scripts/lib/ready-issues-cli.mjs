// @ts-check
import { parseArgs } from "node:util";
import {
  classifyIssues,
  collectSpecDependencies,
} from "./ready-issues-core.mjs";
import {
  formatClassification,
  sanitizeForTerminal,
} from "./ready-issues-format.mjs";
import {
  fieldListArgs,
  isMissingScopes,
  issueListArgs,
  itemListArgs,
  parseFieldList,
  parseIssueList,
  parseItemList,
  parseRepoView,
  repoViewArgs,
} from "./ready-issues-gh.mjs";
import {
  findStatusField,
  formatPlan,
  planProjectUpdates,
} from "./ready-issues-project.mjs";

/**
 * @typedef {{ stdout: string }} GhOutput
 * @typedef {{
 *   argv: string[];
 *   runGh: (args: string[]) => Promise<GhOutput>;
 *   readSpecFiles: () => Promise<{ name: string; text: string }[]>;
 *   out: (line: string) => void;
 *   err: (line: string) => void;
 * }} ReadyIssuesDeps
 * @typedef {{ assumeClosed: number[]; project: number | null; owner: string | null; apply: boolean }} CliOptions
 */

const ISSUE_LIMIT = 1000;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const OWNER_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const AUTH_GUIDE =
  "権限が不足しています。gh auth refresh -s project をご自身のターミナルで実行してください";
const USAGE = [
  "使い方: node scripts/ready-issues.mjs [--assume-closed <番号>...] [--project <番号> [--owner <所有者>] [--apply]]",
  "  --assume-closed  指定した Issue を完了とみなして判定する（複数可。--apply とは併用できません）",
  "  --project        Project の番号。指定すると Status の更新予定を表示する",
  "  --owner          Project の所有者（省略時はリポジトリの所有者）",
  "  --apply          Status を Ready に更新する（--project が必要）",
].join("\n");

/**
 * @param {string} value
 * @returns {number | null}
 */
function toIssueNumber(value) {
  const digits = value.startsWith("#") ? value.slice(1) : value;
  return POSITIVE_INTEGER.test(digits) ? Number(digits) : null;
}

/**
 * @param {string[]} argv
 * @returns {{ ok: true; options: CliOptions } | { ok: false }}
 */
function parseCliArgs(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        "assume-closed": { type: "string", multiple: true },
        project: { type: "string" },
        owner: { type: "string" },
        apply: { type: "boolean" },
      },
      strict: true,
      allowPositionals: true,
    });
  } catch {
    return { ok: false };
  }
  const { values, positionals } = parsed;
  const assumeValues = values["assume-closed"] ?? [];
  if (assumeValues.length === 0 && positionals.length > 0) return { ok: false };

  const assumeClosed = [];
  for (const value of [...assumeValues, ...positionals]) {
    const number = toIssueNumber(value);
    if (number === null) return { ok: false };
    assumeClosed.push(number);
  }

  const projectValue = values.project;
  if (projectValue !== undefined && !POSITIVE_INTEGER.test(projectValue)) {
    return { ok: false };
  }
  const owner = values.owner ?? null;
  if (owner !== null && owner !== "@me" && !OWNER_NAME.test(owner)) {
    return { ok: false };
  }

  const apply = values.apply === true;
  if (apply && (projectValue === undefined || assumeClosed.length > 0)) {
    return { ok: false };
  }

  return {
    ok: true,
    options: {
      assumeClosed,
      project: projectValue === undefined ? null : Number(projectValue),
      owner,
      apply,
    },
  };
}

/**
 * gh の stderr（無ければ message）を、端末に出せる形にする。
 * @param {unknown} error
 * @returns {string}
 */
function describeFailure(error) {
  const stderr =
    error instanceof Error && "stderr" in error ? error.stderr : undefined;
  if (typeof stderr === "string") return sanitizeForTerminal(stderr.trim());
  return sanitizeForTerminal(
    error instanceof Error ? error.message : String(error),
  );
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isScopeFailure(error) {
  const stderr =
    error instanceof Error && "stderr" in error ? error.stderr : undefined;
  return typeof stderr === "string" && isMissingScopes(stderr);
}

/**
 * @param {ReadyIssuesDeps} deps
 * @returns {Promise<number>} 終了コード
 */
export async function runReadyIssues({ argv, runGh, readSpecFiles, out, err }) {
  const parsed = parseCliArgs(argv);
  if (!parsed.ok) {
    err(USAGE);
    return 1;
  }
  const { options } = parsed;

  /**
   * gh を呼ぶ。権限不足は案内、それ以外は onFailure のメッセージと stderr を表示して null を返す。
   * @param {string[]} args
   * @param {string} failureMessage
   * @returns {Promise<string | null>}
   */
  async function callGh(args, failureMessage) {
    try {
      return (await runGh(args)).stdout;
    } catch (error) {
      if (isScopeFailure(error)) {
        err(AUTH_GUIDE);
      } else {
        err(failureMessage);
        err(describeFailure(error));
      }
      return null;
    }
  }

  /**
   * @template T
   * @param {() => T} parse
   * @returns {T | null}
   */
  function tryParse(parse) {
    try {
      return parse();
    } catch (error) {
      err(sanitizeForTerminal(error instanceof Error ? error.message : ""));
      return null;
    }
  }

  const issueStdout = await callGh(
    issueListArgs(),
    "Issue の一覧を取得できませんでした",
  );
  if (issueStdout === null) return 1;
  const issues = tryParse(() => parseIssueList(issueStdout));
  if (issues === null) return 1;

  const specDependencies = collectSpecDependencies(await readSpecFiles());
  const classification = classifyIssues({
    issues,
    specDependencies,
    assumeClosed: options.assumeClosed,
  });
  for (const line of formatClassification(classification)) out(line);
  if (issues.length >= ISSUE_LIMIT) {
    out(
      "警告: Issue の取得が上限（1,000件）に達しました。一部の Issue が判定に含まれていない可能性があります",
    );
  }

  if (options.project === null) return 0;

  const repoStdout = await callGh(
    repoViewArgs(),
    "リポジトリの情報を取得できませんでした",
  );
  if (repoStdout === null) return 1;
  const repo = tryParse(() => parseRepoView(repoStdout));
  if (repo === null) return 1;
  const owner = options.owner ?? repo.nameWithOwner.split("/")[0];

  const fieldStdout = await callGh(
    fieldListArgs(options.project, owner),
    `Project #${options.project}（所有者: ${sanitizeForTerminal(owner)}）が見つかりませんでした`,
  );
  if (fieldStdout === null) return 1;
  const fields = tryParse(() => parseFieldList(fieldStdout));
  if (fields === null) return 1;
  const statusField = findStatusField(fields);
  if (!statusField.ok) {
    err(statusField.message);
    return 1;
  }

  const itemStdout = await callGh(
    itemListArgs(options.project, owner),
    "Project の項目を取得できませんでした",
  );
  if (itemStdout === null) return 1;
  const items = tryParse(() => parseItemList(itemStdout));
  if (items === null) return 1;

  const plan = planProjectUpdates({
    candidates: classification.ready,
    items,
    repository: repo.nameWithOwner,
  });
  out("== Project の更新計画 ==");
  for (const line of formatPlan(plan)) out(line);
  return 0;
}
