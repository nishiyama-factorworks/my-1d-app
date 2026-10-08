// @vitest-environment node
//
// .claude/ のルールとスキルが、ルート直下構成（src/ なし）に合った表記であることを検査する（仕様 0016）。
// 限界:
// - フロントマターの解析は行ベースの簡易パーサで、`paths:` の下にブロック形式の列（`  - "…"`）が
//   並ぶ形だけを扱う。フロー形式（`paths: [a, b]`）やエスケープを含む引用符は扱わない。
//   扱えない形のときは null または項目数の不一致で失敗する（黙って通らない）。
// - `./src/` と `../src/`（直前が `.`）は仕様の AC-1 の定義に入らないので検出しない。
// - 走査対象は .claude/rules/*.md（直下のみ）と .claude/skills/**/SKILL.md だけ。
//   CLAUDE.md・docs/・tests/・agents・commands・checklist.md は走査しない。
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");

type SrcHit = { line: number; text: string };
type PathsComparison = {
  missing: string[];
  extra: string[];
  duplicates: string[];
};

// ---- ファイル集め ----

function collectFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(full) : [full];
  });
}

/** base からの相対パス（`/` 区切り）に直す。Windows の `\` 対策 */
function toRelative(file: string, base: string = root): string {
  return path.relative(base, file).split(path.sep).join("/");
}

// ---- 判定・解析（純粋関数／列挙） ----
/** base/.claude の rules 直下の *.md と、skills 配下の SKILL.md を base 相対の `/` 区切りで返す */
function listScanTargets(base: string = root): string[] {
  const rulesDir = path.join(base, ".claude", "rules");
  const skillsDir = path.join(base, ".claude", "skills");
  const rules = existsSync(rulesDir)
    ? readdirSync(rulesDir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith(".md"))
        .map((e) => path.join(rulesDir, e.name))
    : [];
  const skills = existsSync(skillsDir)
    ? collectFiles(skillsDir).filter((f) => path.basename(f) === "SKILL.md")
    : [];
  return [...rules, ...skills].map((f) => toRelative(f, base)).sort();
}

/** 行頭、または空白・引用符・バッククォート・括弧の直後の src/ を含む行を返す（行番号は 1 始まり） */
function findSrcPaths(text: string): SrcHit[] {
  const pattern = /(?:^|[\s"'`(\[{（「『])src\//;
  return text
    .split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, text: line }))
    .filter((hit) => pattern.test(hit.text));
}

/** 先頭の BOM を除いて行に分け、フロントマターの範囲 [1, end) を返す。無ければ null */
function splitFrontmatter(
  text: string,
): { lines: string[]; end: number } | null {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  if (lines[0] !== "---") return null;
  const end = lines.findIndex((line, i) => i > 0 && line === "---");
  return end === -1 ? null : { lines, end };
}

function parseFrontmatterPaths(text: string): string[] | null {
  const parts = splitFrontmatter(text);
  if (parts === null) return null;
  const front = parts.lines.slice(1, parts.end);
  const start = front.findIndex((line) => /^paths:\s*$/.test(line));
  if (start === -1) return null;
  const items: string[] = [];
  for (const line of front.slice(start + 1)) {
    const match = /^\s+-\s+(.*)$/.exec(line);
    if (match === null) break;
    const value = match[1].trim();
    const quoted = /^"(.*)"$/.exec(value) ?? /^'(.*)'$/.exec(value);
    items.push(quoted === null ? value : quoted[1]);
  }
  return items;
}

function extractBody(text: string): string {
  const parts = splitFrontmatter(text);
  if (parts === null) return text.replace(/^﻿/, "");
  return parts.lines.slice(parts.end + 1).join("\n");
}

/** 順序は問わず、期待に対する欠落・余分・重複を返す */
function comparePaths(actual: string[], expected: string[]): PathsComparison {
  const unique = (values: string[]) => [...new Set(values)];
  return {
    missing: expected.filter((p) => !actual.includes(p)),
    extra: unique(actual.filter((p) => !expected.includes(p))),
    duplicates: unique(actual.filter((p, i) => actual.indexOf(p) !== i)),
  };
}

function isDirectory(target: string): boolean {
  return existsSync(target) && statSync(target).isDirectory();
}

