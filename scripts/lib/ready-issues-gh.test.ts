// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  fieldListArgs,
  isMissingScopes,
  issueListArgs,
  itemEditArgs,
  itemListArgs,
  parseFieldList,
  parseItemList,
  parseIssueList,
  parseRepoView,
  repoViewArgs,
} from "./ready-issues-gh.mjs";

// 注意: gh project の実際の JSON の形は実機未確認（計画 1.2 (f)）。想定に基づく。

const json = (value: unknown) => JSON.stringify(value);

describe("引数の組み立て", () => {
  it("AC-12: issueListArgs は issue list の引数を返す", () => {
    expect(issueListArgs()).toEqual([
      "issue",
      "list",
      "--state",
      "all",
      "--json",
      "number,title,state,url",
      "--limit",
      "1000",
    ]);
  });

  it("AC-14: repoViewArgs は repo view の引数を返す", () => {
    expect(repoViewArgs()).toEqual(["repo", "view", "--json", "nameWithOwner"]);
  });

  it("AC-14: fieldListArgs は番号を文字列にして field-list の引数を返す", () => {
    expect(fieldListArgs(3, "owner")).toEqual([
      "project",
      "field-list",
      "3",
      "--owner",
      "owner",
      "--format",
      "json",
    ]);
  });

  it("AC-14: itemListArgs は --limit 1000 つきの item-list の引数を返す", () => {
    expect(itemListArgs(3, "owner")).toEqual([
      "project",
      "item-list",
      "3",
      "--owner",
      "owner",
      "--format",
      "json",
      "--limit",
      "1000",
    ]);
  });

  it("AC-15: itemEditArgs は Issue の URL で Status を Ready にする引数を返す", () => {
    expect(
      itemEditArgs(3, "owner", "https://github.com/owner/repo/issues/8"),
    ).toEqual([
      "project",
      "item-edit",
      "3",
      "--owner",
      "owner",
      "--url",
      "https://github.com/owner/repo/issues/8",
      "--field",
      "Status",
      "--value",
      "Ready",
    ]);
  });
});

describe("parseIssueList", () => {
  const issue = (over: Record<string, unknown> = {}) => ({
    number: 8,
    title: "[feat] 0008 詳細ページ",
    state: "OPEN",
    url: "https://github.com/owner/repo/issues/8",
    ...over,
  });

  it("AC-12: 想定の JSON を型付きの値にし、余分なキーは無視する", () => {
    const result = parseIssueList(
      json([issue(), issue({ number: 9, state: "CLOSED", extra: "x" })]),
    );
    expect(result).toEqual([issue(), issue({ number: 9, state: "CLOSED" })]);
  });

  it("AC-12: 空配列は空配列を返す", () => {
    expect(parseIssueList("[]")).toEqual([]);
  });

  it.each([
    ["配列でない", json({ issues: [] })],
    ["number が文字列", json([issue({ number: "8" })])],
    ["state が想定外（MERGED）", json([issue({ state: "MERGED" })])],
    ["url が無い", json([{ number: 8, title: "t", state: "OPEN" }])],
    ["JSON として不正", "not json"],
  ])("AC-12: %s ときは例外を投げる", (_name, stdout) => {
    expect(() => parseIssueList(stdout)).toThrow();
  });
});

describe("parseRepoView", () => {
  it("AC-14: nameWithOwner を返す", () => {
    expect(
      parseRepoView(json({ nameWithOwner: "owner/repo", extra: 1 })),
    ).toEqual({ nameWithOwner: "owner/repo" });
  });

  it.each([
    ["スラッシュ無し", json({ nameWithOwner: "ownerrepo" })],
    ["空文字", json({ nameWithOwner: "" })],
    ["非文字列", json({ nameWithOwner: 1 })],
    ["キーが無い", json({})],
    ["JSON として不正", "{"],
  ])("AC-14: %s のときは例外を投げる", (_name, stdout) => {
    expect(() => parseRepoView(stdout)).toThrow();
  });
});

describe("parseFieldList", () => {
  it("AC-14: fields を ProjectField[] にし、options が無いフィールドは options 無しで返す", () => {
    const result = parseFieldList(
      json({
        fields: [
          { id: "F0", name: "Title", type: "ProjectV2Field" },
          {
            id: "F1",
            name: "Status",
            type: "ProjectV2SingleSelectField",
            options: [
              { id: "O1", name: "Backlog", extra: 1 },
              { id: "O2", name: "Ready" },
            ],
          },
        ],
      }),
    );
    expect(result).toEqual([
      { id: "F0", name: "Title" },
      {
        id: "F1",
        name: "Status",
        options: [
          { id: "O1", name: "Backlog" },
          { id: "O2", name: "Ready" },
        ],
      },
    ]);
    expect(result[0]).not.toHaveProperty("options");
  });

  it.each([
    ["fields が配列でない", json({ fields: {} })],
    ["fields が無い", json({})],
    ["id が文字列でない", json({ fields: [{ id: 1, name: "Status" }] })],
    ["name が文字列でない", json({ fields: [{ id: "F", name: 2 }] })],
    [
      "options が配列でない",
      json({ fields: [{ id: "F", name: "Status", options: "x" }] }),
    ],
    ["JSON として不正", "oops"],
  ])("AC-14: %s のときは例外を投げる", (_name, stdout) => {
    expect(() => parseFieldList(stdout)).toThrow();
  });
});

describe("parseItemList", () => {
  it("AC-14: items を ProjectItem[] にする（status が無ければ null）", () => {
    const result = parseItemList(
      json({
        totalCount: 2,
        items: [
          {
            id: "I1",
            status: "Backlog",
            content: { type: "Issue", number: 8, repository: "owner/repo" },
          },
          {
            id: "I2",
            content: { type: "Issue", number: 9, repository: "owner/repo" },
          },
        ],
      }),
    );
    expect(result).toEqual([
      {
        id: "I1",
        status: "Backlog",
        content: { type: "Issue", number: 8, repository: "owner/repo" },
      },
      {
        id: "I2",
        status: null,
        content: { type: "Issue", number: 9, repository: "owner/repo" },
      },
    ]);
  });

  it("AC-14: content が無い・オブジェクトでない項目は空の content にして例外にしない", () => {
    const result = parseItemList(
      json({
        items: [
          { id: "D1", status: "Backlog" },
          { id: "D2", status: null, content: "draft" },
        ],
      }),
    );
    const empty = { type: "", number: null, repository: null };
    expect(result).toEqual([
      { id: "D1", status: "Backlog", content: empty },
      { id: "D2", status: null, content: empty },
    ]);
  });

  it.each([
    ["items が配列でない", json({ items: {} })],
    ["items が無い", json({})],
    ["id が文字列でない", json({ items: [{ id: 1, status: "Ready" }] })],
    ["JSON として不正", "["],
  ])("AC-14: %s のときは例外を投げる", (_name, stdout) => {
    expect(() => parseItemList(stdout)).toThrow();
  });
});

describe("isMissingScopes", () => {
  it.each([
    [
      "AC-18: missing required scopes を含むと true",
      "error: your authentication token is missing required scopes [project]",
      true,
    ],
    [
      "AC-18: 大文字小文字が違っても true",
      "Missing Required Scopes [read:project]",
      true,
    ],
    ["AC-18: 一致しないと false", "could not resolve to a Project", false],
    ["AC-18: 空文字は false", "", false],
  ])("%s", (_name, stderr, expected) => {
    expect(isMissingScopes(stderr)).toBe(expected);
  });
});
