// @vitest-environment node
//
// docs/architecture.md の構造を検査する（仕様 0021 の AC-1〜AC-10）。
// 対象: テンプレートの未記入の不在・冒頭の注意書き・1 節の本文・2 節の表の採用の列・3 節の図と
// features/<名前>/ の行・4 節の永続化と型・5 節の 4 項目（キャッシュ・外部入力の検証・認証・認可・エラー）。
// 限界:
// - 行ベースの簡易解析。Setext 形式の見出し・HTML の見出しは扱わない。
// - findListItem は「行頭が `- <ラベル>`」の最初の 1 行だけを返す。項目が複数行にまたがる場合、
//   2 行目以降の語は見ない（現状の 5 節の項目はすべて 1 行）。インデントした入れ子の項目は拾わない。
// - 文章の妥当性・出典との一致は検査しない（レビューで確認する）。語の有無だけを見る。
// - 補助関数は readme.test.ts と共有していない（3 か所目の利用が出たときに共通化する）。
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");

// ---- 判定・解析（純粋関数） ----

// 不可視文字（BOM）はソースに直書きせず、コードポイントから作る
const BOM = String.fromCharCode(0xfeff);

/** BOM を除き、CRLF/LF で行に分ける */
function splitLines(md: string): string[] {
  return md.replace(new RegExp(`^${BOM}`), "").split(/\r?\n/);
}

type Fence = { char: string; length: number };

/** フェンスの開閉を 1 行ずつ追う。戻り値は [この行を処理した後のフェンス状態, この行がフェンス記号の行か] */
function stepFence(line: string, fence: Fence | null): [Fence | null, boolean] {
  const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
  if (fence === null) {
    if (m !== null) return [{ char: m[1][0], length: m[1].length }, true];
    return [null, false];
  }
  if (m !== null && m[1][0] === fence.char && m[1].length >= fence.length) return [null, true];
  return [fence, false];
}

/**
 * 見出し（# 〜 ######。文字が完全一致する最初のもの）の直下から、同じかそれより上のレベルの
 * 次の見出しの手前までの本文を返す。フェンス内の # 行では切れない。見出しが無ければ null
 */
