// @vitest-environment node
//
// README.md と外部ファイル（docs/setup.md・docs/structure.md・docs/scope.md）の構造を検査する（仕様 0012）。
// 対象: 見出し・必須項目・pnpm コマンドと scripts の一致・相対パスの実在・秘密らしい文字列の不在・外部ファイルへの参照・
// 「工夫した点と理由」が他の節より長いこと。
// 限界:
// - 行ベースの簡易解析。Setext 形式の見出し（`===` の下線）・HTML の見出し・参照形式のリンク（`[a][b]`）は扱わない。
// - 相対パスの「未作成」除外は行単位。「未作成」と書いた行にある `components/` 配下のパスだけを除く
//   （同じ行の他のパスは検査する）。
// - 文章の妥当性は検査しない（レビューで確認する）。文字数の比較（AC-30i）は量の比較で、文章の質は見ない。
// - キーワードは節単位で見る。同じ節の別の文に語が残っていると、項目のラベルだけを変えても検出しない
//   （項目ごと削除した場合は検出する）。
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

type TocItem = { text: string; href: string };
type MarkdownTable = { header: string[]; rows: string[][] };
type ViolationHit = { line: number; text: string };

/**
 * `#` 見出しの後、最初の `##` の前（フェンスの外）にある箇条書き（`-` と `*`）のうち、
 * `[文字](href)` だけからなる項目を返す。目次が無ければ空配列
 */
function extractToc(md: string): TocItem[] {
  const items: TocItem[] = [];
  let fence: { char: string; length: number } | null = null;
  let seenTitle = false;
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
      continue;
    }
    if (fenceMatch !== null) {
      fence = { char: fenceMatch[1][0], length: fenceMatch[1].length };
      continue;
    }
    if (/^#{2,6}[ \t]+/.test(line)) break;
    if (/^#[ \t]+/.test(line)) {
      seenTitle = true;
      continue;
    }
    if (!seenTitle) continue;
    const item = /^[-*][ \t]+\[([^\]]+)\]\(([^)\s]+)\)[ \t]*$/.exec(line);
    if (item !== null) items.push({ text: item[1], href: item[2] });
  }
  return items;
}

/** 本文の最初の表を、ヘッダー名と行ごとのセルの配列で返す。表が無ければ null */
function parseMarkdownTable(body: string): MarkdownTable | null {
  const lines = splitLines(body);
  const separator = /^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/;
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!lines[i].includes("|") || !separator.test(lines[i + 1])) continue;
    const rows: string[][] = [];
    for (let j = i + 2; j < lines.length && lines[j].trim() !== "" && lines[j].includes("|"); j++) {
      rows.push(splitTableRow(lines[j]));
    }
    return { header: splitTableRow(lines[i]), rows };
  }
  return null;
}

/** 表の 1 行をセルに分ける。バッククォート内の | とエスケープした \| では分けない */
function splitTableRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inCode = false;
  const text = line.trim();
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\" && text[i + 1] === "|") {
      current += "\\|";
      i++;
    } else if (ch === "`") {
      inCode = !inCode;
      current += ch;
    } else if (ch === "|" && !inCode) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  // 行頭・行末の | が作る空のセルを落とす
  if (text.startsWith("|")) cells.shift();
  if (text.endsWith("|") && !text.endsWith("\\|")) cells.pop();
  return cells.map((c) => c.trim());
}

