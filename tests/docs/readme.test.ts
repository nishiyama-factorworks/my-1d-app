// @vitest-environment node
//
// README.md の構造を検査する（仕様 0012）。T1 の範囲: 見出し・相対パスの実在・秘密らしい文字列の不在。
// 限界:
// - 行ベースの簡易解析。Setext 形式の見出し（`===` の下線）・HTML の見出し・参照形式のリンク（`[a][b]`）は扱わない。
// - 相対パスの「未作成」除外は行単位。「未作成」と書いた行にある `components/` 配下のパスだけを除く
//   （同じ行の他のパスは検査する）。
// - 文章の妥当性は検査しない（レビューで確認する）。
// - `pnpm <名前>` の検出は、前が日本語などの文字（空白・記号以外）だと拾わない（`次にpnpm biuld` はすり抜ける）。
//   README のコマンドはバッククォートかフェンスの中に書く前提。
// - 相対パスの検査は、Markdown のリンクとバッククォート内だけが対象。地の文に書いたパスは検査しない。
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

type Heading = { level: 1 | 2 | 3; text: string };
type SecretHit = { line: number; text: string };

// ---- 判定・解析（純粋関数） ----

/** levels（既定は `##` と `###`）のレベルの見出しを出現順に返す。フェンス内と `####` 以下は返さない */
function extractHeadings(md: string, levels: ReadonlyArray<1 | 2 | 3> = [2, 3]): Heading[] {
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
    const match = /^(#{1,3})[ \t]+(.+?)[ \t]*$/.exec(line);
    if (match !== null) {
      const level = match[1].length === 1 ? 1 : match[1].length === 2 ? 2 : 3;
      if (levels.includes(level)) headings.push({ level, text: match[2] });
    }
  }
  return headings;
}

/**
 * 相対パス（リンクの target と、バッククォート内のリポジトリ内パス）を重複なしで返す。
 * リンクの target は baseDir 起点で解決してルート起点に直す。バッククォート内は常にルート起点
 */
