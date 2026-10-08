// @vitest-environment node
import { describe, expect, it } from "vitest";
import { runReadyIssues } from "./ready-issues-cli.mjs";
import {
  fieldListArgs,
  issueListArgs,
  itemEditArgs,
  itemListArgs,
  repoViewArgs,
} from "./ready-issues-gh.mjs";

type Responses = {
  issueList: string | Error;
  repoView: string | Error;
  fieldList: string | Error;
  itemList: string | Error;
  itemEdit: string | Error;
};

const issue = (number: number, title: string, state = "OPEN") => ({
  number,
  title,
  state,
  url: `https://github.com/owner/repo/issues/${number}`,
});

const BASIC_ISSUES = [
  issue(3, "[feat] 0003 API", "CLOSED"),
  issue(4, "[feat] 0004 検索", "CLOSED"),
  issue(8, "[feat] 0008 詳細ページ"),
  issue(9, "[feat] 0009 戻る導線"),
];

const dependsOn = (deps: string) =>
  `# 仕様\n\n- 関連: \`0001-x.md\`（親仕様）、依存: ${deps}\n`;

const BASIC_SPECS = [
  { name: "0003-api.md", text: dependsOn("なし") },
  { name: "0004-search.md", text: dependsOn("なし") },
  { name: "0008-detail.md", text: dependsOn("0003, 0004") },
  { name: "0009-back.md", text: dependsOn("0004, 0008") },
];

const FIELDS_OK = JSON.stringify({
  fields: [
    { id: "f1", name: "Title" },
    {
      id: "f2",
      name: "Status",
      options: [
        { id: "o1", name: "Backlog" },
        { id: "o2", name: "Ready" },
        { id: "o3", name: "In progress" },
      ],
    },
  ],
});

const item = (id: string, number: number, status: string) => ({
  id,
  status,
  content: { type: "Issue", number, repository: "owner/repo" },
});

const ITEMS_8_BACKLOG = JSON.stringify({
  items: [item("i8", 8, "Backlog")],
  totalCount: 1,
});

function scopeError() {
  return Object.assign(new Error("gh failed"), {
    stderr:
      "error: your authentication token is missing required scopes [project]",
  });
}

function setup(
  argv: string[],
  overrides: Partial<Responses> = {},
  specs = BASIC_SPECS,
) {
  const responses: Responses = {
    issueList: JSON.stringify(BASIC_ISSUES),
    repoView: JSON.stringify({ nameWithOwner: "owner/repo" }),
    fieldList: FIELDS_OK,
    itemList: ITEMS_8_BACKLOG,
    itemEdit: "",
    ...overrides,
  };
  const calls: string[][] = [];
  const out: string[] = [];
  const err: string[] = [];
  const runGh = async (args: string[]) => {
    calls.push(args);
    let key: keyof Responses | null = null;
    if (args[0] === "issue" && args[1] === "list") key = "issueList";
    else if (args[0] === "repo" && args[1] === "view") key = "repoView";
    else if (args[0] === "project" && args[1] === "field-list")
      key = "fieldList";
    else if (args[0] === "project" && args[1] === "item-list") key = "itemList";
    else if (args[0] === "project" && args[1] === "item-edit") key = "itemEdit";
    if (key === null) throw new Error("unexpected gh call");
    const value = responses[key];
    if (value instanceof Error) throw value;
    return { stdout: value };
  };
  const run = () =>
    runReadyIssues({
      argv,
      runGh,
      readSpecFiles: async () => specs,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
    });
  return { run, calls, out, err };
}

const hasItemEdit = (calls: string[][]) =>
  calls.some((c) => c.includes("item-edit"));