/** セルの中の参照（`#` のリンク、`docs/` のリンク、バッククォート内のリポジトリ内パス）を返す */
function findCellReferences(cell: string): string[] {
  const refs: string[] = [];
  for (const m of cell.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    if (m[1].startsWith("#")) {
      refs.push(m[1]);
      continue;
    }
    const target = linkTargetToPath(m[1]);
    if (target !== null && target.startsWith("docs/")) refs.push(target);
  }
  for (const m of cell.matchAll(/`([^`\n]+)`/g)) {
    if (isRepoPathInCode(m[1])) refs.push(m[1]);
  }
  return refs;
}

/** 外部の読者に通じない書き方（AC-n・この README・Draft PR・マージ済み）を行番号つきで返す。フェンス内も対象 */
function findExternalReaderViolations(md: string): ViolationHit[] {
  const hits: ViolationHit[] = [];
  splitLines(md).forEach((text, index) => {
    if (/AC-\d|この\s*README|Draft PR|マージ済み/.test(text)) hits.push({ line: index + 1, text });
  });
  return hits;
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

describe("extractToc", () => {
  it("AC-30l（目次の抽出）: # 見出しの後、最初の ## の前にある [文字](href) の項目を - と * の両方で返す", () => {
    const md = ["# タイトル", "", "- [概要](#概要)", "* [構成](#構成)", "", "## 概要"].join("\n");

    expect(extractToc(md)).toEqual([
      { text: "概要", href: "#概要" },
      { text: "構成", href: "#構成" },
    ]);
  });

  it("AC-30l（目次の抽出）: 最初の ## より後のリストは返さない", () => {
    const md = ["# t", "- [a](#a)", "## A", "- [b](#b)", "* [c](#c)"].join("\n");

    expect(extractToc(md)).toEqual([{ text: "a", href: "#a" }]);
  });

  it("AC-30l（目次の抽出）: フェンスの中のリストは返さない", () => {
    const md = ["# t", "```md", "- [x](#x)", "```", "~~~", "* [y](#y)", "~~~", "- [z](#z)", "## A"].join("\n");

    expect(extractToc(md)).toEqual([{ text: "z", href: "#z" }]);
  });

  it("AC-30l（目次の抽出）: リンクでない箇条書き・リンク以外の文字を含む項目は返さない", () => {
    const md = ["# t", "- ただの項目", "* 文字 [a](#a)", "- [b](#b) の説明", "- [c](#c)", "## A"].join("\n");

    expect(extractToc(md)).toEqual([{ text: "c", href: "#c" }]);
  });

  it("AC-30l（目次の抽出）: 目次が無ければ空配列を返す", () => {
    expect(extractToc("# t\n本文\n## A\n- [a](#a)")).toEqual([]);
    expect(extractToc("")).toEqual([]);
  });

  it("AC-30l（目次の抽出）: CRLF でも同じ結果を返す", () => {
    const lf = "# t\n- [a](#a)\n* [b](docs/x.md)\n## A\n- [c](#c)\n";

    expect(extractToc(lf.replace(/\n/g, "\r\n"))).toEqual([
      { text: "a", href: "#a" },
      { text: "b", href: "docs/x.md" },
    ]);
  });
});

describe("parseMarkdownTable", () => {
  it("AC-30m（表の解析）: ヘッダー名と行ごとのセルの配列を返し、区切り行（--- と :---:）を行に含めない", () => {
    const body = ["| 項目 | 対応 |", "| --- | :---: |", "| a | b |", "| c | d |"].join("\n");

    expect(parseMarkdownTable(body)).toEqual({
      header: ["項目", "対応"],
      rows: [
        ["a", "b"],
        ["c", "d"],
      ],
    });
  });

  it("AC-30m（表の解析）: 行頭・行末の | が無い表でも同じ結果を返す", () => {
    const body = ["項目 | 対応", "--- | ---", "a | b"].join("\n");

    expect(parseMarkdownTable(body)).toEqual({ header: ["項目", "対応"], rows: [["a", "b"]] });
  });

  it("AC-30m（表の解析）: セルの前後の空白を落とす", () => {
    const body = ["|   項目\t|  対応  |", "|---|---|", "|  a  |\tb |"].join("\n");

    expect(parseMarkdownTable(body)).toEqual({ header: ["項目", "対応"], rows: [["a", "b"]] });
  });

  it("AC-30m（表の解析）: バッククォート内の | とエスケープした \\| でセルを分けない", () => {
    const body = ["| 項目 | 対応 |", "| --- | --- |", "| `a | b` | x \\| y |"].join("\n");

    const table = parseMarkdownTable(body);

    expect(table?.rows).toEqual([["`a | b`", "x \\| y"]]);
  });

  it("AC-30m（表の解析）: 表の前の地の文を読み飛ばし、最初の表だけを返す", () => {
    const body = ["前置き", "", "| a |", "| --- |", "| 1 |", "", "| b |", "| --- |", "| 2 |"].join("\n");

    expect(parseMarkdownTable(body)).toEqual({ header: ["a"], rows: [["1"]] });
  });

  it("AC-30m（表の解析）: 表が無い本文では null を返す", () => {
    expect(parseMarkdownTable("本文だけ\n- 箇条書き\n")).toBeNull();
    expect(parseMarkdownTable("")).toBeNull();
  });

  it("AC-30m（表の解析）: CRLF でも同じ結果を返す", () => {
    const lf = "| a | b |\n| --- | --- |\n| 1 | 2 |\n";

    expect(parseMarkdownTable(lf.replace(/\n/g, "\r\n"))).toEqual({ header: ["a", "b"], rows: [["1", "2"]] });
  });
});

