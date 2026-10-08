// @vitest-environment node
//
// README.md の構造を検査する（仕様 0012）。T1 の範囲: 見出し・相対パスの実在・秘密らしい文字列の不在。
// 限界:
// - 行ベースの簡易解析。Setext 形式の見出し（`===` の下線）・HTML の見出し・参照形式のリンク（`[a][b]`）は扱わない。
// - 相対パスの「未作成」除外は行単位。「未作成」と書いた行にある `components/` 配下のパスだけを除く
//   （同じ行の他のパスは検査する）。
// - 文章の妥当性は検査しない（レビューで確認する）。
import {
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

type Heading = { level: 2 | 3; text: string };
type SecretHit = { line: number; text: string };

// ---- 判定・解析（純粋関数） ----

/** `##` と `###` の見出しを出現順に返す。フェンス内は除く。`####` 以下と `#` は返さない */
function extractHeadings(md: string): Heading[] {
  const headings: Heading[] = [];
  let fence: { char: string; length: number } | null = null;
  for (const line of splitLines(md)) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence === null) {
      if (fenceMatch !== null) {
        fence = { char: fenceMatch[1][0], length: fenceMatch[1].length };
        continue;
      }
    } else {
      if (
        fenceMatch !== null &&
        fenceMatch[1][0] === fence.char &&
        fenceMatch[1].length >= fence.length
      ) {
        fence = null;
      }
      continue;
    }
    const match = /^(#{2,3})[ \t]+(.+?)[ \t]*$/.exec(line);
    if (match !== null) {
      headings.push({ level: match[1].length === 2 ? 2 : 3, text: match[2] });
    }
  }
  return headings;
}

/** README 内の相対パス（リンクの target と、バッククォート内のリポジトリ内パス）を重複なしで返す */
function findRelativePaths(md: string): string[] {
  const found: string[] = [];
  for (const line of linesOutsideFences(md)) {
    const uncreated = line.includes("未作成");
    const candidates: string[] = [];
    for (const m of line.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = linkTargetToPath(m[1]);
      if (target !== null) candidates.push(target);
    }
    for (const m of line.matchAll(/`([^`\n]+)`/g)) {
      if (isRepoPathInCode(m[1])) candidates.push(m[1]);
    }
    for (const candidate of candidates) {
      if (uncreated && candidate.startsWith("components/")) continue;
      found.push(candidate);
    }
  }
  return [...new Set(found)];
}

/** rel の各セグメントを大文字小文字まで含めて readdir の名前と照合し、実在するかを返す */
function existsExactCase(base: string, rel: string): boolean {
  const segments = rel.split("/").filter((s) => s !== "" && s !== ".");
  if (segments.includes("..")) return false;
  let current = base;
  for (const segment of segments) {
    let names: string[];
    try {
      names = readdirSync(current);
    } catch {
      // ディレクトリでない（ファイルの下を指している）か読めない場合は実在しない扱い
      return false;
    }
    if (!names.includes(segment)) return false;
    current = path.join(current, segment);
  }
  // 末尾が / のときはディレクトリであること
  return !rel.endsWith("/") || isDirectory(current);
}

/** トークン形式（接頭辞）と `GITHUB_TOKEN=` に続く値を含む行を返す */
function findSecretLike(md: string): SecretHit[] {
  const hits: SecretHit[] = [];
  splitLines(md).forEach((text, index) => {
    if (
      text.includes("ghp_") ||
      text.includes("github_pat_") ||
      /GITHUB_TOKEN[ \t]*=[ \t]*[^\s`]/.test(text)
    ) {
      hits.push({ line: index + 1, text });
    }
  });
  return hits;
}

// ---- 純粋関数の下請け ----

function splitLines(md: string): string[] {
  return md.replace(/^﻿/, "").split(/\r?\n/);
}

/** フェンス（``` / ~~~）の外の行だけを返す */
function linesOutsideFences(md: string): string[] {
  const result: string[] = [];
  let fence: { char: string; length: number } | null = null;
  for (const line of splitLines(md)) {
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence === null) {
      if (m !== null) fence = { char: m[1][0], length: m[1].length };
      else result.push(line);
    } else if (m !== null && m[1][0] === fence.char && m[1].length >= fence.length) {
      fence = null;
    }
  }
  return result;
}