/** base 直下に app/ と features/ があり、src が無いことを検査し、問題の一覧を返す */
function checkRootLayout(base: string = root): string[] {
  const problems: string[] = [];
  for (const name of ["app", "features"]) {
    if (!isDirectory(path.join(base, name))) {
      problems.push(`${name}/ がディレクトリとして存在しない`);
    }
  }
  if (existsSync(path.join(base, "src"))) problems.push("src/ が存在する");
  return problems;
}

// ---- テスト ----

const NEXTJS_RULE = ".claude/rules/10-nextjs.md";
const EXPECTED_PATHS = [
  "app/**/*.{ts,tsx}",
  "features/**/*.{ts,tsx}",
  "next.config.*",
  "middleware.ts",
  "proxy.ts",
];

function readRepoFile(relative: string): string {
  return readFileSync(path.join(root, relative), "utf-8");
}

/** 本文のうち「`page.tsx` は薄く保つ」を含む行 */
function findPageThinLine(body: string): string | undefined {
  return body.split(/\r?\n/).find((l) => l.includes("`page.tsx` は薄く保つ"));
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "claude-paths-"));
  tempDirs.push(dir);
  return dir;
}

function touch(base: string, relative: string): void {
  const full = path.join(base, ...relative.split("/"));
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, "");
}

describe("走査の前提", () => {
  it("AC-1（前提）: 走査対象に .claude/rules/10-nextjs.md・skills/nextjs-feature-scaffold/SKILL.md・skills/spec-writing/SKILL.md を含む rules の 7 ファイルと SKILL.md の 3 ファイルが含まれる", () => {
    const targets = listScanTargets();

    expect(targets).toEqual(
      expect.arrayContaining([
        ".claude/rules/00-workflow.md",
        ".claude/rules/10-nextjs.md",
        ".claude/rules/20-typescript.md",
        ".claude/rules/30-testing.md",
        ".claude/rules/40-security.md",
        ".claude/rules/50-git-and-pr.md",
        ".claude/rules/60-docs.md",
        ".claude/skills/nextjs-feature-scaffold/SKILL.md",
        ".claude/skills/review-checklist/SKILL.md",
        ".claude/skills/spec-writing/SKILL.md",
      ]),
    );
  });

  it("AC-1（前提）: 走査対象に CLAUDE.md・docs/・tests/・.claude/agents/・.claude/commands/・checklist.md が含まれない", () => {
    const targets = listScanTargets();

    expect(targets.length).toBeGreaterThan(0);
    expect(
      targets.filter(
        (t) =>
          t === "CLAUDE.md" ||
          t.startsWith("docs/") ||
          t.startsWith("tests/") ||
          t.startsWith(".claude/agents/") ||
          t.startsWith(".claude/commands/") ||
          path.posix.basename(t) === "checklist.md",
      ),
    ).toEqual([]);
  });

  it("AC-1（前提）: listScanTargets は一時ディレクトリの rules/*.md と skills/**/SKILL.md だけを / 区切りで列挙する", () => {
    const dir = makeTempDir();
    touch(dir, ".claude/rules/a.md");
    touch(dir, ".claude/rules/sub/b.md");
    touch(dir, ".claude/skills/x/SKILL.md");
    touch(dir, ".claude/skills/x/checklist.md");
    touch(dir, ".claude/skills/y/z/SKILL.md");
    touch(dir, ".claude/agents/c.md");

    const targets = listScanTargets(dir);

    expect(targets).toEqual([
      ".claude/rules/a.md",
      ".claude/skills/x/SKILL.md",
      ".claude/skills/y/z/SKILL.md",
    ]);
  });

  it("AC-2（前提）: 10-nextjs.md のフロントマターの paths が解析でき、1 件以上ある", () => {
    const parsed = parseFrontmatterPaths(readRepoFile(NEXTJS_RULE));

    expect(parsed).not.toBeNull();
    expect(parsed?.length).toBeGreaterThan(0);
  });

  it("AC-3（前提）: 10-nextjs.md の本文に「page.tsx は薄く保つ」の行がある", () => {
    const body = extractBody(readRepoFile(NEXTJS_RULE));

    expect(findPageThinLine(body)).toBeDefined();
  });
});