function getSection(md: string, heading: string): string | null {
  let fence: Fence | null = null;
  let level = 0;
  let found = false;
  const body: string[] = [];
  for (const line of splitLines(md)) {
    const inFenceBefore = fence !== null;
    const [next, isFenceLine] = stepFence(line, fence);
    fence = next;
    if (inFenceBefore || isFenceLine) {
      if (found) body.push(line);
      continue;
    }
    const match = /^(#{1,6})[ \t]+(.+?)[ \t]*$/.exec(line);
    if (match !== null) {
      if (found && match[1].length <= level) break;
      if (!found && match[2] === heading) {
        found = true;
        level = match[1].length;
        continue;
      }
    }
    if (found) body.push(line);
  }
  return found ? body.join("\n") : null;
}

/** 最初の `#` 見出しの後、最初の `##` の手前までの本文（冒頭の注意書き）。`#` 見出しが無ければ空文字列 */
function getPreamble(md: string): string {
  let fence: Fence | null = null;
  let seenTitle = false;
  const body: string[] = [];
  for (const line of splitLines(md)) {
    const inFenceBefore = fence !== null;
    const [next, isFenceLine] = stepFence(line, fence);
    fence = next;
    if (!inFenceBefore && !isFenceLine) {
      if (/^##[ \t]+/.test(line) && seenTitle) break;
      if (/^#[ \t]+/.test(line) && !seenTitle) {
        seenTitle = true;
        continue;
      }
    }
    if (seenTitle) body.push(line);
  }
  return body.join("\n");
}

/** フェンス（``` / ~~~）の中身（記号の行を除く）を出現順の配列で返す。フェンスが無ければ空配列 */
function extractFencedBlocks(body: string): string[] {
  const blocks: string[] = [];
  let fence: Fence | null = null;
  let current: string[] = [];
  for (const line of splitLines(body)) {
    const inFenceBefore = fence !== null;
    const [next, isFenceLine] = stepFence(line, fence);
    fence = next;
    if (isFenceLine) {
      if (!inFenceBefore) current = [];
      else blocks.push(current.join("\n"));
      continue;
    }
    if (inFenceBefore) current.push(line);
  }
  return blocks;
}

/** 行頭が `- <label>` の最初の行を返す（インデントした行は対象外）。無ければ null */
function findListItem(body: string, label: string): string | null {
  const prefix = `- ${label}`;
  return splitLines(body).find((line) => line.startsWith(prefix)) ?? null;
}

/** 1 列目が firstCell に完全一致する表の行のセル（前後の空白を落とす）を返す。無ければ null */
function findTableRow(body: string, firstCell: string): string[] | null {
  for (const line of splitLines(body)) {
    const text = line.trim();
    if (!text.startsWith("|")) continue;
    const cells = text.split("|").slice(1);
    if (text.endsWith("|")) cells.pop();
    const trimmed = cells.map((c) => c.trim());
    if (trimmed[0] === firstCell) return trimmed;
  }
  return null;
}

// ---- 純粋関数の陽性・陰性テスト（architecture.md に依存しない） ----

describe("getSection", () => {
  it("AC-1〜AC-10（節の取得）: 見出しの文字が完全一致する節の本文を、次の同レベル以上の見出しの手前まで返す", () => {
    const md = ["## A", "a本文", "### A1", "a1本文", "## B", "b本文"].join("\n");

    expect(getSection(md, "A")).toBe("a本文\n### A1\na1本文");
    expect(getSection(md, "A1")).toBe("a1本文");
    expect(getSection(md, "B")).toBe("b本文");
  });

  it("AC-1〜AC-10（節の取得）: フェンスの中の # 行では切れず、フェンスの記号も本文に含む", () => {
    const md = ["## A", "```", "# コメント", "## 見出しに見える行", "```", "後", "## B"].join("\n");

    expect(getSection(md, "A")).toBe("```\n# コメント\n## 見出しに見える行\n```\n後");
  });

  it("AC-1〜AC-10（節の取得）: 部分一致・存在しない見出し・フェンス内だけにある見出しは null", () => {
    const md = ["## 1. システム概要", "x", "```", "## 隠れた", "```"].join("\n");

    expect(getSection(md, "システム概要")).toBeNull();
    expect(getSection(md, "隠れた")).toBeNull();
    expect(getSection(md, "ない")).toBeNull();
  });

  it("AC-1〜AC-10（節の取得）: CRLF・先頭の BOM・見出しの末尾の空白があっても見つけ、行の末尾に CR を残さない", () => {
    const md = `${BOM}# t\r\n## A \r\nx\r\n## B\r\ny\r\n`;

    expect(getSection(md, "A")).toBe("x");
    expect(getSection(md, "B")).toBe("y\n");
  });
});

describe("getPreamble", () => {
  it("AC-2（前文の取得）: # 見出しの後、最初の ## の手前までを返し、## より後は含まない", () => {
    const md = ["# タイトル", "", "> 注意書き", "", "## 1. 概要", "本文"].join("\n");

    const preamble = getPreamble(md);

    expect(preamble).toContain("注意書き");
    expect(preamble).not.toContain("本文");
    expect(preamble).not.toContain("概要");
  });

  it("AC-2（前文の取得）: # 見出しより前の行は含まない", () => {
    expect(getPreamble(["前の行", "# t", "後の行", "## A"].join("\n"))).not.toContain("前の行");
  });

  it("AC-2（前文の取得）: フェンスの中の ## 行では切れない", () => {
    const md = ["# t", "```", "## 見えるだけ", "```", "続き", "## A", "x"].join("\n");

    expect(getPreamble(md)).toContain("続き");
    expect(getPreamble(md)).not.toContain("x\n");
  });

  it("AC-2（前文の取得）: CRLF でも同じ結果になる", () => {
    const lf = "# t\n注意\n## A\nx\n";

    expect(getPreamble(lf.replace(/\n/g, "\r\n"))).toBe(getPreamble(lf));
    expect(getPreamble(lf)).toContain("注意");
  });
});

describe("extractFencedBlocks", () => {
  it("AC-5（フェンスの取得）: ``` と ~~~ の中身を出現順に返し、フェンスの外の文字と記号の行は含まない", () => {
    const md = ["外1", "```", "a", "b", "```", "外2", "~~~text", "c", "~~~", "外3"].join("\n");

    expect(extractFencedBlocks(md)).toEqual(["a\nb", "c"]);
  });

  it("AC-5（フェンスの取得）: フェンスが無ければ空配列", () => {
    expect(extractFencedBlocks("ただの本文\n- 項目")).toEqual([]);
    expect(extractFencedBlocks("")).toEqual([]);
  });

  it("AC-5（フェンスの取得）: 長いフェンスの中の短いフェンスの行では閉じない", () => {
    const md = ["````", "```", "x", "```", "````"].join("\n");

    expect(extractFencedBlocks(md)).toEqual(["```\nx\n```"]);
  });

  it("AC-5（フェンスの取得）: CRLF でも中身に CR を含めない", () => {
    expect(extractFencedBlocks("```\r\na\r\n```\r\n")).toEqual(["a"]);
  });
});

describe("findListItem", () => {
  it("AC-5・AC-7〜AC-10（項目の取得）: 行頭が - <ラベル> の最初の行を返す", () => {
    const body = ["- 他の項目: a", "- 認証・認可: 方針1", "- 認証・認可: 方針2"].join("\n");

    expect(findListItem(body, "認証・認可")).toBe("- 認証・認可: 方針1");
  });

  it("AC-5・AC-7〜AC-10（項目の取得）: ラベルが行の途中にあるだけの行・インデントした入れ子の行は返さない", () => {
    const body = ["- 別の項目: 認証・認可 に触れる", "  - 認証・認可: 入れ子", "本文 - 認証・認可"].join("\n");

    expect(findListItem(body, "認証・認可")).toBeNull();
  });

  it("AC-5・AC-7〜AC-10（項目の取得）: 項目が無ければ null", () => {
    expect(findListItem("- a\n- b", "c")).toBeNull();
    expect(findListItem("", "c")).toBeNull();
  });

  it("AC-5・AC-7〜AC-10（項目の取得）: CRLF でも行に CR を含めない", () => {
    expect(findListItem("- a: x\r\n- b: y\r\n", "b")).toBe("- b: y");
  });
});

describe("findTableRow", () => {
  const table = [
    "| 領域 | 採用 | 理由 |",
    "| --- | --- | --- |",
    "| データ保存 | なし | 仕様 |",
    "|   認証   |  なし（ログイン不要）  | 理由に データ保存 |",
  ].join("\n");

  it("AC-4（表の行の取得）: 1 列目が完全一致する行のセルを、前後の空白を落として返す", () => {
    expect(findTableRow(table, "データ保存")).toEqual(["データ保存", "なし", "仕様"]);
    expect(findTableRow(table, "認証")).toEqual(["認証", "なし（ログイン不要）", "理由に データ保存"]);
  });

  it("AC-4（表の行の取得）: 1 列目以外に同じ語があっても拾わない・部分一致しない", () => {
    expect(findTableRow(table, "仕様")).toBeNull();
    expect(findTableRow(table, "なし")).toBeNull();
    expect(findTableRow(table, "データ")).toBeNull();
  });

  it("AC-4（表の行の取得）: 行が無ければ null", () => {
    expect(findTableRow(table, "デプロイ先")).toBeNull();
    expect(findTableRow("本文だけ", "x")).toBeNull();
  });

  it("AC-4（表の行の取得）: CRLF でも同じ結果になる", () => {
    expect(findTableRow(table.replace(/\n/g, "\r\n"), "データ保存")).toEqual(["データ保存", "なし", "仕様"]);
  });
});

// ---- docs/architecture.md の現物に対する検査 ----

const architecture = readFileSync(path.join(root, "docs", "architecture.md"), "utf-8");

/** 現物の節の本文を返す。見出しが無ければ、意図した失敗と区別できる文言でテストを失敗させる */
function archSection(heading: string): string {
  const body = getSection(architecture, heading);
  if (body === null) throw new Error(`見出しが無い: docs/architecture.md に「${heading}」が無い`);
  return body;
}

/** 項目の行を返す。無ければ、意図した失敗と区別できる文言でテストを失敗させる */
function archItem(body: string, label: string): string {
  const item = findListItem(body, label);
  if (item === null) throw new Error(`項目が無い: 「- ${label}」で始まる行が無い`);
  return item;
}

/** 本文に含まれない文字列を返す（空配列が期待値。どれが欠けたか分かる） */
function missingStrings(body: string, expected: string[]): string[] {
  return expected.filter((s) => !body.includes(s));
}

/** 本文に含まれる文字列を返す（空配列が期待値。どれが残っているか分かる） */
function foundStrings(body: string, forbidden: string[]): string[] {
  return forbidden.filter((s) => body.includes(s));
}

const H1 = "1. システム概要";
const H2 = "2. 技術スタック";
const H3 = "3. 構成と責務";
const H4 = "4. データモデル";
const H5 = "5. 境界とルール";

describe("docs/architecture.md（仕様 0021）", () => {
  it("AC-1: テンプレートの未記入（<未定> <方針> <1段落で <主要なエンティティ <DB / 外部API>）が書かれていない", () => {
    const placeholders = ["<未定>", "<方針>", "<1段落で", "<主要なエンティティ", "<DB / 外部API>"];

    expect(foundStrings(architecture, placeholders)).toEqual([]);
  });

  it("AC-2: 冒頭の注意書きに「導入時に埋める」が無く、「ADR」と「`<...>` が残っていたら未決」は残っている", () => {
    const preamble = getPreamble(architecture);

    expect(preamble.trim()).not.toBe("");
    expect(foundStrings(preamble, ["導入時に埋める"])).toEqual([]);
    expect(missingStrings(preamble, ["ADR", "`<...>` が残っていたら未決"])).toEqual([]);
  });

  it("AC-3: 1 節に本文があり、GitHub・検索・詳細が含まれる", () => {
    const body = archSection(H1);

    expect(body.replace(/\s/g, "")).not.toBe("");
    expect(missingStrings(body, ["GitHub", "検索", "詳細"])).toEqual([]);
  });

  it.each([
    { label: "データ保存", expected: "なし" },
    { label: "認証", expected: "なし" },
    { label: "デプロイ先", expected: "範囲外" },
  ])("AC-4: 2 節の表の「$label」の行の採用の列に「$expected」が書かれている", ({ label, expected }) => {
    const row = findTableRow(archSection(H2), label);
    if (row === null) throw new Error(`行が無い: 2 節の表に「${label}」の行が無い`);

    // 2 列目（採用）だけを見る。理由の列にだけ語があっても不合格
    expect(row[1] ?? "").toContain(expected);
  });

  it("AC-5: 3 節の図（フェンスの中）に Server Actions・Route Handlers が無く、GitHub API が書かれている", () => {
    const blocks = extractFencedBlocks(archSection(H3));
    const diagram = blocks.join("\n");

    expect(blocks.length).toBeGreaterThanOrEqual(1);
    expect(foundStrings(diagram, ["Server Actions", "Route Handlers"])).toEqual([]);
    expect(missingStrings(diagram, ["GitHub API"])).toEqual([]);
  });

  it("AC-5: 3 節の features/<名前>/ の行に「アクション」が無い", () => {
    const item = archItem(archSection(H3), "`features/<名前>/`");

    expect(foundStrings(item, ["アクション"])).toEqual([]);
  });

  it("AC-6: 4 節に「永続化しない」旨と SearchRepositoriesResult・RepoSummary・RepoDetail が書かれている", () => {
    const body = archSection(H4);

    expect(missingStrings(body, ["永続化しない", "SearchRepositoriesResult", "RepoSummary", "RepoDetail"])).toEqual([]);
  });

  it("AC-7: 5 節の「取得のキャッシュ」の項目に「保存されるのは公開リポジトリの情報だけ」が無く、「生の応答」と「利用者に返す」がある", () => {
    const item = archItem(archSection(H5), "取得のキャッシュ");

    expect(foundStrings(item, ["保存されるのは公開リポジトリの情報だけ"])).toEqual([]);
    expect(missingStrings(item, ["生の応答", "利用者に返す"])).toEqual([]);
  });

  it("AC-8: 5 節の「外部入力の検証」の項目に zod が無く、lib/search/ と lib/github/ がある", () => {
    const item = archItem(archSection(H5), "外部入力の検証");

    expect(/zod/i.test(item)).toBe(false);
    expect(missingStrings(item, ["lib/search/", "lib/github/"])).toEqual([]);
  });

  it("AC-9: 5 節の「認証・認可」の項目に <方針> が無く、「利用者の認証・認可は行わない」と GITHUB_TOKEN と「サーバー側だけ」がある", () => {
    const item = archItem(archSection(H5), "認証・認可");

    expect(foundStrings(item, ["<方針>"])).toEqual([]);
    expect(missingStrings(item, ["利用者の認証・認可は行わない", "GITHUB_TOKEN", "サーバー側だけ"])).toEqual([]);
  });

  it("AC-10: 5 節に「Route Handler」が無く、「GitHub API のエラー」の項目に GitHubApiError がある", () => {
    const body = archSection(H5);
    const item = archItem(body, "GitHub API のエラー");

    expect(foundStrings(body, ["Route Handler"])).toEqual([]);
    expect(missingStrings(item, ["GitHubApiError"])).toEqual([]);
  });
});
