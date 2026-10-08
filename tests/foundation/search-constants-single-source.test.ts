// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");

// ---- ファイル集め ----

function collectFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(full) : [full];
  });
}

/** root からの相対パス（`/` 区切り）に直す。Windows の `\` 対策 */
function toRelative(file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

/** dir 配下のテストを除く .ts / .tsx を、root 相対の `/` 区切りで返す */
function listSourceFiles(dir: string): string[] {
  return collectFiles(path.join(root, dir))
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) => !/\.(test|spec)\./.test(path.basename(f)))
    .map(toRelative);
}

// ---- 検出器（ソース文字列を AST で読む純粋関数） ----

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile(
    "fragment.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

/** 指定した名前の宣言（変数・関数・クラス・import の束縛名・パラメータ）を返す */
function findDeclaredNames(source: string, names: string[]): string[] {
  const found: string[] = [];
  const add = (id: ts.Node | undefined): void => {
    if (id && ts.isIdentifier(id) && names.includes(id.text)) {
      found.push(id.text);
    }
  };
  walk(parse(source), (node) => {
    if (
      ts.isVariableDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isParameter(node)
    ) {
      add(node.name);
    } else if (ts.isImportSpecifier(node) || ts.isNamespaceImport(node)) {
      add(node.name);
    } else if (ts.isImportClause(node)) {
      add(node.name);
    }
  });
  return found;
}

type NamedImport = {
  specifier: string;
  typeOnly: boolean;
  names: { imported: string; local: string; typeOnly: boolean }[];
};

/** 名前付き import を、指定子・型だけか・各 specifier の元の名前と別名つきで返す */
function findNamedImports(source: string): NamedImport[] {
  const result: NamedImport[] = [];
  walk(parse(source), (node) => {
    if (!ts.isImportDeclaration(node)) return;
    if (!ts.isStringLiteral(node.moduleSpecifier)) return;
    const bindings = node.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return;
    result.push({
      specifier: node.moduleSpecifier.text,
      typeOnly: node.importClause?.isTypeOnly ?? false,
      names: bindings.elements.map((el) => ({
        imported: (el.propertyName ?? el.name).text,
        local: el.name.text,
        typeOnly: el.isTypeOnly,
      })),
    });
  });
  return result;
}

type NumericHit = { value: number; text: string; line: number };

/** 値が values のどれかに一致する数値リテラルを返す（30.0 や 0x1E も値で比べる） */
function findNumericLiterals(source: string, values: number[]): NumericHit[] {
  const sourceFile = parse(source);
  const hits: NumericHit[] = [];
  walk(sourceFile, (node) => {
    if (!ts.isNumericLiteral(node)) return;
    const value = Number(node.text);
    if (!values.includes(value)) return;
    const { line } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    hits.push({ value, text: node.getText(sourceFile), line: line + 1 });
  });
  return hits;
}

/** import / export … from / import("…") / require("…") のモジュール指定子を返す */
function findModuleSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  walk(parse(source), (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isExternalModuleReference(node) &&
      ts.isStringLiteral(node.expression)
    ) {
      specifiers.push(node.expression.text);
    } else if (ts.isCallExpression(node)) {
      const [arg] = node.arguments;
      const isDynamicImport =
        node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire =
        ts.isIdentifier(node.expression) && node.expression.text === "require";
      if ((isDynamicImport || isRequire) && arg && ts.isStringLiteral(arg)) {
        specifiers.push(arg.text);
      }
    }
  });
  return specifiers;
}

/** fromFile（root 相対）から見た specifier が lib/github を指すか */
function pointsToLibGithub(fromFile: string, specifier: string): boolean {
  if (specifier === "@/lib/github" || specifier.startsWith("@/lib/github/")) {
    return true;
  }
  if (!specifier.startsWith(".")) return false;
  const resolved = path.resolve(
    path.dirname(path.join(root, fromFile)),
    specifier,
  );
  const rel = path.relative(path.join(root, "lib/github"), resolved);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// ---- テスト ----

describe("走査の前提", () => {
  it("AC-2・AC-5（前提）: lib/github と lib/search の走査対象に client.ts・http.ts・types.ts・constants.ts・back-path.ts・query.ts が含まれる", () => {
    const files = [
      ...listSourceFiles("lib/github"),
      ...listSourceFiles("lib/search"),
    ];

    expect(files).toEqual(
      expect.arrayContaining([
        "lib/github/client.ts",
        "lib/github/http.ts",
        "lib/github/types.ts",
        "lib/search/constants.ts",
        "lib/search/back-path.ts",
        "lib/search/query.ts",
      ]),
    );
  });

  it("AC-2・AC-5（前提）: 走査対象に *.test.* と *.spec.* のファイルが含まれない", () => {
    const files = [
      ...listSourceFiles("lib/github"),
      ...listSourceFiles("lib/search"),
    ];

    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((f) => /\.(test|spec)\./.test(f))).toEqual([]);
  });
});

