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
  classifyIssues,
  collectSpecDependencies,
  extractSpecNumber,
  indexIssuesBySpec,
  parseDependencies,
} from "./ready-issues-core.mjs";

type IssueState = "OPEN" | "CLOSED";
const issue = (number: number, title: string, state: IssueState) => ({
  number,
  title,
  state,
});

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
    // 範囲の記号の揺れ（全角チルダ・半角チルダ・前後の空白）で依存が黙って落ちると、誤って Ready 候補になる
    {
      name: "AC-2: 全角チルダ「0006～0010」も 5 件に展開する",
      text: "- 関連: `0001-github-repo-search.md`（親仕様）、依存: 0006～0010\n",
      expected: ["0006", "0007", "0008", "0009", "0010"],
    },
    {
      name: "AC-2: 半角チルダ「0006~0010」も 5 件に展開する",
      text: "- 関連: `0001-github-repo-search.md`（親仕様）、依存: 0006~0010\n",
      expected: ["0006", "0007", "0008", "0009", "0010"],
    },
    {
      name: "AC-2: 記号の前後に空白がある「0006 〜 0010」も 5 件に展開する",
      text: "- 関連: `0001-github-repo-search.md`（親仕様）、依存: 0006 〜 0010\n",
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
    { title: "[feat] 0003", expected: "0003" },
  ])("AC-5: 「$title」から $expected を取り出す", ({ title, expected }) => {
    expect(extractSpecNumber(title)).toBe(expected);
  });

  it.each([
    { title: "[chore] 開発時依存 braces の既知脆弱性への追随" },
    { title: "[feat] 依存が完了した Issue を…" },
    { title: "[feat]0003 種別と番号の間に空白が無い" },
    { title: "[feat] 00030 5 桁の番号" },
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

describe("indexIssuesBySpec", () => {
  it("AC-7: 仕様番号 0005 の Issue が 2 件あると duplicates に番号と Issue 番号を返し、bySpec に入れない", () => {
    // Arrange
    const issues = [
      issue(3, "[feat] 0003 GitHub APIクライアント", "CLOSED"),
      issue(5, "[feat] 0005 検索フォーム", "OPEN"),
      issue(30, "[feat] 0005 検索フォーム（再起票）", "OPEN"),
    ];

    // Act
    const { bySpec, duplicates } = indexIssuesBySpec(issues);

    // Assert
    expect(duplicates).toEqual([{ specNumber: "0005", issueNumbers: [5, 30] }]);
    expect([...bySpec.keys()]).toEqual(["0003"]);
  });

  it("AC-6: 仕様番号の無い Issue は bySpec にも duplicates にも入れない", () => {
    const { bySpec, duplicates } = indexIssuesBySpec([
      issue(31, "[chore] 開発時依存 braces の既知脆弱性への追随", "OPEN"),
      issue(32, "[chore] 別の保守作業", "OPEN"),
    ]);

    expect([...bySpec.keys()]).toEqual([]);
    expect(duplicates).toEqual([]);
  });
});

describe("classifyIssues", () => {
  it("AC-8: 依存 0003・0004 がどちらも CLOSED の 0008（OPEN）を ready に含める", () => {
    // Arrange
    const issues = [
      issue(3, "[feat] 0003 GitHub APIクライアント", "CLOSED"),
      issue(4, "[feat] 0004 検索ユーティリティ", "CLOSED"),
      issue(8, "[feat] 0008 詳細ページ", "OPEN"),
    ];
    const specDependencies = new Map([
      ["0003", []],
      ["0004", []],
      ["0008", ["0003", "0004"]],
    ]);

    // Act
    const result = classifyIssues({
      issues,
      specDependencies,
      assumeClosed: [],
    });

    // Assert
    expect(result.ready).toEqual([
      {
        issue: issues[2],
        specNumber: "0008",
        dependencies: ["0003", "0004"],
        assumed: [],
      },
    ]);
    expect(result.waiting).toEqual([]);
  });

  it("AC-9: 0006 が CLOSED・0008 が OPEN のとき 0009 を waiting に入れ、blockers は 0008 だけである", () => {
    // Arrange
    const issues = [
      issue(6, "[feat] 0006 検索結果一覧", "CLOSED"),
      issue(8, "[feat] 0008 詳細ページ", "OPEN"),
      issue(9, "[feat] 0009 戻る導線", "OPEN"),
    ];
    const specDependencies = new Map([
      ["0006", []],
      ["0008", []],
      ["0009", ["0006", "0008"]],
    ]);

    // Act
    const result = classifyIssues({
      issues,
      specDependencies,
      assumeClosed: [],
    });

    // Assert
    expect(result.ready).toEqual([]);
    expect(result.waiting).toEqual([
      {
        issue: issues[2],
        specNumber: "0009",
        blockers: [{ specNumber: "0008", reason: "open", issueNumber: 8 }],
      },
    ]);
  });

  it("AC-10: 依存先 0014 の Issue が無いとき waiting に no-issue として入れる", () => {
    // Arrange
    const issues = [issue(13, "[feat] 0013 E2E", "OPEN")];
    const specDependencies = new Map([["0013", ["0014"]]]);

    // Act
    const result = classifyIssues({
      issues,
      specDependencies,
      assumeClosed: [],
    });

    // Assert
    expect(result.ready).toEqual([]);
    expect(result.waiting).toEqual([
      {
        issue: issues[0],
        specNumber: "0013",
        blockers: [{ specNumber: "0014", reason: "no-issue" }],
      },
    ]);
  });

  it.each([
    {
      name: "CLOSED の Issue（依存が未完了でも）",
      issues: [
        issue(1, "[feat] 0001 親仕様", "CLOSED"),
        issue(2, "[feat] 0002 基盤", "CLOSED"),
      ],
      specDependencies: new Map([
        ["0001", []],
        ["0002", ["0003"]],
      ]),
    },
    {
      name: "依存が [] の OPEN の Issue",
      issues: [issue(2, "[feat] 0002 基盤", "OPEN")],
      specDependencies: new Map([["0002", []]]),
    },
  ])(
    "AC-11: $name は ready にも waiting にも入れない",
    ({ issues, specDependencies }) => {
      const result = classifyIssues({
        issues,
        specDependencies,
        assumeClosed: [],
      });

      expect(result.ready).toEqual([]);
      expect(result.waiting).toEqual([]);
    },
  );

  it("AC-12: すでに CLOSED の Issue を assumeClosed に入れても、assumed には入れない（実際は閉じているので「仮定」と表示しない）", () => {
    // Arrange
    const issues = [
      issue(6, "[feat] 0006 検索結果一覧", "CLOSED"),
      issue(9, "[feat] 0009 戻る導線", "OPEN"),
    ];
    const specDependencies = new Map([
      ["0006", []],
      ["0009", ["0006"]],
    ]);

    // Act
    const result = classifyIssues({
      issues,
      specDependencies,
      assumeClosed: [6],
    });

    // Assert
    expect(result.ready).toEqual([
      {
        issue: issues[1],
        specNumber: "0009",
        dependencies: ["0006"],
        assumed: [],
      },
    ]);
  });

  it("AC-12: assumeClosed [8] のとき 0009 を ready に含め、assumed に 8 を入れる", () => {
    // Arrange
    const issues = [
      issue(6, "[feat] 0006 検索結果一覧", "CLOSED"),
      issue(8, "[feat] 0008 詳細ページ", "OPEN"),
      issue(9, "[feat] 0009 戻る導線", "OPEN"),
    ];
    const specDependencies = new Map([
      ["0006", []],
      ["0008", []],
      ["0009", ["0006", "0008"]],
    ]);

    // Act
    const result = classifyIssues({
      issues,
      specDependencies,
      assumeClosed: [8],
    });

    // Assert
    expect(result.ready).toEqual([
      {
        issue: issues[2],
        specNumber: "0009",
        dependencies: ["0006", "0008"],
        assumed: [8],
      },
    ]);
    expect(result.waiting).toEqual([]);
  });

  it("AC-12: assumeClosed に入れた Issue 自身は CLOSED とみなして ready に含めない", () => {
    // Arrange: 0008 は依存（0006）が完了しているので、仮定が無ければ ready になる
    const issues = [
      issue(6, "[feat] 0006 検索結果一覧", "CLOSED"),
      issue(8, "[feat] 0008 詳細ページ", "OPEN"),
      issue(9, "[feat] 0009 戻る導線", "OPEN"),
    ];
    const specDependencies = new Map([
      ["0006", []],
      ["0008", ["0006"]],
      ["0009", ["0006", "0008"]],
    ]);

    // Act
    const result = classifyIssues({
      issues,
      specDependencies,
      assumeClosed: [8],
    });

    // Assert
    expect(result.ready.map((entry) => entry.issue.number)).toEqual([9]);
    expect(result.waiting).toEqual([]);
  });

  it("AC-7: 重複した番号は候補にならず、それに依存する Issue は「待ち」（Issue が複数）になる", () => {
    // Arrange
    const issues = [
      issue(5, "[feat] 0005 検索フォーム", "OPEN"),
      issue(30, "[feat] 0005 検索フォーム（再起票）", "OPEN"),
      issue(7, "[feat] 0007 ページネーション", "OPEN"),
    ];
    const specDependencies = new Map([
      ["0005", ["0001"]],
      ["0007", ["0005"]],
    ]);

    // Act
    const result = classifyIssues({
      issues,
      specDependencies,
      assumeClosed: [],
    });

    // Assert
    expect(result.ready).toEqual([]);
    expect(result.waiting).toEqual([
      {
        issue: issues[2],
        specNumber: "0007",
        blockers: [{ specNumber: "0005", reason: "duplicate" }],
      },
    ]);
  });

  it("AC-7: 同じ仕様番号の Issue が複数あるとき、仕様番号と Issue 番号の一覧を含む警告を返す", () => {
    // Arrange
    const issues = [
      issue(5, "[feat] 0005 検索フォーム", "OPEN"),
      issue(30, "[feat] 0005 検索フォーム（再起票）", "OPEN"),
    ];
    const specDependencies = new Map([["0005", ["0001"]]]);

    // Act
    const result = classifyIssues({
      issues,
      specDependencies,
      assumeClosed: [],
    });

    // Assert
    expect(result.warnings).toEqual([
      "警告: 仕様番号 0005 の Issue が複数あります（#5, #30）。この番号は未解決として扱います",
    ]);
  });

  it("Q4: 仕様ファイルの無い OPEN の Issue は対象外にして警告を返す", () => {
    // Arrange
    const issues = [issue(40, "[feat] 0015 未起票の仕様", "OPEN")];
    const specDependencies = new Map<string, string[]>();

    // Act
    const result = classifyIssues({
      issues,
      specDependencies,
      assumeClosed: [],
    });

    // Assert
    expect(result.ready).toEqual([]);
    expect(result.waiting).toEqual([]);
    expect(result.warnings).toEqual([
      "警告: #40（0015）の仕様ファイルが見つかりません。判定の対象外にします",
    ]);
  });
});