describe("AC-12: --assume-closed の引数", () => {
  it("AC-12: 仮定なしでは 0009 は待ちで、ready に出ない", async () => {
    const t = setup([]);
    expect(await t.run()).toBe(0);
    const text = t.out.join("\n");
    expect(text).toContain("#8 0008 詳細ページ（依存: 0003 ✓, 0004 ✓）");
    expect(text).toContain("#9 0009 戻る導線（待ち: 0008）");
    expect(text).not.toContain("仮定:");
  });

  it.each([
    ["--assume-closed 8", ["--assume-closed", "8"]],
    ["--assume-closed #8", ["--assume-closed", "#8"]],
    // 仮定した Issue 自身は候補に出ない（計画 T2）ため、2 つ目は 0009 と無関係な #10 にする
    ["--assume-closed 8 10", ["--assume-closed", "8", "10"]],
    [
      "--assume-closed 8 --assume-closed 10",
      ["--assume-closed", "8", "--assume-closed", "10"],
    ],
  ])(
    "AC-12: %s を受け付け、#8 を CLOSED と仮定して 0009 を ready にする",
    async (_label, argv) => {
      const t = setup(
        argv,
        {
          issueList: JSON.stringify([
            ...BASIC_ISSUES,
            issue(10, "[feat] 0010 別の機能"),
          ]),
        },
        [...BASIC_SPECS, { name: "0010-other.md", text: dependsOn("なし") }],
      );
      expect(await t.run()).toBe(0);
      const text = t.out.join("\n");
      expect(text).toContain(
        "#9 0009 戻る導線（依存: 0004 ✓, 0008 ✓）仮定: #8",
      );
      expect(t.err).toEqual([]);
    },
  );

  it.each(["0", "abc", "#", "-1", "##8", "8,9"])(
    "AC-12: 不正な番号 %s は使い方の誤りで終了コード 1、gh を呼ばない",
    async (bad) => {
      const t = setup(["--assume-closed", bad]);
      expect(await t.run()).toBe(1);
      expect(t.calls).toEqual([]);
      expect(t.err.join("\n")).toContain("使い方");
    },
  );

  it("AC-12: --assume-closed に値が無いと使い方の誤りで終了コード 1、gh を呼ばない", async () => {
    const t = setup(["--assume-closed"]);
    expect(await t.run()).toBe(1);
    expect(t.calls).toEqual([]);
  });
});

describe("AC-13/14: 読み取りだけの実行", () => {
  it("引数なしでは issue list だけを呼び、repo view も project 系も呼ばず終了コード 0", async () => {
    const t = setup([]);
    expect(await t.run()).toBe(0);
    expect(t.calls).toEqual([issueListArgs()]);
    expect(t.out.join("\n")).toContain("== Ready にできる Issue（1件）==");
    expect(t.out.join("\n")).toContain("== 待ち（1件）==");
  });

  it("AC-13: 引数なしでは item-edit を一度も呼ばない", async () => {
    const t = setup([]);
    await t.run();
    expect(hasItemEdit(t.calls)).toBe(false);
  });

  it("AC-13: --project 3（--apply なし）では item-edit を一度も呼ばない", async () => {
    const t = setup(["--project", "3"]);
    await t.run();
    expect(hasItemEdit(t.calls)).toBe(false);
  });

  it("AC-14: --project 3 は読み取り 4 種だけを順に呼び、所有者は repo view の owner 部分を使う", async () => {
    const t = setup(["--project", "3"]);
    expect(await t.run()).toBe(0);
    expect(t.calls).toEqual([
      issueListArgs(),
      repoViewArgs(),
      fieldListArgs(3, "owner"),
      itemListArgs(3, "owner"),
    ]);
  });

  it("AC-14: --owner があれば所有者にそれを使う", async () => {
    const t = setup(["--project", "3", "--owner", "other-org"]);
    expect(await t.run()).toBe(0);
    expect(t.calls).toContainEqual(fieldListArgs(3, "other-org"));
    expect(t.calls).toContainEqual(itemListArgs(3, "other-org"));
    expect(t.calls).not.toContainEqual(fieldListArgs(3, "owner"));
    expect(hasItemEdit(t.calls)).toBe(false);
  });

  it("AC-14: Backlog・In progress・ボードに無い候補を 3 種の表示にして終了コード 0", async () => {
    const issues = [
      issue(3, "[feat] 0003 API", "CLOSED"),
      issue(20, "[feat] 0020 機能A"),
      issue(21, "[feat] 0021 機能B"),
      issue(22, "[feat] 0022 機能C"),
    ];
    const specs = [
      { name: "0003-api.md", text: dependsOn("なし") },
      { name: "0020-a.md", text: dependsOn("0003") },
      { name: "0021-b.md", text: dependsOn("0003") },
      { name: "0022-c.md", text: dependsOn("0003") },
    ];
    const t = setup(
      ["--project", "3"],
      {
        issueList: JSON.stringify(issues),
        itemList: JSON.stringify({
          items: [item("a", 20, "Backlog"), item("b", 21, "In progress")],
          totalCount: 2,
        }),
      },
      specs,
    );
    expect(await t.run()).toBe(0);
    const text = t.out.join("\n");
    expect(text).toContain("#20 0020 機能A: Backlog → Ready（更新予定）");
    expect(text).toContain("#21 0021 機能B: 変更しない（現在: In progress）");
    expect(text).toContain("#22 0022 機能C: ボードに無い");
    expect(hasItemEdit(t.calls)).toBe(false);
  });
});