const PLACEHOLDER = /[<>*{}]/;
const REPO_DIR_PREFIXES = [
  "docs/",
  "app/",
  "features/",
  "lib/",
  "components/",
  "tests/",
  "e2e/",
  "scripts/",
  ".claude/",
  ".github/",
];

/** Markdown リンクの target を相対パスに直す。対象外（外部・アンカー・絶対・プレースホルダー）は null */
function linkTargetToPath(target: string): string | null {
  if (/^(https?:|mailto:|#|\/)/i.test(target)) return null;
  const withoutFragment = target.split("#")[0].split("?")[0];
  if (withoutFragment === "" || PLACEHOLDER.test(withoutFragment)) return null;
  return withoutFragment;
}

/** バッククォート内の文字列が、リポジトリ内パスとして検査する対象か */
function isRepoPathInCode(code: string): boolean {
  if (/\s/.test(code) || PLACEHOLDER.test(code)) return false;
  if (REPO_DIR_PREFIXES.some((prefix) => code.startsWith(prefix))) return true;
  // ルート直下のファイル名。Git 管理外の .env 系は対象外
  return (
    !code.startsWith(".env") &&
    /^[A-Za-z0-9_.-]+\.(md|json|mjs|ts|yml|yaml|toml)$/.test(code)
  );
}

function isDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}

// ---- テスト補助 ----

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "readme-test-"));
  tempDirs.push(dir);
  return dir;
}

function touch(base: string, relative: string): void {
  const full = path.join(base, ...relative.split("/"));
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, "");
}

// トークン形式の完成形をソースに直書きしない（シークレットスキャナの誤検知を避ける）
const GHP_LIKE = "ghp" + "_" + "a".repeat(36);
const PAT_LIKE = "github" + "_pat_" + "b".repeat(30);

// ---- 純粋関数の陽性・陰性テスト（README に依存しない） ----

describe("extractHeadings", () => {
  it("AC-30a〜AC-30d（見出し判定）: ## と ### を出現順に返し、# と #### 以下は返さない", () => {
    const md = ["# タイトル", "## 概要", "### 小", "#### 深い", "##### もっと深い", "## 次"].join("\n");

    expect(extractHeadings(md)).toEqual([
      { level: 2, text: "概要" },
      { level: 3, text: "小" },
      { level: 2, text: "次" },
    ]);
  });

  it("AC-30a〜AC-30d（見出し判定）: ``` と ~~~ のフェンスの中の # 行を見出しにせず、閉じた後の見出しは返す", () => {
    const md = ["## a", "```bash", "## コメント", "```", "~~~", "### チルダ内", "~~~", "### b"].join("\n");

    expect(extractHeadings(md)).toEqual([
      { level: 2, text: "a" },
      { level: 3, text: "b" },
    ]);
  });

  it("AC-30a〜AC-30d（見出し判定）: 長いフェンスは同じ記号で同じ長さ以上の行でだけ閉じる", () => {
    const md = ["````", "```", "## x", "```", "````", "## y"].join("\n");

    expect(extractHeadings(md)).toEqual([{ level: 2, text: "y" }]);
  });

  it("AC-30a〜AC-30d（見出し判定）: CRLF・先頭の BOM・末尾の空白でも見出しの文字だけを返す", () => {
    const md = "﻿# t\r\n## a \r\n### b\t\r\n";

    expect(extractHeadings(md)).toEqual([
      { level: 2, text: "a" },
      { level: 3, text: "b" },
    ]);
  });

  it("AC-30a〜AC-30d（見出し判定）: # の後ろに空白が無い行は見出しにしない", () => {
    expect(extractHeadings("##x\n###y\n")).toEqual([]);
  });
});

