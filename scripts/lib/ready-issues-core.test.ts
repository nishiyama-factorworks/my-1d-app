// @vitest-environment node
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  collectSpecDependencies,
  extractSpecNumber,
  parseDependencies,
} from "./ready-issues-core.mjs";

describe("parseDependencies", () => {
  it.each([
    {
      name: "AC-1: 依存: 0004, 0006 の関連行から 0004・0006 を返し、依存より前の 0001 を含めない",
      text: "# 0007\n\n- 関連: `0001-github-repo-search.md`（親仕様）、依存: 0004, 0006\n",
      expected: ["0004", "0006"],
    },
    {
      name: "AC-1: 依存より前の括弧と番号を含まない（_assignment.md の行）",
      text: "- 関連: `0001-github-repo-search.md`（親仕様）、`_assignment.md`（課題文）、依存: 0011\n",
      expected: ["0011"],
    },
    {
      name: "AC-2: 依存: 0006〜0010 を 0006〜0010 の 5 件に展開する",
      text: "- 関連: `0001-github-repo-search.md`（親仕様、8節の非機能要件）、依存: 0006〜0010\n",
      expected: ["0006", "0007", "0008", "0009", "0010"],
    },
    {
      name: "AC-3: 括弧内の文と番号を無視して 0009・0010・0003 を返す",
      text: "- 関連: `0001-github-repo-search.md`（親仕様）、依存: 0009, 0010、0003（APIの接続先の差し替えが必要になる可能性）\n",
      expected: ["0009", "0010", "0003"],
    },
    {
      name: "AC-3: 括弧内に書かれた番号（全角・半角の括弧）は依存に含めない",
      text: "- 関連: `0001-github-repo-search.md`（親仕様）、依存: 0009（0005 の後に着手）, 0010 (0007 を参照), 0003\n",
      expected: ["0009", "0010", "0003"],
    },
    {
      name: "AC-4: 依存なし の関連行は [] を返す",
      text: "- 関連: `0001-github-repo-search.md`（親仕様）、依存なし、`harness/MANUAL.md`\n",
      expected: [],
    },
    {
      name: "AC-4: 依存の無い関連行は [] を返す",
      text: "- 関連: `harness/MANUAL.md` 10.4（Projects ボードの設定と運用）、`scripts/setup-github.sh`\n",
      expected: [],
    },
    {
      name: "AC-4: 関連行の無い文書は [] を返す",
      text: "# タイトル\n\n本文だけ。\n",
      expected: [],
    },
    {
      name: "AC-4: 本文にだけ「依存:」がある文書は [] を返す",
      text: [
        "# 0014",
        "",
        "- 関連: `harness/MANUAL.md` 10.4（Projects ボードの設定と運用）、`scripts/setup-github.sh`",
        "",
        "各仕様の冒頭に `依存: 0004, 0006` のように前提のタスクが書かれている。",
      ].join("\n"),
      expected: [],
    },
    {
      name: "AC-1: CRLF の文書でも依存を返す",
      text: "# 0007\r\n\r\n- 関連: `0001-a.md`（親仕様）、依存: 0004, 0006\r\n",
      expected: ["0004", "0006"],
    },
  ])("$name", ({ text, expected }) => {
    expect(parseDependencies(text)).toEqual(expected);
  });
});

describe("extractSpecNumber", () => {
  it.each([
    { title: "[feat] 0003 GitHub APIクライアント", expected: "0003" },
    { title: "[docs] 0012 README・AI利用レポート", expected: "0012" },
  ])("AC-5: 「$title」から $expected を取り出す", ({ title, expected }) => {
    expect(extractSpecNumber(title)).toBe(expected);
  });

  it.each([
    { title: "[chore] 開発時依存 braces の既知脆弱性への追随" },
    { title: "[feat] 依存が完了した Issue を…" },
  ])(
    "AC-6: 「$title」は種別のあとに 4 桁の番号が無いので null を返す",
    ({ title }) => {
      expect(extractSpecNumber(title)).toBeNull();
    },
  );
});

describe("collectSpecDependencies", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it("AC-4/5: NNNN-*.md だけを対象にし、_template.md と _assignment.md を除く", () => {
    // Arrange: 実ファイルを一時ディレクトリに置き、読み込んだ結果を渡す
    const dir = mkdtempSync(join(tmpdir(), "ready-issues-"));
    dirs.push(dir);
    writeFileSync(join(dir, "0003-a.md"), "- 関連: `x.md`、依存: 0001, 0002\n");
    writeFileSync(join(dir, "_template.md"), "- 関連: `x.md`、依存: 0009\n");
    writeFileSync(join(dir, "_assignment.md"), "- 関連: `x.md`、依存: 0008\n");
    const files = readdirSync(dir).map((name) => ({
      name,
      text: readFileSync(join(dir, name), "utf8"),
    }));

    // Act
    const result = collectSpecDependencies(files);

    // Assert
    expect([...result.entries()]).toEqual([["0003", ["0001", "0002"]]]);
  });
});