describe("AC-17 / Q2: 使い方の誤り", () => {
  it("AC-17: --apply だけのとき使い方を err に表示し、gh を呼ばず終了コード 1", async () => {
    const t = setup(["--apply"]);
    expect(await t.run()).toBe(1);
    expect(t.calls).toEqual([]);
    expect(t.err.join("\n")).toContain("使い方");
  });

  it.each([
    ["--apply --assume-closed 8", ["--apply", "--assume-closed", "8"]],
    [
      "--assume-closed 8 --project 3 --apply",
      ["--assume-closed", "8", "--project", "3", "--apply"],
    ],
  ])("Q2: %s は併用できず、gh を呼ばず終了コード 1", async (_label, argv) => {
    const t = setup(argv);
    expect(await t.run()).toBe(1);
    expect(t.calls).toEqual([]);
    expect(t.err.join("\n")).toContain("使い方");
  });

  it.each([
    ["未知のオプション --foo", ["--foo"]],
    ["--apply=true", ["--project", "3", "--apply=true"]],
    ["--project の値の欠落", ["--project"]],
    ["--project 0", ["--project", "0"]],
    ["--project x", ["--project", "x"]],
    ["--owner -bad", ["--project", "3", "--owner", "-bad"]],
    ["--owner a b（空白を含む）", ["--project", "3", "--owner", "a b"]],
    ["--assume-closed を伴わない位置引数", ["8"]],
    ["--project の後の位置引数", ["--project", "3", "9"]],
  ])("使い方の誤り: %s は gh を呼ばず終了コード 1", async (_label, argv) => {
    const t = setup(argv);
    expect(await t.run()).toBe(1);
    expect(t.calls).toEqual([]);
    expect(t.err.join("\n")).toContain("使い方");
  });
});