function findRelativePaths(md: string, baseDir = ""): string[] {
  const found: string[] = [];
  for (const line of linesOutsideFences(md)) {
    const uncreated = line.includes("未作成");
    const candidates: string[] = linksInLine(line, baseDir);
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

/** フェンスの外の Markdown リンクの target を、baseDir からの相対として解決しルート起点で返す */
function findMarkdownLinks(md: string, baseDir = ""): string[] {
  return linesOutsideFences(md).flatMap((line) => linksInLine(line, baseDir));
}

/** 1 行の Markdown リンクの target を、baseDir 起点で解決してルート起点にして返す */
function linksInLine(line: string, baseDir: string): string[] {
  const links: string[] = [];
  for (const m of line.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = linkTargetToPath(m[1]);
    if (target !== null) links.push(path.posix.join(baseDir, target));
  }
  return links;
}

/** フェンスの外の行の、空白類を除く文字数（コードポイント数） */
function countProseChars(body: string): number {
  return [...linesOutsideFences(body).join("").replace(/\s/g, "")].length;
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

/**
 * 見出し（# 〜 ######。text が完全一致する最初のもの）の直下から、同じかそれより上のレベルの
 * 次の見出しの手前までの本文を返す。フェンス内の # 行では切れない。見出しが無ければ null
 */
function getSection(md: string, heading: string): string | null {
  let fence: { char: string; length: number } | null = null;
  let level = 0;
  let found = false;
  const body: string[] = [];
  for (const line of splitLines(md)) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence !== null) {
      if (
        fenceMatch !== null &&
        fenceMatch[1][0] === fence.char &&
        fenceMatch[1].length >= fence.length
      ) {
        fence = null;
      }
      if (found) body.push(line);
      continue;
    }
    if (fenceMatch !== null) {
      fence = { char: fenceMatch[1][0], length: fenceMatch[1].length };
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

type PnpmCommand = {
  /** direct: `pnpm <名前>` / run: `pnpm run <名前>` / exec: `pnpm exec <コマンド名>` */
  kind: "direct" | "run" | "exec";
  name: string;
};

/** 本文（フェンス内を含む）の `pnpm <名前>` `pnpm run <名前>` `pnpm exec <名前>` を出現順に返す */
function findPnpmCommands(md: string): PnpmCommand[] {
  const commands: PnpmCommand[] = [];
  // 直前が文字・数字・_ / . - の `pnpm`（日本語の直後、パスの一部など）は拾わない。名前は英字始まり
  const pattern =
    /(?<![\p{L}\p{N}_/.-])pnpm[ \t]+(?:(run|exec)[ \t]+)?([A-Za-z][\w-]*(?::[\w-]+)*)/gu;
  for (const line of splitLines(md)) {
    for (const m of line.matchAll(pattern)) {
      const kind = m[1] === "run" ? "run" : m[1] === "exec" ? "exec" : "direct";
      commands.push({ kind, name: m[2] });
    }
  }
  return commands;
}

// ---- 純粋関数の下請け ----

function splitLines(md: string): string[] {
  return md.replace(/^\uFEFF/, "").split(/\r?\n/);
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
    const md = "\uFEFF# t\r\n## a \r\n### b\t\r\n";

    expect(extractHeadings(md)).toEqual([
      { level: 2, text: "a" },
      { level: 3, text: "b" },
    ]);
  });

  it("AC-30a〜AC-30d（見出し判定）: # の後ろに空白が無い行は見出しにしない", () => {
    expect(extractHeadings("##x\n###y\n")).toEqual([]);
  });
});

describe("getSection", () => {
  it("AC-30a〜AC-30d（節の取得）: ### の本文は次の ### または ## の手前までで、## の本文は配下の ### を含む", () => {
    const md = ["## A", "a本文", "### A1", "a1本文", "### A2", "a2本文", "## B", "b本文"].join("\n");

    expect(getSection(md, "A1")).toBe("a1本文");
    expect(getSection(md, "A")).toBe("a本文\n### A1\na1本文\n### A2\na2本文");
  });

  it("AC-30a〜AC-30d（節の取得）: 最後の節はファイル末尾までを返す", () => {
    expect(getSection("## A\nx\n## B\ny\nz", "B")).toBe("y\nz");
  });

  it("AC-30a〜AC-30d（節の取得）: フェンスの中の # 行では切れず、フェンスの記号も本文に含む", () => {
    const md = ["## A", "```bash", "# コメント", "## 見出しに見える行", "```", "後", "## B"].join("\n");

    expect(getSection(md, "A")).toBe("```bash\n# コメント\n## 見出しに見える行\n```\n後");
  });

  it("AC-30a〜AC-30d（節の取得）: 存在しない見出し・部分一致・フェンス内だけにある見出しは null", () => {
    const md = ["## 概要説明", "x", "```", "## 隠れた", "```"].join("\n");

    expect(getSection(md, "概要")).toBeNull();
    expect(getSection(md, "隠れた")).toBeNull();
    expect(getSection(md, "ない")).toBeNull();
  });

  it("AC-30a〜AC-30d（節の取得）: CRLF・末尾の空白があっても見出しを見つけ、空の節は空文字列を返す", () => {
    const md = "## A \r\n## B\r\nb\r\n";

    expect(getSection(md, "A")).toBe("");
    expect(getSection(md, "B")).toBe("b\n");
  });
});

describe("findPnpmCommands", () => {
  it("AC-30a（コマンド抽出）: pnpm <名前> / pnpm run <名前> / pnpm exec <名前> を種別つきで出現順に返す", () => {
    const md = "pnpm install\npnpm run dev\npnpm exec playwright install chromium";

    expect(findPnpmCommands(md)).toEqual([
      { kind: "direct", name: "install" },
      { kind: "run", name: "dev" },
      { kind: "exec", name: "playwright" },
    ]);
  });

  it("AC-30a（コマンド抽出）: pnpm test と pnpm test:e2e を別の名前として返す（部分一致で取り違えない）", () => {
    const names = findPnpmCommands("`pnpm test` と `pnpm test:e2e`").map((c) => c.name);

    expect(names).toEqual(["test", "test:e2e"]);
  });

  it("AC-30a（コマンド抽出）: 文末の記号は名前に含めない", () => {
    const names = findPnpmCommands("pnpm build. pnpm start: と pnpm lint,").map((c) => c.name);

    expect(names).toEqual(["build", "start", "lint"]);
  });

  it("AC-30a（コマンド抽出）: pnpm のバージョン番号・日本語の直後の pnpm・パスの一部は拾わない", () => {
    const md = ["pnpm 12.9.1", "pnpm@12.9.1", "日本語pnpm dev", "docs/pnpm test", "pnpm は速い", "my-pnpm build"].join(
      "\n",
    );

    expect(findPnpmCommands(md)).toEqual([]);
  });

  it("AC-30a（コマンド抽出）: フェンスの中のコマンドも返す", () => {
    const md = ["```bash", "pnpm install", "pnpm dev", "```"].join("\n");

    expect(findPnpmCommands(md).map((c) => c.name)).toEqual(["install", "dev"]);
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

describe("extractHeadings（対象レベルの指定）", () => {
  it("AC-30h（見出し判定）: levels が [1, 2] のとき # と ## だけを返し、### 以下は返さない", () => {
    const md = ["# t", "## a", "### b", "#### c", "# u"].join("\n");

    expect(extractHeadings(md, [1, 2])).toEqual([
      { level: 1, text: "t" },
      { level: 2, text: "a" },
      { level: 1, text: "u" },
    ]);
  });

  it("AC-30h（見出し判定）: levels が [1, 2] でもフェンスの中の # 行は返さない", () => {
    const md = ["# a", "```bash", "# x", "## y", "```", "~~~", "# z", "~~~", "## b"].join("\n");

    expect(extractHeadings(md, [1, 2])).toEqual([
      { level: 1, text: "a" },
      { level: 2, text: "b" },
    ]);
  });

  it("AC-30h（見出し判定）: levels が [1] のとき # だけを返す", () => {
    expect(extractHeadings("# a\n## b\n### c", [1])).toEqual([{ level: 1, text: "a" }]);
  });

  it("AC-30h（見出し判定）: levels を省略すると従来どおり ## と ### だけを返す", () => {
    expect(extractHeadings("# a\n## b\n### c")).toEqual([
      { level: 2, text: "b" },
      { level: 3, text: "c" },
    ]);
  });
});

describe("findRelativePaths（baseDir）", () => {
  it("AC-30f（パス抽出）: baseDir が docs のとき、リンクの target を docs 起点で解決しルート起点で返す", () => {
    const md = "[a](specs/0001-a.md) [b](../README.md) [c](./adr/) [d](adr/0005-b.md#decision)";

    expect(findRelativePaths(md, "docs")).toEqual([
      "docs/specs/0001-a.md",
      "README.md",
      "docs/adr/",
      "docs/adr/0005-b.md",
    ]);
  });

  it("AC-30f（パス抽出）: baseDir が docs のとき、ルートの外に出るリンクは .. を含む形で返し、実在判定は不合格になる", () => {
    const dir = makeTempDir();
    touch(dir, "x.md");

    const paths = findRelativePaths("[c](../../x.md)", "docs");

    expect(paths).toHaveLength(1);
    expect(paths[0].split("/")).toContain("..");
    expect(existsExactCase(dir, paths[0])).toBe(false);
  });

  it("AC-30f（パス抽出）: baseDir が docs でも、バッククォート内のパスはルート起点のまま返す", () => {
    const md = "`lib/app-config.ts` と `README.md` と [a](setup.md)";

    // 1 行の中ではリンク、バッククォートの順で返る
    expect(findRelativePaths(md, "docs")).toEqual(["docs/setup.md", "lib/app-config.ts", "README.md"]);
  });

  it("AC-30f（パス抽出）: baseDir が docs でも、外部 URL・アンカー・フェンス内のリンクは返さない", () => {
    const md = ["[a](https://example.com/x)", "[b](#sec)", "```", "[c](x.md)", "```"].join("\n");

    expect(findRelativePaths(md, "docs")).toEqual([]);
  });

  it("AC-30f（パス抽出）: baseDir が docs のとき、「未作成」の行の components/ へのリンクは返さない", () => {
    expect(findRelativePaths("[c](../components/) は未作成", "docs")).toEqual([]);
  });
});

describe("findMarkdownLinks", () => {
  it("AC-30h（リンク抽出）: Markdown リンクの target を出現順に返し、# の断片を落とす", () => {
    const md = "[仕様](docs/specs/0001-a.md) と [ADR](docs/adr/0005-b.md#decision)";

    expect(findMarkdownLinks(md)).toEqual(["docs/specs/0001-a.md", "docs/adr/0005-b.md"]);
  });

  it("AC-30h（リンク抽出）: baseDir が docs のとき、target を docs 起点で解決しルート起点で返す", () => {
    const md = "[a](specs/0001-a.md) [b](../README.md#x)";

    expect(findMarkdownLinks(md, "docs")).toEqual(["docs/specs/0001-a.md", "README.md"]);
  });

  it("AC-30h（リンク抽出）: バッククォート内や地の文の docs/setup.md はリンクとして数えない", () => {
    const md = "`docs/setup.md` と docs/setup.md と `README.md`";

    expect(findMarkdownLinks(md)).toEqual([]);
  });

  it("AC-30h（リンク抽出）: 外部 URL・mailto・ページ内アンカー・絶対パス・フェンス内のリンクは返さない", () => {
    const md = [
      "[a](https://example.com/x)",
      "[b](mailto:someone@example.com)",
      "[c](#section)",
      "[d](/repos/foo)",
      "```",
      "[e](docs/setup.md)",
      "```",
    ].join("\n");

    expect(findMarkdownLinks(md)).toEqual([]);
  });
});

describe("countProseChars", () => {
  it("AC-30i（文字数）: 空白・タブ・改行・全角空白を数えない", () => {
    expect(countProseChars("a b\tc\n d　e\n\n")).toBe(5);
  });

  it("AC-30i（文字数）: ``` と ~~~ のフェンスの中（記号の行を含む）を数えない", () => {
    expect(countProseChars("ab\n```bash\ncdef\n```\ngh\n~~~\nijk\n~~~\nl")).toBe(5);
  });

  it("AC-30i（文字数）: CRLF でも LF と同じ数になる", () => {
    const lf = "あい\n```\nxyz\n```\nうえ\n";

    expect(countProseChars(lf.replace(/\n/g, "\r\n"))).toBe(countProseChars(lf));
    expect(countProseChars(lf)).toBe(4);
  });

  it("AC-30i（文字数）: 見出し行の文字（# の記号を含む）を数える", () => {
    expect(countProseChars("## 見出し\n本文")).toBe(7);
  });

  it("AC-30i（文字数）: コードポイント数で数える（サロゲートペアは 1 文字）", () => {
    expect(countProseChars("\u{20BB7}a")).toBe(2);
  });

  it("AC-30i（文字数）: 空文字列とフェンスだけの文字列は 0", () => {
    expect(countProseChars("")).toBe(0);
    expect(countProseChars("```\nabc\n```")).toBe(0);
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
  { level: 3, text: "AI利用について考慮した点" },
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

// ---- T2: 前半（概要・セットアップ・構成と判断）のキーワード検査 ----
// 期待値（キーワード）はテスト内のリテラルで持つ。節の取り違えを防ぐため、必ず該当の節の本文だけを見る。

const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf-8")) as {
  scripts: Record<string, string>;
};

/** README の節の本文を返す。見出しが無ければテストを失敗させる */
function readmeSection(heading: string): string {
  const body = getSection(readme, heading);
  if (body === null) throw new Error(`README に見出し「${heading}」が無い`);
  return body;
}

/** 本文に含まれない文字列を返す（空配列が期待値。どれが欠けたか分かる） */
function missingStrings(body: string, expected: string[]): string[] {
  return expected.filter((s) => !body.includes(s));
}

/** 本文にマッチしない正規表現の source を返す */
function missingPatterns(body: string, expected: RegExp[]): string[] {
  return expected.filter((re) => !re.test(body)).map((re) => String(re));
}

/** pnpm 自体のコマンド（package.json の scripts に無くてよいもの）。Q4: install のみ */
const PNPM_BUILTIN_COMMANDS = ["install"];

describe("AC-30a: README の概要とセットアップ", () => {
  it("AC-30a: 概要にアプリの概要（GitHub・リポジトリ・検索・詳細）が書かれている", () => {
    const body = readmeSection("概要");

    expect(missingStrings(body, ["GitHub", "リポジトリ", "検索", "詳細"])).toEqual([]);
  });

  it("AC-30a: セットアップに pnpm install・dev・build・start・test・test:e2e と bash scripts/verify.sh が書かれている", () => {
    const body = readmeSection("セットアップ");
    const names = findPnpmCommands(body).map((c) => c.name);

    expect(
      ["install", "dev", "build", "start", "test", "test:e2e"].filter((n) => !names.includes(n)),
    ).toEqual([]);
    expect(missingStrings(body, ["bash scripts/verify.sh"])).toEqual([]);
  });

  it("AC-30a: セットアップに GITHUB_TOKEN が任意で、未設定でも動くことが書かれている", () => {
    const body = readmeSection("セットアップ");

    expect(missingStrings(body, ["GITHUB_TOKEN", "任意", "未設定"])).toEqual([]);
  });

  it("AC-30a: README の pnpm <名前> は pnpm 自体のコマンド（install）を除き、すべて package.json の scripts にある", () => {
    const commands = findPnpmCommands(readme);
    // exec は pnpm 経由で別コマンドを実行する形で、scripts の名前ではない
    const scriptNames = commands
      .filter((c) => c.kind !== "exec")
      .map((c) => c.name)
      .filter((n) => !PNPM_BUILTIN_COMMANDS.includes(n));
    const unknown = scriptNames.filter((n) => !Object.hasOwn(packageJson.scripts, n));

    expect(scriptNames.length).toBeGreaterThan(0);
    expect(unknown).toEqual([]);
  });
});

describe("AC-30b: README の構成と判断", () => {
  it("AC-30b: 画面構成とルーティングに / と /repos/[owner]/[repo] が書かれている", () => {
    const body = readmeSection("画面構成とルーティング");

    expect(missingStrings(body, ["`/`", "/repos/[owner]/[repo]"])).toEqual([]);
  });

  it("AC-30b: ディレクトリ構成に app/ features/ lib/ components/ tests/ e2e/ docs/ が書かれ、components/ は未作成と明記されている", () => {
    const body = readmeSection("ディレクトリ構成");
    const dirs = ["app/", "features/", "lib/", "components/", "tests/", "e2e/", "docs/"];
    const componentsLines = body
      .split(/\r?\n/)
      .filter((line) => line.includes("`components/`"));

    expect(missingStrings(body, dirs.map((d) => `\`${d}\``))).toEqual([]);
    // 「未作成」は components/ と同じ行にあること（別の行の「未作成」では通さない）
    expect(componentsLines.filter((line) => line.includes("未作成"))).not.toEqual([]);
  });

  it("AC-30b: 工夫した点と理由に subscribers_count・サーバー側・URL・1,000 件・300 秒・600 秒が書かれている", () => {
    const body = readmeSection("工夫した点と理由");

    expect(missingStrings(body, ["subscribers_count", "サーバー側", "URL"])).toEqual([]);
    expect(missingPatterns(body, [/1,?000\s*件/, /300\s*秒/, /600\s*秒/])).toEqual([]);
  });
});

// ---- T3: 後半（範囲と制約・AI利用レポート）のキーワード検査 ----

/** 運営上の項目（評価基準・期限・公開設定）の語。README に書かない（Q 承認済み） */
const OPERATIONAL_TERMS = ["評価基準", "期限", "公開設定"];

/** 本文に含まれる運営上の語を返す（空配列が期待値） */
function findOperationalTerms(body: string): string[] {
  return OPERATIONAL_TERMS.filter((t) => body.includes(t));
}

/** 本文にある番号つきの参照（仕様 0013 / 計画 0016 / ADR 0005 / PR #34 / Issue #21）を出現順に返す */
function findNumberedReferences(body: string): string[] {
  return [...body.matchAll(/(?:仕様|計画|ADR)[ \t]*\d{4}|(?:PR|Issue)[ \t]*#\d+/g)].map((m) => m[0]);
}

describe("findOperationalTerms", () => {
  it("AC-30c（運営語の判定）: 評価基準・期限・公開設定を含む文字列ではその語を返す", () => {
    expect(findOperationalTerms("評価基準を満たす")).toEqual(["評価基準"]);
    expect(findOperationalTerms("提出期限と公開設定")).toEqual(["期限", "公開設定"]);
  });

  it("AC-30c（運営語の判定）: 運営上の語を含まない文字列では空配列を返す", () => {
    expect(findOperationalTerms("ダークモードには対応しない")).toEqual([]);
  });
});

describe("findNumberedReferences", () => {
  it("AC-30d（番号参照の判定）: 仕様・計画・ADR の 4 桁番号と PR・Issue の # 番号を返す", () => {
    const md = "仕様 0013、計画0016、ADR 0005、PR #34、Issue #21";

    expect(findNumberedReferences(md)).toEqual(["仕様 0013", "計画0016", "ADR 0005", "PR #34", "Issue #21"]);
  });

  it("AC-30d（番号参照の判定）: 番号の無い言及・桁が足りない番号・# の無い PR は返さない", () => {
    const md = "仕様を直した。計画 12。ADR を書いた。PR 34。Issue の番号は後で。";

    expect(findNumberedReferences(md)).toEqual([]);
  });
});

/** 親仕様 0001 の 8 節の項目 */
const PRODUCTION_ITEMS = [
  "セキュリティ",
  "信頼性",
  "アクセシビリティ",
  "パフォーマンス",
  "見やすさ",
  "メタデータ",
  "品質ゲート",
  "テスト方針",
];

describe("AC-30c: README の範囲と制約", () => {
  it.each(PRODUCTION_ITEMS)("AC-30c: プロダクション想定の範囲に「%s」が書かれている", (item) => {
    const body = readmeSection("プロダクション想定の範囲");

    expect(missingStrings(body, [item])).toEqual([]);
  });

  it("AC-30c: 対応しなかった事項にアプリのタイトル・仮の定数・対応ブラウザ・ダークモードが書かれている", () => {
    const body = readmeSection("対応しなかった事項");

    expect(missingStrings(body, ["アプリのタイトル", "仮の定数", "対応ブラウザ", "ダークモード"])).toEqual([]);
  });

  it("AC-30c: 対応しなかった事項に運営上の項目（評価基準・期限・公開設定）が書かれていない", () => {
    const body = readmeSection("対応しなかった事項");

    expect(findOperationalTerms(body)).toEqual([]);
  });

  it("AC-30c: 既知の制約に 1,000 件の上限とレート制限が書かれている", () => {
    const body = readmeSection("既知の制約");

    expect(missingPatterns(body, [/1,?000\s*件/])).toEqual([]);
    expect(missingStrings(body, ["レート制限"])).toEqual([]);
  });
});

describe("AC-30d: README の AI利用レポート", () => {
  it("AC-30d: 使ったツールに Claude Code が書かれている", () => {
    const body = readmeSection("使ったツール");

    expect(missingStrings(body, ["Claude Code"])).toEqual([]);
  });

  it("AC-30d: 進め方に仕様駆動・TDD・CLAUDE.md・.claude/・scripts/verify.sh が書かれている", () => {
    const body = readmeSection("進め方");

    expect(missingStrings(body, ["仕様駆動", "TDD", "CLAUDE.md", ".claude/", "scripts/verify.sh"])).toEqual([]);
  });

  it("AC-30d: 人間が判断・修正した点に番号つきの具体例（仕様・計画・ADR・PR・Issue）が 1 つ以上ある", () => {
    const body = readmeSection("人間が判断・修正した点");

    expect(findNumberedReferences(body).length).toBeGreaterThanOrEqual(1);
  });

  it("AC-30d: AIの出力で注意した点に番号つきの具体例（仕様・計画・ADR・PR・Issue）が 1 つ以上ある", () => {
    const body = readmeSection("AIの出力で注意した点");

    expect(findNumberedReferences(body).length).toBeGreaterThanOrEqual(1);
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