describe("findCellReferences", () => {
  it("AC-30m（参照の判定）: # で始まるリンクと docs/ で始まる Markdown リンクの解決後のパスを返す", () => {
    const cell = "[工夫](#工夫した点と理由) と [詳細](docs/scope.md#x)";

    expect(findCellReferences(cell)).toEqual(["#工夫した点と理由", "docs/scope.md"]);
  });

  it("AC-30m（参照の判定）: リポジトリ内パスに当たるバッククォートを返す", () => {
    expect(findCellReferences("`features/search/` と `README.md`")).toEqual(["features/search/", "README.md"]);
  });

  it("AC-30m（参照の判定）: 地の文だけのセルは空配列を返す", () => {
    expect(findCellReferences("対応した")).toEqual([]);
    expect(findCellReferences("")).toEqual([]);
  });

  it("AC-30m（参照の判定）: 外部 URL のリンクは参照に数えない", () => {
    expect(findCellReferences("[a](https://example.com/docs/x.md) [b](mailto:x@example.com)")).toEqual([]);
  });

  it("AC-30m（参照の判定）: pnpm test のようなパスでないバッククォートは数えない", () => {
    expect(findCellReferences("`pnpm test` `GITHUB_TOKEN` `Node.js`")).toEqual([]);
  });
});

describe("findExternalReaderViolations", () => {
  it("AC-30k（外部の読者向けの書き方の判定）: AC- に数字が続く文字列を行番号つきで返す", () => {
    expect(findExternalReaderViolations("通常\nAC-30k を満たす\nAC-1")).toEqual([
      { line: 2, text: "AC-30k を満たす" },
      { line: 3, text: "AC-1" },
    ]);
  });

  it("AC-30k（外部の読者向けの書き方の判定）: 「この README」を、間の空白の有無を問わず返す", () => {
    expect(findExternalReaderViolations("この README は\nこのREADMEは\nこの  README")).toEqual([
      { line: 1, text: "この README は" },
      { line: 2, text: "このREADMEは" },
      { line: 3, text: "この  README" },
    ]);
  });

  it("AC-30k（外部の読者向けの書き方の判定）: Draft PR を返す", () => {
    expect(findExternalReaderViolations("a\nDraft PR で確認")).toEqual([{ line: 2, text: "Draft PR で確認" }]);
  });

  it("AC-30k（外部の読者向けの書き方の判定）: マージ済み を返す", () => {
    expect(findExternalReaderViolations("a\nb\nマージ済みの変更")).toEqual([{ line: 3, text: "マージ済みの変更" }]);
  });

  it("AC-30k（外部の読者向けの書き方の判定）: フェンスの中の該当も返す", () => {
    const md = ["```", "AC-2", "```"].join("\n");

    expect(findExternalReaderViolations(md)).toEqual([{ line: 2, text: "AC-2" }]);
  });

  it("AC-30k（外部の読者向けの書き方の判定）: 受け入れ条件（AC）・AC 番号・PR・マージは人間だけ・README 単独は返さない", () => {
    const md = [
      "受け入れ条件（AC）を書く",
      "AC 番号を振る",
      "PR を作る",
      "マージは人間だけが行う",
      "README に書く",
      "ACTION と AC-x",
    ].join("\n");

    expect(findExternalReaderViolations(md)).toEqual([]);
  });

  it("AC-30k（外部の読者向けの書き方の判定）: CRLF でも行番号は同じで、text に CR を含めない", () => {
    expect(findExternalReaderViolations("a\r\nAC-3\r\n")).toEqual([{ line: 2, text: "AC-3" }]);
  });
});

// ---- README の現物に対する検査 ----

const readme = readFileSync(path.join(root, "README.md"), "utf-8");

/** 仕様 4.1 の ## 見出し（8 つ。名前と順） */
const EXPECTED_H2 = [
  "概要",
  "セットアップ",
  "課題の要件との対応",
  "工夫した点と理由",
  "テスト",
  "構成",
  "範囲と制約",
  "AI利用レポート",
];