describe("AC-18/19: Project の読み取りの失敗", () => {
  const guide =
    "gh auth refresh -s project をご自身のターミナルで実行してください";

  it("AC-18: field-list が missing required scopes で失敗すると案内を err に表示し、item-edit を呼ばず終了コード 1", async () => {
    const t = setup(["--project", "3"], { fieldList: scopeError() });
    expect(await t.run()).toBe(1);
    expect(t.err.join("\n")).toContain(guide);
    expect(hasItemEdit(t.calls)).toBe(false);
  });

  it("AC-18: item-list が権限不足で失敗しても同じ案内を表示して終了コード 1", async () => {
    const t = setup(["--project", "3"], { itemList: scopeError() });
    expect(await t.run()).toBe(1);
    expect(t.err.join("\n")).toContain(guide);
    expect(hasItemEdit(t.calls)).toBe(false);
  });

  it("AC-18: issue list が権限不足で失敗しても案内を表示して終了コード 1", async () => {
    const t = setup([], { issueList: scopeError() });
    expect(await t.run()).toBe(1);
    expect(t.err.join("\n")).toContain(guide);
  });

  it("AC-19: field-list が権限不足以外で失敗すると Project と所有者、gh の stderr（制御文字は除去）を表示して終了コード 1", async () => {
    const failure = Object.assign(new Error("gh failed"), {
      stderr:
        "GraphQL: Could not resolve to a ProjectV2 \x1b[31mwith the number 3.",
    });
    const t = setup(["--project", "3"], { fieldList: failure });
    expect(await t.run()).toBe(1);
    const text = t.err.join("\n");
    expect(text).toContain("Project #3（所有者: owner）が見つかりませんでした");
    expect(text).toContain(
      "Could not resolve to a ProjectV2 [31mwith the number 3.",
    );
    expect(text).not.toContain("\x1b");
    expect(text).not.toContain(guide);
    expect(t.calls.some((c) => c[1] === "item-list")).toBe(false);
    expect(hasItemEdit(t.calls)).toBe(false);
  });

  it("AC-19: Status フィールドが無いと findStatusField の message を表示して終了コード 1", async () => {
    const t = setup(["--project", "3"], {
      fieldList: JSON.stringify({
        fields: [
          { id: "f1", name: "Title" },
          { id: "f2", name: "Assignees" },
        ],
      }),
    });
    expect(await t.run()).toBe(1);
    expect(t.err.join("\n")).toContain(
      "Status フィールドが見つかりません（存在したフィールド: Title, Assignees）",
    );
    expect(hasItemEdit(t.calls)).toBe(false);
  });

  it("AC-19: Status に Ready の選択肢が無いと選択肢の一覧を表示して終了コード 1", async () => {
    const t = setup(["--project", "3"], {
      fieldList: JSON.stringify({
        fields: [
          {
            id: "f2",
            name: "Status",
            options: [
              { id: "o1", name: "Todo" },
              { id: "o2", name: "Done" },
            ],
          },
        ],
      }),
    });
    expect(await t.run()).toBe(1);
    expect(t.err.join("\n")).toContain(
      "Status の選択肢に Ready がありません（存在した選択肢: Todo, Done）",
    );
    expect(hasItemEdit(t.calls)).toBe(false);
  });
});

describe("仕様 7 節 / gh の出力 / AC-21", () => {
  const LIMIT_WARNING =
    "警告: Issue の取得が上限（1,000件）に達しました。一部の Issue が判定に含まれていない可能性があります";
  const filler = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      issue(1000 + i, "[chore] 雑務", "CLOSED"),
    );

  it("仕様7: issue list がちょうど 1,000 件のとき上限の警告を表示する", async () => {
    const t = setup([], { issueList: JSON.stringify(filler(1000)) });
    expect(await t.run()).toBe(0);
    expect(t.out.join("\n")).toContain(LIMIT_WARNING);
  });

  it("仕様7: 999 件のときは警告を表示しない", async () => {
    const t = setup([], { issueList: JSON.stringify(filler(999)) });
    expect(await t.run()).toBe(0);
    expect(t.out.join("\n")).not.toContain("上限");
  });

  it("gh の出力を解釈できない（issue list が不正な JSON）とき err に表示して終了コード 1", async () => {
    const t = setup([], { issueList: "not json" });
    expect(await t.run()).toBe(1);
    expect(t.err.join("\n")).toContain("gh の出力を解釈できませんでした");
  });

  it("gh の出力を解釈できない（field-list の形が不正）とき終了コード 1、item-edit を呼ばない", async () => {
    const t = setup(["--project", "3"], {
      fieldList: JSON.stringify({ fields: "x" }),
    });
    expect(await t.run()).toBe(1);
    expect(t.err.join("\n")).toContain("gh の出力を解釈できませんでした");
    expect(hasItemEdit(t.calls)).toBe(false);
  });

  it("AC-21: Issue のタイトルに ESC が入っていても out に \\x1b が出ない", async () => {
    const issues = [
      issue(3, "[feat] 0003 API", "CLOSED"),
      issue(4, "[feat] 0004 検索", "CLOSED"),
      issue(8, "[feat] 0008 \x1b[31m赤い詳細"),
    ];
    const t = setup([], { issueList: JSON.stringify(issues) });
    expect(await t.run()).toBe(0);
    const text = t.out.join("\n");
    expect(text).toContain("#8 0008 [31m赤い詳細");
    expect(text).not.toContain("\x1b");
  });
});