describe("findRelativePaths", () => {
  it("AC-30f（パス抽出）: Markdown リンクの相対 target を返し、# の断片を落とす", () => {
    const md = "[仕様](docs/specs/0001-a.md) と [ADR](docs/adr/0005-b.md#decision)";

    expect(findRelativePaths(md)).toEqual(["docs/specs/0001-a.md", "docs/adr/0005-b.md"]);
  });

  it("AC-30f（パス抽出）: 外部 URL・mailto・ページ内アンカー・絶対パスのリンクは返さない", () => {
    const md = [
      "[a](https://example.com/x)",
      "[b](http://example.com/y)",
      "[c](mailto:someone@example.com)",
      "[d](#section)",
      "[e](/repos/foo)",
    ].join("\n");

    expect(findRelativePaths(md)).toEqual([]);
  });

  it("AC-30f（パス抽出）: プレースホルダーと glob を含むリンクは返さない", () => {
    const md = "[a](docs/<名前>/x.md) [b](app/**/page.tsx) [c](features/{a,b}/x.ts)";

    expect(findRelativePaths(md)).toEqual([]);
  });

  it("AC-30f（パス抽出）: バッククォート内の既知のディレクトリ始まりのパスとルート直下のファイル名を返す", () => {
    const md = [
      "`app/` `features/` `lib/` `tests/` `e2e/` `docs/` `scripts/verify.sh` `.claude/` `.github/`",
      "`CLAUDE.md` `package.json`",
    ].join("\n");

    expect(findRelativePaths(md)).toEqual([
      "app/",
      "features/",
      "lib/",
      "tests/",
      "e2e/",
      "docs/",
      "scripts/verify.sh",
      ".claude/",
      ".github/",
      "CLAUDE.md",
      "package.json",
    ]);
  });

  it("AC-30f（パス抽出）: コマンド・URL のパス・識別子・プレースホルダー・glob・Git 管理外の .env 系は返さない", () => {
    const md = [
      "`pnpm test`",
      "`bash scripts/verify.sh`",
      "`/`",
      "`/repos/[owner]/[repo]`",
      "`subscribers_count`",
      "`GITHUB_TOKEN`",
      "`features/<名前>/`",
      "`app/**/*.tsx`",
      "`features/{a,b}/`",
      "`.env.local`",
      "`.env.example`",
      "`Node.js`",
    ].join(" ");

    expect(findRelativePaths(md)).toEqual([]);
  });

  it("AC-30f（パス抽出）: フェンスの中のパスは返さない", () => {
    const md = ["```", "`app/` [x](docs/a.md)", "```"].join("\n");

    expect(findRelativePaths(md)).toEqual([]);
  });

  it("AC-30f（パス抽出）: 同じパスは 1 回だけ返す", () => {
    expect(findRelativePaths("`app/` と `app/` と [a](app/)")).toEqual(["app/"]);
  });

  it("AC-30f（パス抽出）: 「未作成」と書いた行の components/ は返さず、書いていない行の components/ は返す", () => {
    const uncreated = "- `components/`: 未作成";
    const created = "- `components/`: UI 部品";

    expect(findRelativePaths(uncreated)).toEqual([]);
    expect(findRelativePaths(created)).toEqual(["components/"]);
  });

  it("AC-30f（パス抽出）: 「未作成」と書いた行でも components/ 以外のパスは返す", () => {
    expect(findRelativePaths("`components/` は未作成。`lib/` はある")).toEqual(["lib/"]);
  });
});

describe("existsExactCase", () => {
  it("AC-30f（実在判定）: 大文字小文字まで一致するファイル・ディレクトリは実在する（末尾の / の有無どちらも）", () => {
    const dir = makeTempDir();
    touch(dir, "docs/adr/0001-a.md");

    expect(existsExactCase(dir, "docs/adr/0001-a.md")).toBe(true);
    expect(existsExactCase(dir, "docs/adr/")).toBe(true);
    expect(existsExactCase(dir, "docs/adr")).toBe(true);
    expect(existsExactCase(dir, "docs")).toBe(true);
  });

  it("AC-30f（実在判定）: 大文字小文字だけが違うパスは実在しない（Windows でも Linux と同じ結果にする）", () => {
    const dir = makeTempDir();
    touch(dir, "docs/adr/0001-a.md");

    expect(existsExactCase(dir, "docs/ADR/0001-a.md")).toBe(false);
    expect(existsExactCase(dir, "docs/adr/0001-A.md")).toBe(false);
    expect(existsExactCase(dir, "Docs")).toBe(false);
  });

  it("AC-30f（実在判定）: 存在しないパス・ファイルの下のパス・ファイルへの末尾 /・親ディレクトリへの参照は実在しない", () => {
    const dir = makeTempDir();
    touch(dir, "docs/adr/0001-a.md");

    expect(existsExactCase(dir, "docs/missing")).toBe(false);
    expect(existsExactCase(dir, "docs/adr/0001-a.md/x")).toBe(false);
    expect(existsExactCase(dir, "docs/adr/0001-a.md/")).toBe(false);
    expect(existsExactCase(dir, "../x")).toBe(false);
  });
});