describe("src/ の検出", () => {
  it.each([
    { label: "行頭", text: "src/features/<feature>/" },
    { label: "字下げの後", text: "  src/app/<route>/" },
    { label: "ダブルクォートの直後", text: '  - "src/app/**/*.{ts,tsx}"' },
    { label: "シングルクォートの直後", text: "paths: 'src/x'" },
    { label: "バッククォートの直後", text: "`src/` に置く" },
    { label: "丸括弧の直後", text: "(src/x)" },
    { label: "角括弧の直後", text: "[src/x]" },
    { label: "波括弧の直後", text: "{src/x}" },
    { label: "全角の丸括弧の直後", text: "（src/x）" },
    { label: "全角のかぎ括弧の直後", text: "「src/x」" },
  ])("AC-1（検出）: $label の src/ を検出する", ({ text }) => {
    expect(findSrcPaths(text)).toEqual([{ line: 1, text }]);
  });

  it.each([
    { label: "docs/src/（直前が /）", text: "docs/src/x" },
    { label: "mysrc/", text: "mysrc/x" },
    { label: "resources/", text: "resources/x" },
    { label: "srcs/", text: "srcs/x" },
    { label: "src_dir/", text: "src_dir/x" },
    { label: "スラッシュなしの src", text: "src" },
    { label: '<img src="/x" />（src=）', text: '<img src="/x" />' },
    { label: "SRC_REGEX", text: "SRC_REGEX=..." },
    { label: "空文字列", text: "" },
    { label: "./src/（直前が . ・仕様の定義の外）", text: "./src/x" },
  ])("AC-1（検出）: $label は検出しない", ({ text }) => {
    expect(findSrcPaths(text)).toEqual([]);
  });

  it("AC-1（検出）: 複数行の文字列で、該当する行の行番号（1 始まり）と内容を返す", () => {
    const text = "a\r\nb\r\n  src/app/x\r\nc\r\n`src/` と書く\r\n";

    expect(findSrcPaths(text)).toEqual([
      { line: 3, text: "  src/app/x" },
      { line: 5, text: "`src/` と書く" },
    ]);
  });
});

describe("フロントマターの解析", () => {
  it("AC-2（解析）: ダブルクォート・シングルクォート・引用符なしの項目を取り出し、{ts,tsx} の波括弧をそのまま残す", () => {
    const text = [
      "---",
      "paths:",
      '  - "app/**/*.{ts,tsx}"',
      "  - 'features/**/*.{ts,tsx}'",
      "  - next.config.*  ",
      "---",
      "",
      "本文",
    ].join("\n");

    expect(parseFrontmatterPaths(text)).toEqual([
      "app/**/*.{ts,tsx}",
      "features/**/*.{ts,tsx}",
      "next.config.*",
    ]);
  });

  it("AC-2（解析）: paths の後ろに別のキーがあるとき、そこで止まる", () => {
    const text = [
      "---",
      "paths:",
      '  - "a"',
      '  - "b"',
      "other:",
      '  - "c"',
      "---",
    ].join("\n");

    expect(parseFrontmatterPaths(text)).toEqual(["a", "b"]);
  });

  it("AC-2（解析）: CRLF の改行と先頭の BOM でも解析できる", () => {
    const text = '﻿---\r\npaths:\r\n  - "a"\r\n  - "b"\r\n---\r\n本文\r\n';

    expect(parseFrontmatterPaths(text)).toEqual(["a", "b"]);
    expect(extractBody(text)).toBe("本文\n");
  });

  it("AC-2（解析）: フロントマターが無い、または paths が無いとき null を返す", () => {
    expect(parseFrontmatterPaths('# 見出し\n\n  - "a"\n')).toBeNull();
    expect(parseFrontmatterPaths('---\ntitle: x\n---\n  - "a"\n')).toBeNull();
  });

  it('AC-2（解析）: 本文の --- や - "…" の行を paths に含めない', () => {
    const text = [
      "---",
      "paths:",
      '  - "a"',
      "---",
      "",
      "本文",
      "---",
      '  - "b"',
      '- "c"',
    ].join("\n");

    expect(parseFrontmatterPaths(text)).toEqual(["a"]);
  });
});