describe("AC-15/16/20 ほか: --apply による Status の更新", () => {
  const readyIssues = (numbers: number[]) => [
    issue(3, "[feat] 0003 API", "CLOSED"),
    ...numbers.map((n) => issue(n, `[feat] 00${n} 機能${n}`)),
  ];
  const readySpecs = (numbers: number[]) => [
    { name: "0003-api.md", text: dependsOn("なし") },
    ...numbers.map((n) => ({
      name: `00${n}-x.md`,
      text: dependsOn("0003"),
    })),
  ];
  const board = (entries: [number, string][]) =>
    JSON.stringify({
      items: entries.map(([n, status]) => item(`i${n}`, n, status)),
      totalCount: entries.length,
    });
  const urlOf = (n: number) => `https://github.com/owner/repo/issues/${n}`;

  // item-edit だけ Issue ごとに結果を変えたいので、runGh を自前で組む
  function setupApply(
    editResult: (url: string) => Error | null,
    items: string,
    numbers: number[],
  ) {
    const calls: string[][] = [];
    const out: string[] = [];
    const err: string[] = [];
    const runGh = async (args: string[]) => {
      calls.push(args);
      if (args[0] === "issue") {
        return { stdout: JSON.stringify(readyIssues(numbers)) };
      }
      if (args[0] === "repo") {
        return { stdout: JSON.stringify({ nameWithOwner: "owner/repo" }) };
      }
      if (args[1] === "field-list") return { stdout: FIELDS_OK };
      if (args[1] === "item-list") return { stdout: items };
      if (args[1] === "item-edit") {
        const failure = editResult(args[args.indexOf("--url") + 1]);
        if (failure) throw failure;
        return { stdout: "" };
      }
      throw new Error("unexpected gh call");
    };
    const run = () =>
      runReadyIssues({
        argv: ["--project", "3", "--apply"],
        runGh,
        readSpecFiles: async () => readySpecs(numbers),
        out: (line) => out.push(line),
        err: (line) => err.push(line),
      });
    return { run, calls, out, err };
  }

  const editCalls = (calls: string[][]) =>
    calls.filter((c) => c.includes("item-edit"));

  it("AC-15: A=Backlog・B=In progress・C=ボードに無いとき、item-edit を A に対して 1 回だけ呼び、B と C の理由を表示する", async () => {
    const t = setupApply(
      () => null,
      board([
        [20, "Backlog"],
        [21, "In progress"],
      ]),
      [20, 21, 22],
    );
    expect(await t.run()).toBe(0);
    expect(editCalls(t.calls)).toEqual([itemEditArgs(3, "owner", urlOf(20))]);
    const text = t.out.join("\n");
    expect(text).toContain("#21 0021 機能21: 変更しない（現在: In progress）");
    expect(text).toContain("#22 0022 機能22: ボードに無い");
    expect(text).toContain("更新: 成功 1 件 / 失敗 0 件");
    expect(t.err).toEqual([]);
  });

  it("AC-16: A が Ready の状態で再実行すると item-edit を呼ばず「成功 0 件 / 失敗 0 件」で終了コード 0", async () => {
    const t = setupApply(() => null, board([[20, "Ready"]]), [20, 21]);
    expect(await t.run()).toBe(0);
    expect(hasItemEdit(t.calls)).toBe(false);
    expect(t.out.join("\n")).toContain("更新: 成功 0 件 / 失敗 0 件");
  });

  it("AC-20: A の更新は成功・B の更新は失敗のとき、B を表示して続行し「成功 1 件 / 失敗 1 件」で終了コード 1", async () => {
    const t = setupApply(
      (url) =>
        url === urlOf(21)
          ? Object.assign(new Error("gh failed"), {
              stderr: "GraphQL: \x1b[31mboom happened\n",
            })
          : null,
      board([
        [20, "Backlog"],
        [21, "Backlog"],
      ]),
      [20, 21],
    );
    expect(await t.run()).toBe(1);
    expect(editCalls(t.calls)).toEqual([
      itemEditArgs(3, "owner", urlOf(20)),
      itemEditArgs(3, "owner", urlOf(21)),
    ]);
    const errText = t.err.join("\n");
    expect(errText).toContain("#21");
    expect(errText).toContain("GraphQL: [31mboom happened");
    expect(errText).not.toContain("\x1b");
    expect(t.out.join("\n")).toContain("更新: 成功 1 件 / 失敗 1 件");
  });

  it("AC-18: item-edit が missing required scopes で失敗したとき案内を表示し、件数を表示して終了コード 1", async () => {
    const t = setupApply(
      () => scopeError(),
      board([[20, "Backlog"]]),
      [20, 21],
    );
    expect(await t.run()).toBe(1);
    expect(t.err.join("\n")).toContain(
      "gh auth refresh -s project をご自身のターミナルで実行してください",
    );
    expect(t.out.join("\n")).toContain("更新: 成功 0 件 / 失敗 1 件");
  });

  it("AC-13: --apply が無い --project 3 では Backlog の候補があっても item-edit を呼ばない", async () => {
    const t = setup(
      ["--project", "3"],
      {
        issueList: JSON.stringify(readyIssues([20])),
        itemList: board([[20, "Backlog"]]),
      },
      readySpecs([20]),
    );
    expect(await t.run()).toBe(0);
    expect(hasItemEdit(t.calls)).toBe(false);
    expect(t.out.join("\n")).not.toContain("更新: 成功");
  });

  it("AC-21: item-edit の失敗理由に ESC が含まれても out/err に \x1b が出ない", async () => {
    const t = setupApply(
      () =>
        Object.assign(new Error("gh failed"), {
          stderr: "bad \x1b[2J\x1b]0;title\x07 thing",
        }),
      board([[20, "Backlog"]]),
      [20],
    );
    expect(await t.run()).toBe(1);
    expect(t.out.join("\n")).toContain("更新: 成功 0 件 / 失敗 1 件");
    expect(t.out.join("\n")).not.toContain("\x1b");
    expect(t.err.join("\n")).toContain("#20");
    expect(t.err.join("\n")).not.toContain("\x1b");
  });
});