describe("findSecretLike", () => {
  it("AC-30g（秘密検出）: ghp_ 形式と github_pat_ 形式を含む行を、行番号つきで検出する", () => {
    const md = ["通常の行", `token: ${GHP_LIKE}`, `pat: ${PAT_LIKE}`].join("\n");

    const hits = findSecretLike(md);

    expect(hits.map((h) => h.line)).toEqual([2, 3]);
  });

  it("AC-30g（秘密検出）: GITHUB_TOKEN= に値が続く記述を検出する（空白あり・コード内を含む）", () => {
    expect(findSecretLike("GITHUB_TOKEN=abc")).toHaveLength(1);
    expect(findSecretLike("GITHUB_TOKEN = abc")).toHaveLength(1);
    expect(findSecretLike("`GITHUB_TOKEN=abc`")).toHaveLength(1);
  });

  it("AC-30g（秘密検出）: 名前だけの GITHUB_TOKEN と、値なしの GITHUB_TOKEN= は検出しない", () => {
    expect(findSecretLike("GITHUB_TOKEN は任意です")).toEqual([]);
    expect(findSecretLike("`GITHUB_TOKEN`")).toEqual([]);
    expect(findSecretLike("`GITHUB_TOKEN=` に書く")).toEqual([]);
    expect(findSecretLike("GITHUB_TOKEN=")).toEqual([]);
    expect(findSecretLike("GITHUB_TOKEN= ")).toEqual([]);
    expect(findSecretLike("GITHUB_TOKEN=\nabc")).toEqual([]);
  });

  it("AC-30g（秘密検出）: トークンに似た接頭辞を含まない通常の文章は検出しない", () => {
    expect(findSecretLike("ghp という略称や github の pat について")).toEqual([]);
  });
});

// ---- README の現物に対する検査 ----

const readme = readFileSync(path.join(root, "README.md"), "utf-8");

const EXPECTED_HEADINGS: Heading[] = [
  { level: 2, text: "概要" },
  { level: 2, text: "セットアップ" },
  { level: 2, text: "構成と判断" },
  { level: 3, text: "画面構成とルーティング" },
  { level: 3, text: "ディレクトリ構成" },
  { level: 3, text: "工夫した点と理由" },
  { level: 2, text: "範囲と制約" },
  { level: 3, text: "プロダクション想定の範囲" },
  { level: 3, text: "対応しなかった事項" },
  { level: 3, text: "既知の制約" },
  { level: 2, text: "AI利用レポート" },
  { level: 3, text: "使ったツール" },
  { level: 3, text: "進め方" },
  { level: 3, text: "人間が判断・修正した点" },
  { level: 3, text: "AIの出力で注意した点" },
];

describe("README の見出し", () => {
  it("AC-30a〜AC-30d（前提）: README の ## と ### の見出しが仕様 4.1 の名前と順で過不足なく並ぶ", () => {
    expect(extractHeadings(readme)).toEqual(EXPECTED_HEADINGS);
  });
});

describe("AC-30f: README の相対パス", () => {
  it("AC-30f: README の相対パスが 1 件以上あり、すべて大文字小文字まで一致して実在する", () => {
    const paths = findRelativePaths(readme);
    const missing = paths.filter((p) => !existsExactCase(root, p));

    expect(paths.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});

describe("AC-30g: README の秘密らしい文字列", () => {
  it("AC-30g: README にトークン形式の文字列と GITHUB_TOKEN= に続く値が無い", () => {
    expect(findSecretLike(readme)).toEqual([]);
  });
});
