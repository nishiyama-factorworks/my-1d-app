// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  findStatusField,
  formatPlan,
  planProjectUpdates,
} from "./ready-issues-project.mjs";

// 注意: gh project field-list / item-list の実際の出力の形は実機未確認（計画 1.2 (f)）。
// ProjectItem = { id, status, content: { type, number, repository } } は想定であり、
// Status の値は item-list の `status` キーに入る想定（Q6）。

const REPO = "owner/repo";
const OTHER_REPO = "owner/other";

const statusField = (optionNames: string[]) => ({
  id: "F1",
  name: "Status",
  options: optionNames.map((name, i) => ({ id: `O${i}`, name })),
});

const item = (
  id: string,
  status: string | null,
  content: {
    type: string;
    number: number | null;
    repository: string | null;
  },
) => ({ id, status, content });

const candidate = (number: number, specNumber: string, name: string) => ({
  issue: {
    number,
    title: `[feat] ${specNumber} ${name}`,
    state: "OPEN" as const,
    url: `https://github.com/owner/repo/issues/${number}`,
  },
  specNumber,
  dependencies: ["0003"],
  assumed: [],
});

const planEntry = (
  issueNumber: number,
  action: "update" | "keep" | "absent",
  currentStatus: string | null,
) => ({
  issueNumber,
  specNumber: "0008",
  title: "[feat] 0008 詳細ページ",
  action,
  issueUrl: `https://github.com/owner/repo/issues/${issueNumber}`,
  currentStatus,
});

describe("findStatusField", () => {
  it("AC-19: Status フィールドと Ready の選択肢があるとき ok を返す", () => {
    const result = findStatusField([
      { id: "T", name: "Title" },
      statusField(["Backlog", "Ready", "In progress"]),
    ]);

    expect(result).toEqual({ ok: true });
  });

  it.each([
    {
      label: "Status が無い",
      fields: [
        { id: "T", name: "Title" },
        { id: "A", name: "Assignees" },
      ],
      message:
        "Status フィールドが見つかりません（存在したフィールド: Title, Assignees）",
    },
    {
      label: "名前の大文字小文字が違う（status）",
      fields: [{ ...statusField(["Ready"]), name: "status" }],
      message:
        "Status フィールドが見つかりません（存在したフィールド: status）",
    },
    {
      label: "フィールドが空",
      fields: [],
      message: "Status フィールドが見つかりません（存在したフィールド: ）",
    },
  ])(
    "AC-19: $label とき、存在したフィールド名の一覧を含む理由を返す",
    ({ fields, message }) => {
      const result = findStatusField(fields);

      expect(result).toEqual({ ok: false, message });
    },
  );

  it.each([
    {
      label: "Ready が無い",
      options: ["Todo", "In Progress", "Done"],
      message:
        "Status の選択肢に Ready がありません（存在した選択肢: Todo, In Progress, Done）",
    },
    {
      label: "ready（小文字）しか無い",
      options: ["Backlog", "ready"],
      message:
        "Status の選択肢に Ready がありません（存在した選択肢: Backlog, ready）",
    },
  ])(
    "AC-19: Status の選択肢に $label とき、存在した選択肢の一覧を含む理由を返す",
    ({ options, message }) => {
      const result = findStatusField([statusField(options)]);

      expect(result).toEqual({ ok: false, message });
    },
  );

  it("AC-19: Status に選択肢が無い（options 未定義）とき、選択肢の理由を返す", () => {
    const result = findStatusField([{ id: "F1", name: "Status" }]);

    expect(result).toEqual({
      ok: false,
      message: "Status の選択肢に Ready がありません（存在した選択肢: ）",
    });
  });
});

