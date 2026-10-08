// @vitest-environment node
//
// public/ の各ファイルが、コード・CSS・設定から参照されていることを検査する（仕様 0017）。
// 限界: 参照の判定は文字列検索なので、コメント中の出現も参照として数える。
// 照合はベース名（拡張子つき）で行うため、サブディレクトリが違う同名ファイルは区別しない。
// 動的に組み立てるパスや外部サイトからの直接リンク用のファイルは検出できないため、
// 理由つきで ALLOWLIST に載せる。
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");

type Source = { path: string; text: string };
const noSources: Source[] = [];
type AllowlistEntry = { path: string; reason: string };

/** 参照が無くても許可するファイル。動的パス・外部リンク用などを理由つきで載せる */
const ALLOWLIST: ReadonlyArray<AllowlistEntry> = [];

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

/** dir 配下のファイルを、base 相対の `/` 区切りで返す。dir が無ければ空配列 */
function listPublicFiles(dir: string, base: string = root): string[] {
  if (!existsSync(dir)) return [];
  return collectFiles(dir)
    .map((f) => toRelative(f, base))
    .sort();
}

const SOURCE_DIRS = ["app", "features", "lib", "components"] as const;
const ROOT_SOURCE_FILES = ["next.config.ts", "package.json"] as const;

/** 参照元（4 ディレクトリのテストを除くコード・CSS と、ルートの設定 2 ファイル） */
function listReferenceSources(): Source[] {
  const inDirs = SOURCE_DIRS.flatMap((dir) => {
    const full = path.join(root, dir);
    return existsSync(full) ? collectFiles(full) : [];
  })
    .filter((f) => /\.(ts|tsx|mjs|js|css)$/.test(f))
    .filter((f) => !/\.(test|spec)\./.test(path.basename(f)))
    .map((f) => toRelative(f));
  return [...inDirs, ...ROOT_SOURCE_FILES].map((p) => ({
    path: p,
    text: readFileSync(path.join(root, p), "utf-8"),
  }));
}

// ---- 判定（純粋関数） ----

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** ベース名が、直前が英数字・`_`・`.`・`-` でない位置に現れるか */
function isReferenced(fileName: string, sources: Source[]): boolean {
  const pattern = new RegExp(`(?<![A-Za-z0-9_.-])${escapeRegExp(fileName)}`);
  return sources.some((source) => pattern.test(source.text));
}

/** どの参照元にもベース名が現れない public/ のパス（許可リストを除く）を返す */
function findUnreferenced(
  publicFiles: string[],
  sources: Source[],
  allowlist: ReadonlyArray<AllowlistEntry>,
): string[] {
  const allowed = new Set(allowlist.map((entry) => entry.path));
  return publicFiles.filter(
    (file) =>
      !allowed.has(file) && !isReferenced(path.posix.basename(file), sources),
  );
}

/** reason が空・空白だけ、または path が public/ で始まらない要素を返す */
function validateAllowlist(
  allowlist: ReadonlyArray<AllowlistEntry>,
): AllowlistEntry[] {
  return allowlist.filter(
    (entry) => entry.reason.trim() === "" || !entry.path.startsWith("public/"),
  );
}

// ---- テスト ----

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "public-assets-"));
  tempDirs.push(dir);
  return dir;
}

describe("走査の前提", () => {
  it("AC-1（前提）: 参照元の一覧に app/layout.tsx・app/page.tsx・app/globals.css・next.config.ts・package.json が含まれる", () => {
    const paths = listReferenceSources().map((s) => s.path);

    expect(paths).toEqual(
      expect.arrayContaining([
        "app/layout.tsx",
        "app/page.tsx",
        "app/globals.css",
        "next.config.ts",
        "package.json",
      ]),
    );
  });

  it("AC-1（前提）: 参照元の一覧に *.test.* *.spec.* と、.next/・node_modules/・docs/・tests/・public/ 配下のファイルが含まれない", () => {
    const paths = listReferenceSources().map((s) => s.path);

    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter((p) => /\.(test|spec)\./.test(p))).toEqual([]);
    expect(
      paths.filter((p) =>
        [".next/", "node_modules/", "docs/", "tests/", "public/"].some(
          (prefix) => p.startsWith(prefix),
        ),
      ),
    ).toEqual([]);
  });

  it("AC-1（前提）: listPublicFiles は一時ディレクトリの入れ子のファイルを root 相対の / 区切りで列挙する", () => {
    const dir = makeTempDir();
    mkdirSync(path.join(dir, "sub"));
    writeFileSync(path.join(dir, "a.png"), "");
    writeFileSync(path.join(dir, "sub", "b.svg"), "");

    const files = listPublicFiles(dir, dir);

    expect(files).toEqual(["a.png", "sub/b.svg"]);
  });

  it("AC-1（前提）: listPublicFiles は存在しないディレクトリで空配列を返す", () => {
    const dir = path.join(makeTempDir(), "missing");

    expect(listPublicFiles(dir, dir)).toEqual([]);
  });

  it("AC-1（前提）: public/ にファイルがある間は listPublicFiles(public) が空でない", () => {
    const publicDir = path.join(root, "public");
    const files = listPublicFiles(publicDir);

    if (existsSync(publicDir) && collectFiles(publicDir).length > 0) {
      expect(files.length).toBeGreaterThan(0);
    } else {
      // 全削除後: public/ が無い、またはファイルが 1 つも無いことを明示する
      expect(existsSync(publicDir) ? collectFiles(publicDir) : []).toEqual([]);
      expect(files).toEqual([]);
    }
  });

  it("AC-1（前提）: 許可リストの各要素は public/ で始まる path と空でない reason を持つ", () => {
    expect(validateAllowlist(ALLOWLIST)).toEqual([]);
  });
});