describe("paths の比較", () => {
  it("AC-2（判定）: 期待どおりのとき missing・extra・duplicates がすべて空", () => {
    const reversed = [...EXPECTED_PATHS].reverse();

    expect(comparePaths(EXPECTED_PATHS, EXPECTED_PATHS)).toEqual({
      missing: [],
      extra: [],
      duplicates: [],
    });
    expect(comparePaths(reversed, EXPECTED_PATHS)).toEqual({
      missing: [],
      extra: [],
      duplicates: [],
    });
  });

  it("AC-2（判定）: 欠落・余分・重複をそれぞれ返す", () => {
    const actual = [
      "src/app/**/*.{ts,tsx}",
      "app/**/*.{ts,tsx}",
      "app/**/*.{ts,tsx}",
      "next.config.*",
      "middleware.ts",
      "proxy.ts",
    ];

    expect(comparePaths(actual, EXPECTED_PATHS)).toEqual({
      missing: ["features/**/*.{ts,tsx}"],
      extra: ["src/app/**/*.{ts,tsx}"],
      duplicates: ["app/**/*.{ts,tsx}"],
    });
  });
});

describe("ルート直下の構成の判定", () => {
  it("AC-4（判定）: app/ と features/ があり src/ が無いとき問題なし", () => {
    const dir = makeTempDir();
    mkdirSync(path.join(dir, "app"));
    mkdirSync(path.join(dir, "features"));

    expect(checkRootLayout(dir)).toEqual([]);
  });

  it("AC-4（判定）: src/ ディレクトリ、または src ファイルがあるとき問題を返す", () => {
    const withDir = makeTempDir();
    mkdirSync(path.join(withDir, "app"));
    mkdirSync(path.join(withDir, "features"));
    mkdirSync(path.join(withDir, "src"));
    const withFile = makeTempDir();
    mkdirSync(path.join(withFile, "app"));
    mkdirSync(path.join(withFile, "features"));
    writeFileSync(path.join(withFile, "src"), "");

    expect(checkRootLayout(withDir)).toEqual(["src/ が存在する"]);
    expect(checkRootLayout(withFile)).toEqual(["src/ が存在する"]);
  });

  it("AC-4（判定）: app/ または features/ が無い、またはディレクトリでなくファイルのとき問題を返す", () => {
    const noApp = makeTempDir();
    mkdirSync(path.join(noApp, "features"));
    const noFeatures = makeTempDir();
    mkdirSync(path.join(noFeatures, "app"));
    const fileApp = makeTempDir();
    writeFileSync(path.join(fileApp, "app"), "");
    mkdirSync(path.join(fileApp, "features"));

    expect(checkRootLayout(noApp)).toEqual([
      "app/ がディレクトリとして存在しない",
    ]);
    expect(checkRootLayout(noFeatures)).toEqual([
      "features/ がディレクトリとして存在しない",
    ]);
    expect(checkRootLayout(fileApp)).toEqual([
      "app/ がディレクトリとして存在しない",
    ]);
  });
});

describe("AC-1: rules と skills にパスとしての src/ が無い", () => {
  it("AC-1: .claude/rules/*.md と .claude/skills/**/SKILL.md に、パスとしての src/ が 1 件も無い", () => {
    const violations = listScanTargets().flatMap((file) =>
      findSrcPaths(readRepoFile(file)).map(
        (hit) => `${file}:${hit.line}: ${hit.text}`,
      ),
    );

    expect(violations).toEqual([]);
  });
});

describe("AC-2: 10-nextjs.md の paths", () => {
  it("AC-2: paths が app/**・features/**・next.config.*・middleware.ts・proxy.ts の 5 つちょうどで、重複が無い", () => {
    const actual = parseFrontmatterPaths(readRepoFile(NEXTJS_RULE)) ?? [];

    expect(comparePaths(actual, EXPECTED_PATHS)).toEqual({
      missing: [],
      extra: [],
      duplicates: [],
    });
  });
});

describe("AC-3: 10-nextjs.md の本文", () => {
  it("AC-3: page.tsx のロジックの置き場所が「features/<名前>/ に置く」と書かれている", () => {
    const body = extractBody(readRepoFile(NEXTJS_RULE));
    const line = findPageThinLine(body);

    expect(line).toBeDefined();
    expect(line).toContain("`features/<名前>/` に置く");
  });
});

describe("AC-4: ルート直下の構成", () => {
  it("AC-4: リポジトリのルートに app/ と features/ があり、src/ が無い", () => {
    expect(checkRootLayout(root)).toEqual([]);
  });
});