/** 「工夫した点と理由」の ### （7 つ。名前と順） */
const EXPECTED_DEVICE_H3 = [
  "Watcher数の取得元",
  "GitHub APIをサーバー側だけで呼ぶ",
  "検索条件をURLで持つ",
  "1,000件の上限の扱い",
  "取得結果のキャッシュ",
  "エラーを状態として見せる",
  "テストの検出力を確かめる",
];

/** 課題の要件との対応の表の 1 列目（9 項目。名前と順） */
const REQUIREMENT_ITEMS = [
  "キーワード検索と一覧",
  "詳細の表示項目",
  "詳細はページ（モーダルでない）",
  "ページネーション",
  "テストコード",
  "プロダクション想定",
  "見やすさ・操作しやすさ",
  "AI利用レポート",
  "工夫した点の説明",
];

/** ## 見出しごとの、その節に属する ### の見出し。AI利用レポート以外の節は ### を持たない */
function h3sByH2(md: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  let current: string | null = null;
  for (const h of extractHeadings(md, [2, 3])) {
    if (h.level === 2) {
      current = h.text;
      result.set(current, []);
    } else if (current !== null) {
      result.get(current)?.push(h.text);
    }
  }
  return result;
}

describe("README の見出し", () => {
  it("AC-30a〜AC-30d（前提）: README の ## が仕様 4.1 の 8 つの名前と順で完全一致する", () => {
    expect(extractHeadings(readme, [2]).map((h) => h.text)).toEqual(EXPECTED_H2);
  });

  it("AC-30b（前提）: 「工夫した点と理由」の ### が仕様 4.1 の 7 つの名前と順で完全一致する", () => {
    expect(h3sByH2(readme).get("工夫した点と理由")).toEqual(EXPECTED_DEVICE_H3);
  });

  it("AC-30a〜AC-30d（前提）: AI利用レポート以外の ## 節に ### が無い", () => {
    const withH3 = [...h3sByH2(readme)]
      .filter(([h2, h3s]) => h2 !== "AI利用レポート" && h2 !== "工夫した点と理由" && h3s.length > 0)
      .map(([h2]) => h2);

    expect(withH3).toEqual([]);
  });
});

describe("AC-30l: README の目次", () => {
  it("AC-30l: 目次の項目が 8 つの ## の名前と順で完全一致する", () => {
    expect(extractToc(readme).map((i) => i.text)).toEqual(EXPECTED_H2);
  });

  it("AC-30l: 目次のすべての href が # で始まる", () => {
    const toc = extractToc(readme);

    expect(toc.length).toBeGreaterThan(0);
    expect(toc.filter((i) => !i.href.startsWith("#"))).toEqual([]);
  });
});

// ---- README の前半（概要・工夫した点と理由・セットアップ・構成）のキーワード検査 ----
// 期待値（キーワード）はテスト内のリテラルで持つ。節の取り違えを防ぐため、必ず該当の節の本文だけを見る。

const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf-8")) as {
  scripts: Record<string, string>;
};

