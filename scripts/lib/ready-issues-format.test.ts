// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  formatClassification,
  sanitizeForTerminal,
} from "./ready-issues-format.mjs";

describe("sanitizeForTerminal", () => {
  it("AC-21: ESC・CR・LF・DEL・C1 制御文字を取り除き、通常の文字は残す", () => {
    expect(sanitizeForTerminal("\x1b[31m赤\x1b[0m")).toBe("[31m赤[0m");
    expect(sanitizeForTerminal("a\r\nb")).toBe("ab");
    expect(sanitizeForTerminal("a\x7fb")).toBe("ab");
    expect(sanitizeForTerminal("a\u009bb")).toBe("ab");
    expect(sanitizeForTerminal("日本語🎉✓ abc")).toBe("日本語🎉✓ abc");
  });

  it("AC-21: 表示を偽装できる書式制御文字（U+202E 右から左への上書き、U+200B ゼロ幅スペース）も取り除く", () => {
    expect(sanitizeForTerminal("a‮b​c")).toBe("abc");
  });
});

describe("formatClassification", () => {
  it("AC-21: タイトルに ESC を含む Issue を整形した行に \\x1b が含まれない", () => {
    const lines = formatClassification({
      ready: [
        {
          issue: {
            number: 8,
            title: "[feat] 0008 \x1b[31m詳細ページ\x1b[0m",
            state: "OPEN",
          },
          specNumber: "0008",
          dependencies: ["0003"],
          assumed: [],
        },
      ],
      waiting: [],
      warnings: [],
    });

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join("\n")).not.toContain("\x1b");
    expect(lines).toContain("#8 0008 [31m詳細ページ[0m（依存: 0003 ✓）");
  });

  it("表示: ready は「#8 0008 詳細ページ（依存: 0003 ✓, 0004 ✓）」の形になる", () => {
    const lines = formatClassification({
      ready: [
        {
          issue: { number: 8, title: "[feat] 0008 詳細ページ", state: "OPEN" },
          specNumber: "0008",
          dependencies: ["0003", "0004"],
          assumed: [],
        },
      ],
      waiting: [],
      warnings: [],
    });

    expect(lines).toEqual([
      "== Ready にできる Issue（1件）==",
      "#8 0008 詳細ページ（依存: 0003 ✓, 0004 ✓）",
      "== 待ち（0件）==",
      "（なし）",
    ]);
  });

  it("AC-12: 仮定した Issue があると行末に「仮定: #8」を付ける", () => {
    const lines = formatClassification({
      ready: [
        {
          issue: { number: 9, title: "[feat] 0009 戻る導線", state: "OPEN" },
          specNumber: "0009",
          dependencies: ["0006", "0008"],
          assumed: [8],
        },
      ],
      waiting: [],
      warnings: [],
    });

    expect(lines).toContain("#9 0009 戻る導線（依存: 0006 ✓, 0008 ✓）仮定: #8");
  });

  it("AC-9/10/7: 待ちの行は「（待ち: 0008）」「0014 Issue なし」「0005 Issue が複数」を表示する", () => {
    const lines = formatClassification({
      ready: [],
      waiting: [
        {
          issue: { number: 9, title: "[feat] 0009 戻る導線", state: "OPEN" },
          specNumber: "0009",
          blockers: [{ specNumber: "0008", reason: "open", issueNumber: 8 }],
        },
        {
          issue: { number: 13, title: "[feat] 0013 E2E", state: "OPEN" },
          specNumber: "0013",
          blockers: [
            { specNumber: "0014", reason: "no-issue" },
            { specNumber: "0005", reason: "duplicate" },
          ],
        },
      ],
      warnings: [],
    });

    expect(lines).toEqual([
      "== Ready にできる Issue（0件）==",
      "（なし）",
      "== 待ち（2件）==",
      "#9 0009 戻る導線（待ち: 0008）",
      "#13 0013 E2E（待ち: 0014 Issue なし, 0005 Issue が複数）",
    ]);
  });

  it("0 件のときは見出しの下に「（なし）」を表示する", () => {
    const lines = formatClassification({
      ready: [],
      waiting: [],
      warnings: [],
    });

    expect(lines).toEqual([
      "== Ready にできる Issue（0件）==",
      "（なし）",
      "== 待ち（0件）==",
      "（なし）",
    ]);
  });

  it("警告は最後に 1 行ずつ表示する", () => {
    const lines = formatClassification({
      ready: [],
      waiting: [],
      warnings: ["警告: その1", "警告: その2"],
    });

    expect(lines.slice(-2)).toEqual(["警告: その1", "警告: その2"]);
  });

  it("AC-21: 警告にも制御文字（ESC）が含まれていれば取り除く（多層防御）", () => {
    const lines = formatClassification({
      ready: [],
      waiting: [],
      warnings: ["\x1b[31m警告: 赤\x1b[0m"],
    });

    expect(lines.at(-1)).toBe("[31m警告: 赤[0m");
    expect(lines.join("\n")).not.toContain("\x1b");
  });

  it("AC-21: 仕様番号や依存先の番号にも制御文字（ESC）が含まれていれば取り除く（多層防御）", () => {
    const lines = formatClassification({
      ready: [
        {
          issue: { number: 8, title: "[feat] 0008 詳細ページ", state: "OPEN" },
          specNumber: "\x1b[31m0008",
          dependencies: ["\x1b[31m0003"],
          assumed: [],
        },
      ],
      waiting: [
        {
          issue: { number: 9, title: "[feat] 0009 戻る導線", state: "OPEN" },
          specNumber: "\x1b[31m0009",
          blockers: [{ specNumber: "\x1b[31m0008", reason: "no-issue" }],
        },
      ],
      warnings: [],
    });

    expect(lines.join("\n")).not.toContain("\x1b");
  });
});