describe("判定", () => {
  it.each([
    { label: 'src="/logo.svg"', text: '<img src="/logo.svg" />' },
    { label: '"logo.svg"', text: 'const f = "logo.svg";' },
    {
      label: "CSS の url(/logo.svg)",
      text: "a { background: url(/logo.svg); }",
    },
    {
      label: '"icon": "public/logo.svg"',
      text: '{ "icon": "public/logo.svg" }',
    },
    { label: "行頭の logo.svg", text: "logo.svg\nother" },
    { label: "コメント // logo.svg", text: "// logo.svg" },
  ])("AC-1（判定）: $label のとき参照ありと判定する", ({ text }) => {
    const result = findUnreferenced(
      ["public/logo.svg"],
      [{ path: "app/x.tsx", text }],
      [],
    );

    expect(result).toEqual([]);
  });

  it('AC-1（判定）: 入れ子 public/img/logo.svg のベース名 logo.svg が "/img/logo.svg" に現れるとき参照ありと判定する', () => {
    const result = findUnreferenced(
      ["public/img/logo.svg"],
      [{ path: "app/x.tsx", text: 'const s = "/img/logo.svg";' }],
      [],
    );

    expect(result).toEqual([]);
  });

  it.each([
    { label: "参照元が空", sources: noSources },
    {
      label: "拡張子違いの logo.png",
      sources: [{ path: "app/x.tsx", text: '"/logo.png"' }],
    },
    {
      label: "拡張子なしの logo",
      sources: [{ path: "app/x.tsx", text: "const logo = 1;" }],
    },
    {
      label: "境界: mylogo.svg",
      sources: [{ path: "app/x.tsx", text: '"/mylogo.svg"' }],
    },
    {
      label: "logo-dark.svg",
      sources: [{ path: "app/x.tsx", text: '"/logo-dark.svg"' }],
    },
    {
      label: "my-logo.svg（直前が -）",
      sources: [{ path: "app/x.tsx", text: '"/my-logo.svg"' }],
    },
    {
      label: "old.logo.svg（直前が .）",
      sources: [{ path: "app/x.tsx", text: '"/old.logo.svg"' }],
    },
    {
      label: "a_logo.svg（直前が _）",
      sources: [{ path: "app/x.tsx", text: '"/a_logo.svg"' }],
    },
    {
      label: "logoXsvg（. は任意の 1 文字ではない）",
      sources: [{ path: "app/x.tsx", text: '"/logoXsvg"' }],
    },
  ])(
    "AC-1（判定）: $label のとき参照なしと判定し、パスを返す",
    ({ sources }) => {
      const result = findUnreferenced(["public/logo.svg"], sources, []);

      expect(result).toEqual(["public/logo.svg"]);
    },
  );

  it("AC-1（判定）: 許可リストに載ったパスは参照が無くても返さない（載っていない他のパスは返す）", () => {
    const result = findUnreferenced(
      ["public/a.svg", "public/b.svg"],
      [],
      [{ path: "public/a.svg", reason: "動的に組み立てるため" }],
    );

    expect(result).toEqual(["public/b.svg"]);
  });

  it("AC-1（判定）: validateAllowlist は reason が空・空白だけの要素と、public/ で始まらない path の要素を返す", () => {
    const emptyReason = { path: "public/a.svg", reason: "" };
    const blankReason = { path: "public/b.svg", reason: "  \t" };
    const badPath = { path: "app/c.svg", reason: "理由" };
    const ok = { path: "public/d.svg", reason: "理由" };

    const result = validateAllowlist([emptyReason, blankReason, badPath, ok]);

    expect(result).toEqual([emptyReason, blankReason, badPath]);
  });
});

describe("AC-1: public/ の各ファイルはコードから参照されている", () => {
  it("AC-1: public/ 配下のファイルで、参照元に名前が現れないもの（許可リストを除く）が無い", () => {
    const files = listPublicFiles(path.join(root, "public"));

    const unreferenced = findUnreferenced(
      files,
      listReferenceSources(),
      ALLOWLIST,
    );

    expect(unreferenced).toEqual([]);
  });
});

describe("AC-2: 雛形の SVG が無い", () => {
  it.each(["next.svg", "vercel.svg", "file.svg", "globe.svg", "window.svg"])(
    "AC-2: public/%s が存在しない",
    (name) => {
      expect(existsSync(path.join(root, "public", name))).toBe(false);
    },
  );
});