describe("planProjectUpdates", () => {
  it("AC-14/15: Backlog は update、In progress は keep、ボードに無い候補は absent になる", () => {
    const candidates = [
      candidate(8, "0008", "詳細ページ"),
      candidate(9, "0009", "戻る導線"),
      candidate(10, "0010", "状態表示"),
    ];
    const items = [
      item("I8", "Backlog", { type: "Issue", number: 8, repository: REPO }),
      item("I9", "In progress", { type: "Issue", number: 9, repository: REPO }),
    ];

    const plan = planProjectUpdates({ candidates, items, repository: REPO });

    expect(plan).toEqual([
      {
        issueNumber: 8,
        specNumber: "0008",
        title: "[feat] 0008 詳細ページ",
        action: "update",
        issueUrl: "https://github.com/owner/repo/issues/8",
        currentStatus: "Backlog",
      },
      {
        issueNumber: 9,
        specNumber: "0009",
        title: "[feat] 0009 戻る導線",
        action: "keep",
        issueUrl: "https://github.com/owner/repo/issues/9",
        currentStatus: "In progress",
      },
      {
        issueNumber: 10,
        specNumber: "0010",
        title: "[feat] 0010 状態表示",
        action: "absent",
        issueUrl: "https://github.com/owner/repo/issues/10",
        currentStatus: null,
      },
    ]);
  });

  it("AC-16: Status が Ready の候補は keep になり、update が 0 件である", () => {
    const candidates = [candidate(8, "0008", "詳細ページ")];
    const items = [
      item("I8", "Ready", { type: "Issue", number: 8, repository: REPO }),
    ];

    const plan = planProjectUpdates({ candidates, items, repository: REPO });

    expect(plan.map((e) => e.action)).toEqual(["keep"]);
    expect(plan[0]?.currentStatus).toBe("Ready");
    expect(plan.filter((e) => e.action === "update")).toHaveLength(0);
  });

  it("AC-14: Status の値が無い項目は keep になり、現在の値は null である", () => {
    const candidates = [candidate(8, "0008", "詳細ページ")];
    const items = [
      item("I8", null, { type: "Issue", number: 8, repository: REPO }),
    ];

    const plan = planProjectUpdates({ candidates, items, repository: REPO });

    expect(plan.map((e) => [e.action, e.currentStatus])).toEqual([
      ["keep", null],
    ]);
  });

  it.each([
    {
      label: "別のリポジトリの同じ番号の Issue",
      content: { type: "Issue", number: 8, repository: OTHER_REPO },
    },
    {
      label: "同じ番号の Pull Request",
      content: { type: "PullRequest", number: 8, repository: REPO },
    },
    {
      label: "下書き（DraftIssue）",
      content: { type: "DraftIssue", number: null, repository: null },
    },
  ])("補強: $label の項目とは照合せず absent になる", ({ content }) => {
    const candidates = [candidate(8, "0008", "詳細ページ")];
    const items = [item("X", "Backlog", content)];

    const plan = planProjectUpdates({ candidates, items, repository: REPO });

    expect(plan.map((e) => e.action)).toEqual(["absent"]);
  });

  it("補強: 紛らわしい項目が先にあっても、同じリポジトリの Issue の項目と照合する", () => {
    const candidates = [candidate(8, "0008", "詳細ページ")];
    const items = [
      item("X1", "Ready", { type: "Issue", number: 8, repository: OTHER_REPO }),
      item("X2", "Ready", { type: "PullRequest", number: 8, repository: REPO }),
      item("I8", "Backlog", { type: "Issue", number: 8, repository: REPO }),
    ];

    const plan = planProjectUpdates({ candidates, items, repository: REPO });

    expect(plan.map((e) => [e.action, e.currentStatus])).toEqual([
      ["update", "Backlog"],
    ]);
  });
});

describe("formatPlan", () => {
  it.each([
    {
      label: "Backlog は更新予定",
      entry: planEntry(8, "update", "Backlog"),
      line: "#8 0008 詳細ページ: Backlog → Ready（更新予定）",
    },
    {
      label: "In progress は変更しない",
      entry: planEntry(8, "keep", "In progress"),
      line: "#8 0008 詳細ページ: 変更しない（現在: In progress）",
    },
    {
      label: "Ready は変更しない",
      entry: planEntry(8, "keep", "Ready"),
      line: "#8 0008 詳細ページ: 変更しない（現在: Ready）",
    },
    {
      label: "Status の値が無いときは なし",
      entry: planEntry(8, "keep", null),
      line: "#8 0008 詳細ページ: 変更しない（現在: なし）",
    },
    {
      label: "ボードに無い",
      entry: planEntry(8, "absent", null),
      line: "#8 0008 詳細ページ: ボードに無い",
    },
  ])("AC-14: 表示は $label", ({ entry, line }) => {
    expect(formatPlan([entry])).toEqual([line]);
  });

  it("AC-14: 複数の候補を渡した順に 1 件 1 行で表示する", () => {
    const lines = formatPlan([
      planEntry(8, "update", "Backlog"),
      planEntry(9, "absent", null),
    ]);

    expect(lines).toEqual([
      "#8 0008 詳細ページ: Backlog → Ready（更新予定）",
      "#9 0008 詳細ページ: ボードに無い",
    ]);
  });

  it("AC-21: 表示にタイトルや Status の制御文字（ESC）を含めない", () => {
    const entry = {
      ...planEntry(8, "keep", "\x1b[31mDone"),
      title: "[feat] 0008 \x1b[31m詳細",
    };

    const [line] = formatPlan([entry]);

    expect(line).toBe("#8 0008 [31m詳細: 変更しない（現在: [31mDone）");
  });
});