describe("--apply: Issue の URL が取れないとき", () => {
  it("AC-20: URL が空の Backlog の候補は gh を呼ばずに失敗として数え、終了コード 1", async () => {
    const t = setup(["--project", "3", "--apply"], {
      issueList: JSON.stringify(
        BASIC_ISSUES.map((i) => (i.number === 8 ? { ...i, url: "" } : i)),
      ),
    });
    expect(await t.run()).toBe(1);
    expect(hasItemEdit(t.calls)).toBe(false);
    expect(t.err.join("\n")).toContain("#8 の更新に失敗しました");
    expect(t.out.join("\n")).toContain("更新: 成功 0 件 / 失敗 1 件");
  });
});

describe("Q6: Project の項目が取得の上限を超えるとき", () => {
  it("全体の件数が取得できた件数より多いと、ボードにある候補が「ボードに無い」と出る可能性の警告を表示する", async () => {
    const t = setup(["--project", "3"], {
      itemList: JSON.stringify({
        items: [item("i8", 8, "Backlog")],
        totalCount: 1500,
      }),
    });
    expect(await t.run()).toBe(0);
    expect(t.out.join("\n")).toContain(
      "警告: Project の項目の取得が上限に達しました（取得 1 件 / 全体 1500 件）",
    );
  });

  it("全体の件数と取得できた件数が同じなら警告を表示しない", async () => {
    const t = setup(["--project", "3"]);
    expect(await t.run()).toBe(0);
    expect(t.out.join("\n")).not.toContain("Project の項目の取得が上限");
  });
});
