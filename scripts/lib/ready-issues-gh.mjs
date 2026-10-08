// @ts-check
// gh の呼び出しの引数の組み立てと、出力（JSON）の検証。I/O は行わない純粋関数だけを置く。
// gh project の JSON の形は実機未確認（計画 0014 の 1.2 (f)）。想定に基づく。

/**
 * @typedef {{ id: string; name: string; options?: { id: string; name: string }[] }} ProjectField
 * @typedef {{ id: string; status: string | null; content: { type: string; number: number | null; repository: string | null } }} ProjectItem
 * @typedef {{ number: number; title: string; state: "OPEN" | "CLOSED"; url: string }} IssueSummary
 */

const PARSE_ERROR = "gh の出力を解釈できませんでした";
const NAME_WITH_OWNER = /^[^/\s]+\/[^/\s]+$/;
const MISSING_SCOPES = /missing required scopes/i;

/** @returns {string[]} */
export function issueListArgs() {
  return [
    "issue",
    "list",
    "--state",
    "all",
    "--json",
    "number,title,state,url",
    "--limit",
    "1000",
  ];
}

/** @returns {string[]} */
export function repoViewArgs() {
  return ["repo", "view", "--json", "nameWithOwner"];
}

/**
 * @param {number} project
 * @param {string} owner
 * @returns {string[]}
 */
export function fieldListArgs(project, owner) {
  return [
    "project",
    "field-list",
    String(project),
    "--owner",
    owner,
    "--format",
    "json",
  ];
}

/**
 * @param {number} project
 * @param {string} owner
 * @returns {string[]}
 */
export function itemListArgs(project, owner) {
  return [
    "project",
    "item-list",
    String(project),
    "--owner",
    owner,
    "--format",
    "json",
    "--limit",
    "1000",
  ];
}

/**
 * @param {number} project
 * @param {string} owner
 * @param {string} issueUrl
 * @returns {string[]}
 */
export function itemEditArgs(project, owner, issueUrl) {
  return [
    "project",
    "item-edit",
    String(project),
    "--owner",
    owner,
    "--url",
    issueUrl,
    "--field",
    "Status",
    "--value",
    "Ready",
  ];
}

/**
 * 他者の入力をメッセージに埋め込まないため、不正な項目の説明だけを載せる。
 * @param {string} detail
 * @returns {Error}
 */
function parseError(detail) {
  return new Error(`${PARSE_ERROR}（${detail}）`);
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {string} stdout
 * @returns {unknown}
 */
function parseJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw parseError("JSON として不正");
  }
}

/**
 * @param {unknown} value
 * @param {string} key
 * @returns {unknown[]}
 */
function arrayAt(value, key) {
  if (!isRecord(value) || !Array.isArray(value[key])) {
    throw parseError(`${key} が配列でない`);
  }
  return value[key];
}

/**
 * @param {string} stdout
 * @returns {IssueSummary[]}
 */
export function parseIssueList(stdout) {
  const data = parseJson(stdout);
  if (!Array.isArray(data)) throw parseError("Issue の一覧が配列でない");
  return data.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.number !== "number" ||
      typeof item.title !== "string" ||
      (item.state !== "OPEN" && item.state !== "CLOSED") ||
      typeof item.url !== "string"
    ) {
      throw parseError("Issue の形が不正");
    }
    return {
      number: item.number,
      title: item.title,
      state: item.state,
      url: item.url,
    };
  });
}

/**
 * @param {string} stdout
 * @returns {{ nameWithOwner: string }}
 */
export function parseRepoView(stdout) {
  const data = parseJson(stdout);
  if (
    !isRecord(data) ||
    typeof data.nameWithOwner !== "string" ||
    !NAME_WITH_OWNER.test(data.nameWithOwner)
  ) {
    throw parseError("nameWithOwner が不正");
  }
  return { nameWithOwner: data.nameWithOwner };
}

/**
 * @param {unknown} option
 * @returns {{ id: string; name: string }}
 */
function toOption(option) {
  if (
    !isRecord(option) ||
    typeof option.id !== "string" ||
    typeof option.name !== "string"
  ) {
    throw parseError("options の形が不正");
  }
  return { id: option.id, name: option.name };
}

/**
 * @param {string} stdout
 * @returns {ProjectField[]}
 */
export function parseFieldList(stdout) {
  return arrayAt(parseJson(stdout), "fields").map((field) => {
    if (
      !isRecord(field) ||
      typeof field.id !== "string" ||
      typeof field.name !== "string"
    ) {
      throw parseError("fields の形が不正");
    }
    if (field.options === undefined) {
      return { id: field.id, name: field.name };
    }
    if (!Array.isArray(field.options)) {
      throw parseError("options が配列でない");
    }
    return {
      id: field.id,
      name: field.name,
      options: field.options.map(toOption),
    };
  });
}

/**
 * ドラフト項目などは content を持たないため、空の content にして落とさない。
 * @param {unknown} content
 * @returns {ProjectItem["content"]}
 */
function toContent(content) {
  if (!isRecord(content)) return { type: "", number: null, repository: null };
  return {
    type: typeof content.type === "string" ? content.type : "",
    number: typeof content.number === "number" ? content.number : null,
    repository:
      typeof content.repository === "string" ? content.repository : null,
  };
}

/**
 * @param {string} stdout
 * @returns {ProjectItem[]}
 */
export function parseItemList(stdout) {
  return arrayAt(parseJson(stdout), "items").map((item) => {
    if (!isRecord(item) || typeof item.id !== "string") {
      throw parseError("items の形が不正");
    }
    return {
      id: item.id,
      status: typeof item.status === "string" ? item.status : null,
      content: toContent(item.content),
    };
  });
}

/**
 * @param {string} stderr
 * @returns {boolean}
 */
export function isMissingScopes(stderr) {
  return MISSING_SCOPES.test(stderr);
}