/** README の節の本文を返す。見出しが無ければテストを失敗させる */
function readmeSection(heading: string): string {
  const body = getSection(readme, heading);
  if (body === null) throw new Error(`見出しが無い: README に「${heading}」が無い`);
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

  it("AC-30a: README のセットアップに pnpm install・pnpm dev が書かれている", () => {
    const names = findPnpmCommands(readmeSection("セットアップ")).map((c) => c.name);

    expect(["install", "dev"].filter((n) => !names.includes(n))).toEqual([]);
  });

  it("AC-30a: README のセットアップに GITHUB_TOKEN が任意で、未設定でも動くことが書かれている", () => {
    const body = readmeSection("セットアップ");

    expect(missingStrings(body, ["GITHUB_TOKEN", "任意", "未設定"])).toEqual([]);
  });

  it("AC-30a: README のセットアップから docs/setup.md へリンクしている", () => {
    expect(findMarkdownLinks(readmeSection("セットアップ"))).toContain("docs/setup.md");
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

/** 「工夫した点と理由」の 7 小節と、各小節の本文にあるべき語 */
const DEVICE_SECTIONS: { heading: string; strings: string[]; patterns: RegExp[] }[] = [
  { heading: "Watcher数の取得元", strings: ["subscribers_count"], patterns: [] },
  { heading: "GitHub APIをサーバー側だけで呼ぶ", strings: ["サーバー側"], patterns: [] },
  { heading: "検索条件をURLで持つ", strings: ["URL"], patterns: [] },
  { heading: "1,000件の上限の扱い", strings: ["1,000"], patterns: [] },
  { heading: "取得結果のキャッシュ", strings: [], patterns: [/300\s*秒/, /600\s*秒/] },
  { heading: "エラーを状態として見せる", strings: ["エラー"], patterns: [] },
  { heading: "テストの検出力を確かめる", strings: ["変異"], patterns: [] },
];

describe("AC-30b: README の工夫した点と理由", () => {
  it.each(DEVICE_SECTIONS)("AC-30b: 「$heading」に本文があり、必要な語がその小節の本文にある", (section) => {
    const body = readmeSection(section.heading);

    expect(countProseChars(body)).toBeGreaterThan(0);
    expect(missingStrings(body, section.strings)).toEqual([]);
    expect(missingPatterns(body, section.patterns)).toEqual([]);
  });
});

describe("AC-30b: README の構成", () => {
  it("AC-30b: 構成に / と /repos/[owner]/[repo] が書かれている", () => {
    const body = readmeSection("構成");

    expect(missingStrings(body, ["`/`", "/repos/[owner]/[repo]"])).toEqual([]);
  });

  it("AC-30b: 構成から docs/structure.md へリンクしている", () => {
    expect(findMarkdownLinks(readmeSection("構成"))).toContain("docs/structure.md");
  });
});

describe("AC-30h・AC-30i: README のリンクと分量", () => {
  it("AC-30h: README 全体に docs/setup.md・docs/structure.md・docs/scope.md へのリンクがある", () => {
    const links = findMarkdownLinks(readme);

    expect(["docs/setup.md", "docs/structure.md", "docs/scope.md"].filter((l) => !links.includes(l))).toEqual([]);
  });

  // AI利用レポートは T13 で加える
  it.each(["概要", "セットアップ", "課題の要件との対応", "テスト", "構成", "範囲と制約"])(
    "AC-30i: 「工夫した点と理由」の本文は「%s」の本文より長い",
    (heading) => {
      const devices = countProseChars(readmeSection("工夫した点と理由"));
      const other = countProseChars(readmeSection(heading));

      expect(devices).toBeGreaterThan(other);
    },
  );
});

describe("AC-30m: README の課題の要件との対応", () => {
  it("AC-30m: 表があり、ヘッダーに「対応」の列があり、1 列目が 9 項目と順で完全一致する", () => {
    const table = parseMarkdownTable(readmeSection("課題の要件との対応"));

    expect(table).not.toBeNull();
    expect(table?.header).toContain("対応");
    expect(table?.rows.map((r) => r[0])).toEqual(REQUIREMENT_ITEMS);
  });

  it.each(REQUIREMENT_ITEMS)("AC-30m: 「%s」の行の「対応」の列に参照が 1 件以上ある", (item) => {
    const table = parseMarkdownTable(readmeSection("課題の要件との対応"));
    const column = table?.header.indexOf("対応") ?? -1;
    const row = table?.rows.find((r) => r[0] === item);

    expect(column).toBeGreaterThanOrEqual(0);
    expect(row).toBeDefined();
    expect(findCellReferences(row?.[column] ?? "").length).toBeGreaterThanOrEqual(1);
  });
});

describe("AC-30n: README のテスト", () => {
  it("AC-30n: テストに Vitest・Testing Library・Playwright・構造検査・アクセシビリティが書かれている", () => {
    const body = readmeSection("テスト");

    expect(missingStrings(body, ["Vitest", "Testing Library", "Playwright", "構造検査", "アクセシビリティ"])).toEqual([]);
  });

  it("AC-30n: テストに pnpm test と pnpm test:e2e と bash scripts/verify.sh が書かれている", () => {
    const body = readmeSection("テスト");
    const names = findPnpmCommands(body).map((c) => c.name);

    expect(["test", "test:e2e"].filter((n) => !names.includes(n))).toEqual([]);
    expect(missingStrings(body, ["bash scripts/verify.sh"])).toEqual([]);
  });

  it("AC-30n: テストから docs/setup.md へリンクしている", () => {
    expect(findMarkdownLinks(readmeSection("テスト"))).toContain("docs/setup.md");
  });
});

describe("AC-30k: README の外部の読者向けの書き方", () => {
  it("AC-30k: AI利用レポートの節を除く範囲に AC-n・この README・Draft PR・マージ済みが無い", () => {
    // AI利用レポートの節は T13 で検査する。見出し行と本文を取り除いた残りを対象にする
    const lines = splitLines(readme).join("\n");
    const ai = getSection(lines, "AI利用レポート");
    const target = ai === null ? lines : lines.replace(`## AI利用レポート\n${ai}`, "");

    expect(findExternalReaderViolations(target)).toEqual([]);
  });
});

// ---- README の後半（範囲と制約・AI利用レポート）のキーワード検査 ----

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
  it("AC-30c: 範囲と制約に 1,000 件の上限とレート制限が書かれている", () => {
    const body = readmeSection("範囲と制約");

    expect(missingPatterns(body, [/1,?000\s*件/])).toEqual([]);
    expect(missingStrings(body, ["レート制限"])).toEqual([]);
  });

  it("AC-30c: 範囲と制約から docs/scope.md へリンクしている", () => {
    expect(findMarkdownLinks(readmeSection("範囲と制約"))).toContain("docs/scope.md");
  });
});

describe("AC-30d: README の AI利用レポート", () => {
  it("AC-30d: AI利用について考慮した点に人間の3点の趣旨（AI と作業、細分化と積み上げ、GitHub とワークフロー）が書かれている", () => {
    const body = readmeSection("AI利用について考慮した点");

    expect(missingStrings(body, ["AI", "作業", "細分化", "積み上げ", "GitHub", "ワークフロー"])).toEqual([]);
  });

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

// ---- T6: 外部ファイル（docs/setup.md・docs/structure.md・docs/scope.md）の検査 ----
// 読み込みは必ず it の中で行う（最上位で読むと、ファイルが無いときに収集段階で全体が落ちるため）。

const EXTERNAL_DOCS = [
  {
    file: "docs/setup.md",
    title: "セットアップ",
    sections: ["前提", "手順", "テスト", "環境変数"],
    minPaths: 1,
    minScripts: 1,
  },
  {
    file: "docs/structure.md",
    title: "構成",
    sections: ["画面構成とルーティング", "ディレクトリ構成"],
    minPaths: 1,
    minScripts: 0,
  },
  {
    file: "docs/scope.md",
    title: "範囲と制約",
    sections: ["プロダクション想定の範囲", "対応しなかった事項", "既知の制約"],
    minPaths: 1,
    minScripts: 0,
  },
];

/** 外部ファイルの本文を返す。呼び出しは it の中から行う */
function readExternal(file: string): string {
  return readFileSync(path.join(root, file), "utf-8");
}

/** 外部ファイルの節の本文を返す。見出しが無ければテストを失敗させる */
function externalSection(file: string, heading: string): string {
  const body = getSection(readExternal(file), heading);
  if (body === null) throw new Error(`${file} に見出し「${heading}」が無い`);
  return body;
}

describe("AC-30h: 外部ファイルの実在と見出し", () => {
  it.each(EXTERNAL_DOCS.map((d) => d.file))("AC-30h: %s が実在する（大文字小文字まで一致）", (file) => {
    expect(existsExactCase(root, file)).toBe(true);
  });

  it.each(EXTERNAL_DOCS)("AC-30h: $file の # と ## が仕様 4.1 の名前と順で過不足なく並ぶ", (doc) => {
    const expected: Heading[] = [
      { level: 1, text: doc.title },
      ...doc.sections.map((text) => ({ level: 2 as const, text })),
    ];

    expect(extractHeadings(readExternal(doc.file), [1, 2])).toEqual(expected);
  });
});

describe("AC-30a: docs/setup.md", () => {
  it("AC-30a: 手順に pnpm install・dev・build・start が書かれている", () => {
    const names = findPnpmCommands(externalSection("docs/setup.md", "手順")).map((c) => c.name);

    expect(["install", "dev", "build", "start"].filter((n) => !names.includes(n))).toEqual([]);
  });

  it("AC-30a: テストに pnpm test・test:e2e と bash scripts/verify.sh が書かれている", () => {
    const body = externalSection("docs/setup.md", "テスト");
    const names = findPnpmCommands(body).map((c) => c.name);

    expect(["test", "test:e2e"].filter((n) => !names.includes(n))).toEqual([]);
    expect(missingStrings(body, ["bash scripts/verify.sh"])).toEqual([]);
  });

  it("AC-30a: 環境変数に GITHUB_TOKEN が任意で、未設定でも動くことが書かれている", () => {
    const body = externalSection("docs/setup.md", "環境変数");

    expect(missingStrings(body, ["GITHUB_TOKEN", "任意", "未設定"])).toEqual([]);
  });
});

describe("AC-30b: docs/structure.md", () => {
  it("AC-30b: 画面構成とルーティングに / と /repos/[owner]/[repo] が書かれている", () => {
    const body = externalSection("docs/structure.md", "画面構成とルーティング");

    expect(missingStrings(body, ["`/`", "/repos/[owner]/[repo]"])).toEqual([]);
  });

  it("AC-30b: ディレクトリ構成に app/ features/ lib/ tests/ e2e/ docs/ が書かれ、components/ は同じ行で未作成と明記されている", () => {
    const body = externalSection("docs/structure.md", "ディレクトリ構成");
    const dirs = ["app/", "features/", "lib/", "tests/", "e2e/", "docs/"];
    const componentsLines = body.split(/\r?\n/).filter((line) => line.includes("`components/`"));

    expect(missingStrings(body, dirs.map((d) => `\`${d}\``))).toEqual([]);
    expect(componentsLines.filter((line) => line.includes("未作成"))).not.toEqual([]);
  });
});

describe("AC-30c: docs/scope.md", () => {
  it.each(PRODUCTION_ITEMS)("AC-30c: scope.md のプロダクション想定の範囲に「%s」が書かれている", (item) => {
    const body = externalSection("docs/scope.md", "プロダクション想定の範囲");

    expect(missingStrings(body, [item])).toEqual([]);
  });

  it("AC-30c: scope.md の対応しなかった事項にアプリのタイトル・仮の定数・対応ブラウザ・ダークモードが書かれている", () => {
    const body = externalSection("docs/scope.md", "対応しなかった事項");

    expect(missingStrings(body, ["アプリのタイトル", "仮の定数", "対応ブラウザ", "ダークモード"])).toEqual([]);
  });

  it("AC-30c: scope.md の対応しなかった事項に運営上の項目（評価基準・期限・公開設定）が書かれていない", () => {
    const body = externalSection("docs/scope.md", "対応しなかった事項");

    expect(findOperationalTerms(body)).toEqual([]);
  });

  it("AC-30c: scope.md の既知の制約に 1,000 件の上限とレート制限が書かれている", () => {
    const body = externalSection("docs/scope.md", "既知の制約");

    expect(missingPatterns(body, [/1,?000\s*件/])).toEqual([]);
    expect(missingStrings(body, ["レート制限"])).toEqual([]);
  });
});

/** README と外部ファイルの共通検査（AC-30f・AC-30g）の対象。baseDir はリンクの解決の起点（README はルート） */
const COMMON_DOCS = [
  { file: "README.md", baseDir: "", minPaths: 1 },
  ...EXTERNAL_DOCS.map((d) => ({ file: d.file, baseDir: "docs", minPaths: d.minPaths })),
];

describe("外部ファイル共通の検査", () => {
  it.each(EXTERNAL_DOCS)("AC-30a: $file の pnpm <名前> は pnpm 自体のコマンドを除きすべて scripts にある", (doc) => {
    const names = findPnpmCommands(readExternal(doc.file))
      .filter((c) => c.kind !== "exec")
      .map((c) => c.name)
      .filter((n) => !PNPM_BUILTIN_COMMANDS.includes(n));
    const unknown = names.filter((n) => !Object.hasOwn(packageJson.scripts, n));

    expect(names.length).toBeGreaterThanOrEqual(doc.minScripts);
    expect(unknown).toEqual([]);
  });

  it.each(COMMON_DOCS)("AC-30f: $file の相対パスが 1 件以上あり、すべて大文字小文字まで一致して実在する", (doc) => {
    const paths = findRelativePaths(readExternal(doc.file), doc.baseDir);
    const missing = paths.filter((p) => !existsExactCase(root, p));

    expect(paths.length).toBeGreaterThanOrEqual(doc.minPaths);
    expect(missing).toEqual([]);
  });

  it.each(COMMON_DOCS)("AC-30g: $file にトークン形式の文字列と GITHUB_TOKEN= に続く値が無い", (doc) => {
    expect(findSecretLike(readExternal(doc.file))).toEqual([]);
  });
});