describe("検出器", () => {
  it("AC-1（検出器）: const DEFAULT_PER_PAGE = 30 と、import { X as MAX_Q_LENGTH } の束縛名を宣言として検出し、コメント・文字列中の同名は検出しない", () => {
    const names = ["DEFAULT_PER_PAGE", "MAX_Q_LENGTH"];

    expect(findDeclaredNames("const DEFAULT_PER_PAGE = 30;", names)).toEqual([
      "DEFAULT_PER_PAGE",
    ]);
    expect(
      findDeclaredNames('import { X as MAX_Q_LENGTH } from "./a";', names),
    ).toEqual(["MAX_Q_LENGTH"]);
    expect(
      findDeclaredNames(
        [
          "// const DEFAULT_PER_PAGE = 30;",
          "/* MAX_Q_LENGTH */",
          'const s = "DEFAULT_PER_PAGE MAX_Q_LENGTH";',
          "const t = `MAX_Q_LENGTH`;",
        ].join("\n"),
        names,
      ),
    ).toEqual([]);
  });

  it("AC-1（検出器）: 名前付き import の指定子・元の名前・別名・型だけかを読み取れる（import type と as を区別する）", () => {
    const source = [
      'import { A, B as C } from "@/lib/x";',
      'import type { D } from "@/lib/y";',
      'import { type E, F } from "@/lib/z";',
    ].join("\n");

    expect(findNamedImports(source)).toEqual([
      {
        specifier: "@/lib/x",
        typeOnly: false,
        names: [
          { imported: "A", local: "A", typeOnly: false },
          { imported: "B", local: "C", typeOnly: false },
        ],
      },
      {
        specifier: "@/lib/y",
        typeOnly: true,
        names: [{ imported: "D", local: "D", typeOnly: false }],
      },
      {
        specifier: "@/lib/z",
        typeOnly: false,
        names: [
          { imported: "E", local: "E", typeOnly: true },
          { imported: "F", local: "F", typeOnly: false },
        ],
      },
    ]);
  });

  it.each([
    { label: "const x = 30;", source: "const x = 30;", value: 30 },
    { label: "q.length > 256", source: "if (q.length > 256) {}", value: 256 },
    {
      label: "perPage = 30（既定値）",
      source: "function f({ perPage = 30 }: { perPage?: number }) {}",
      value: 30,
    },
    { label: "30.0", source: "const x = 30.0;", value: 30 },
    { label: "0x1E", source: "const x = 0x1E;", value: 30 },
  ])("AC-2（検出器）: $label の数値リテラルを検出する", ({ source, value }) => {
    const hits = findNumericLiterals(source, [30, 256]);

    expect(hits).toHaveLength(1);
    expect(hits[0]?.value).toBe(value);
  });

  it.each([
    { label: "DEFAULT_PAGE = 1", source: "const DEFAULT_PAGE = 1;" },
    { label: "MAX_PER_PAGE = 100", source: "const MAX_PER_PAGE = 100;" },
    {
      label: "正規表現 {1,100}",
      source: "const p = /^[A-Za-z0-9._-]{1,100}$/;",
    },
    { label: '文字列 "30"', source: 'const s = "30";' },
    { label: "テンプレート文字列 `30件`", source: "const s = `30件`;" },
    { label: "行コメント // 既定 30", source: "// 既定 30\nconst a = 1;" },
    { label: "ブロックコメント /* 256 */", source: "/* 256 */\nconst a = 1;" },
    { label: "300", source: "const x = 300;" },
    { label: "2560", source: "const x = 2560;" },
    { label: "1030", source: "const x = 1030;" },
  ])("AC-2（検出器）: $label は検出しない", ({ source }) => {
    expect(findNumericLiterals(source, [30, 256])).toEqual([]);
  });

  const syntaxes: { name: string; build: (s: string) => string }[] = [
    { name: "import", build: (s) => `import { X } from "${s}";` },
    { name: "import type", build: (s) => `import type { X } from "${s}";` },
    { name: "export from", build: (s) => `export { X } from "${s}";` },
    { name: "動的 import", build: (s) => `const m = import("${s}");` },
    { name: "require", build: (s) => `const m = require("${s}");` },
  ];

  it.each([
    { specifier: "@/lib/github" },
    { specifier: "@/lib/github/types" },
    { specifier: "../github" },
    { specifier: "../github/errors" },
    { specifier: "../../lib/github" },
    { specifier: "./../github/client" },
  ])(
    "AC-5（検出器）: lib/search/x.ts の $specifier は lib/github を指すと判定する",
    ({ specifier }) => {
      for (const { name, build } of syntaxes) {
        const found = findModuleSpecifiers(build(specifier));

        expect(found, name).toEqual([specifier]);
        expect(pointsToLibGithub("lib/search/x.ts", specifier), name).toBe(
          true,
        );
      }
    },
  );

  it.each([
    { specifier: "./constants" },
    { specifier: "@/lib/search/query" },
    { specifier: "@/lib/github-extra" },
    { specifier: "../githubx" },
    { specifier: "react" },
  ])(
    "AC-5（検出器）: lib/search/x.ts の $specifier は lib/github を指さないと判定する",
    ({ specifier }) => {
      for (const { name, build } of syntaxes) {
        const found = findModuleSpecifiers(build(specifier));

        expect(found, name).toEqual([specifier]);
        expect(pointsToLibGithub("lib/search/x.ts", specifier), name).toBe(
          false,
        );
      }
    },
  );
});

describe("AC-5: lib/search は lib/github に依存しない", () => {
  it("AC-5: lib/search/ のテストを除くソースは、@/lib/github・../github・../../github のいずれも import していない", () => {
    const violations = listSourceFiles("lib/search").flatMap((file) =>
      findModuleSpecifiers(readFileSync(path.join(root, file), "utf-8"))
        .filter((specifier) => pointsToLibGithub(file, specifier))
        .map((specifier) => `${file}: ${specifier}`),
    );

    expect(violations).toEqual([]);
  });
});
