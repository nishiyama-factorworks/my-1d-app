# 0014: 依存が完了した Issue を Project の Ready に更新する仕組み 実装計画

Status: in-progress              <!-- draft | in-progress | done  ※ SessionStart hook が "Status: in-progress" の行を検出します。この行は変えないこと -->

- Issue: #25
- 対応する仕様: docs/specs/0014-ready-issues.md
- ブランチ: feat/25-ready-issues
- 作成日: 2026-10-08

## 1. 方針

- Web アプリ（`app/` `features/` `lib/`）には触れない。追加するのは開発用の Node スクリプト（`.mjs`、依存パッケージなし）と、ハーネス設定・文書だけ。
- **副作用の無い純粋関数**（依存の解釈・対応づけ・判定・表示の整形・Project の更新計画）と、**`gh` を呼ぶ境界**と、**CLI の流れ**と、**入口**を別ファイルに分ける。`gh` は「引数の配列を受け取って結果を返す関数」（`GhRunner`）として外から渡し（依存性の注入）、テストでは引数の配列を記録する偽の実装に差し替える。実際の GitHub・Project には接続しない（仕様 5 節の注記）。
- テストは `.test.ts`（TypeScript）で書き、`.mjs` を import する。`.mjs` 側は先頭に `// @ts-check` を付け、JSDoc で型を書く（`tsconfig.json` は `allowJs: true`・`strict: true`。1.2 (a)）。
- 書き込み（`gh project item-edit`）の経路は `--apply` フラグ 1 つだけにする（短縮形・環境変数・設定ファイルでの有効化を作らない）。ハーネスの確認（AC-22）が `--apply` の文字列で判定するため。
- 保護ファイル（`.claude/settings.json`、`.claude/hooks/guard-bash.sh`、`.claude/commands/feature.md`）の編集は `guard-files.sh` により**人間の確認が出る**。T8・T9 で確認を求める。`CLAUDE.md` は変更しない（9 節の記述は新しい運用と矛盾しない）。

### 1.1 確定する事項（計画の承認で確定）

| 事項 | 内容 |
| --- | --- |
| ファイル構成 | `scripts/ready-issues.mjs`（入口。実際の `execFile` と `fs` をつないで `runReadyIssues` を呼ぶだけ）／`scripts/lib/ready-issues-core.mjs`（依存の解釈・仕様番号・対応づけ・判定）／`scripts/lib/ready-issues-format.mjs`（制御文字の除去・判定結果の整形）／`scripts/lib/ready-issues-project.mjs`（Status フィールドの検証・更新計画・その整形）／`scripts/lib/ready-issues-gh.mjs`（`gh` の引数の組み立て・出力 JSON の検証・権限不足の検知）／`scripts/lib/ready-issues-cli.mjs`（引数のパースと全体の流れ。終了コードを返す）。命名は既存の `scripts/*.sh` と同じ kebab-case |
| テストの配置 | 各モジュールと同じディレクトリに `*.test.ts`（`.claude/rules/30-testing.md`「対象と同じディレクトリ」）。先頭に `// @vitest-environment node`。ハーネス・文書の構造テストは `tests/harness/ready-issues-harness.test.ts`（`tests/foundation/` の前例） |
| 依存の解釈 | `parseDependencies(specText: string): string[]`（1.2 (b)） |
| 仕様番号 | `extractSpecNumber(title: string): string \| null`、`collectSpecDependencies(files: SpecFile[]): Map<string, string[]>` |
| 対応づけ | `indexIssuesBySpec(issues: IssueSummary[]): { bySpec: Map<string, IssueSummary>; duplicates: Duplicate[] }` |
| 判定 | `classifyIssues(input: { issues: IssueSummary[]; specDependencies: Map<string, string[]>; assumeClosed: number[] }): Classification`（1.2 (c)） |
| 表示 | `sanitizeForTerminal(text: string): string`、`formatClassification(c: Classification): string[]`（1.2 (d)） |
| Project | `findStatusField(fields: ProjectField[]): StatusFieldResult`、`planProjectUpdates(input: { candidates: ReadyEntry[]; items: ProjectItem[]; repository: string }): PlanEntry[]`、`formatPlan(entries: PlanEntry[]): string[]`（1.2 (e)） |
| `gh` の境界 | `GhRunner = (args: string[]) => Promise<{ stdout: string }>`。失敗時は `stderr` を持つ Error を reject する（T6 で ok 型から変更。2026-10-08）。引数の組み立てと JSON の検証は純粋関数（1.2 (f)） |
| CLI | `parseCliArgs(argv: string[]): { ok: true; options: CliOptions } \| { ok: false; message: string }`、`runReadyIssues(deps: { argv: string[]; runGh: GhRunner; readSpecFiles: () => Promise<SpecFile[]>; out: (line: string) => void; err: (line: string) => void }): Promise<number>`（戻り値が終了コード。1.2 (g)） |
| 引数 | `node:util` の `parseArgs`（`strict: true`）。`--assume-closed`（文字列・複数）、`--project`（文字列→正の整数）、`--owner`（文字列）、`--apply`（真偽）。短縮形は作らない |
| 終了コード | 0（正常。候補 0 件も 0）／1（使い方の誤り、`gh` の失敗、権限不足、Project の不整合、更新の失敗が 1 件以上）。仕様 6.2 どおり |
| 出力先 | 判定結果・更新計画・警告・更新の集計は標準出力。終了コード 1 の理由（使い方・権限不足・不整合・`gh` の失敗）は標準エラー出力（Q12） |
| AC-22 の規則 | `settings.json`: allow に `Bash(node scripts/ready-issues.mjs *)`、ask に `Bash(node scripts/ready-issues.mjs *--apply*)`。`guard-bash.sh`: 末尾に新しい節を足し、改行を空白にした文字列に `ready-issues\.mjs[^;&\|]*--apply` が合えば `pretool_ask`（1.2 (h)） |
| ADR | `docs/adr/0004-ready-candidates-from-dependencies.md`（1.2 (j)） |

### 1.2 設計判断と根拠

**(a) TypeScript・ESLint・Stop ゲートとの整合（調査結果）**

| 項目 | 現状（実際に読んだ内容） | 本計画での扱い |
| --- | --- | --- |
| Vitest | `vitest.config.mts` に `include` の指定なし（既定は `**/*.{test,spec}.?(c\|m)[jt]s?(x)`）。既定の環境は jsdom | `scripts/lib/*.test.ts` も既定で拾われる。各ファイル先頭に `// @vitest-environment node` |
| `tsconfig.json` | `allowJs: true`、`checkJs` なし、`strict: true`、`moduleResolution: "bundler"`、`include` は `**/*.ts` `**/*.tsx` `**/*.mts`（`*.mjs` は含まない） | `.test.ts` から import された `.mjs` だけがプログラムに入る。`.mjs` の先頭に `// @ts-check` を付けると、そのファイルが strict の設定で型検査される。JSDoc（`@typedef` `@param` `@returns`）で型を書き、`any` に落ちないようにする。入口 `scripts/ready-issues.mjs` はどの `.ts` からも import されないため `tsc` の対象外（薄く保ち、T7 のプロセス起動テストで補う） |
| ESLint | `eslint-config-next` の設定は `files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}']`（`node_modules/eslint-config-next/dist/index.js` 112〜113 行）。`pnpm lint` は `eslint .` | `.mjs` も Lint される。`post-edit.sh` の `LINT_TARGET_REGEX` も `mjs` を含むので、編集直後にも Lint が走る |
| Stop ゲート（`harness.env`） | `CODE_REGEX` は `mjs` を含む（`.mjs` を変えるとゲートが動く）。`SRC_REGEX` は `^(src\|app\|features\|lib\|components\|pages)/.*\.(ts\|tsx)$` で `scripts/` を含まない。`TEST_REGEX` は `\.(test\|spec)\.(ts\|tsx\|js\|jsx)$` と `^(tests\|e2e)/` で、**`.test.mjs` は含まない** | `.mjs` の変更では型・Lint・テストが走るが「テスト同伴」の検査対象にはならない（矛盾はしない）。テストを `.test.ts` にするので `TEST_REGEX` にも合う（将来 `SRC_REGEX` に `scripts/` を足しても破綻しない。提案 P1）。`.test.mjs` は `TEST_REGEX` に合わず型検査も受けないため採らない |
| CI `harness-lint` | `bash -n` と `shellcheck --severity=warning` を `.claude/hooks/*.sh scripts/*.sh` にかける | `.mjs` は対象外。`guard-bash.sh` の変更（T8）は shellcheck の対象になるので、既存の書式（`printf '%s' … \| grep -Eiq --`）に合わせる |
| 保護ファイル（`guard-files.sh`） | `CLAUDE.md` `.claude/*` `.github/workflows/*` `scripts/verify.sh` `scripts/harness-doctor.sh` は確認つき | `scripts/ready-issues.mjs` と `scripts/lib/*` は保護対象外。`.claude/settings.json`・`.claude/hooks/guard-bash.sh`（T8）、`.claude/commands/feature.md`（T9）は確認が出る |

- `.test.ts` から `.mjs` を import できること（`import { parseDependencies } from "./ready-issues-core.mjs"` が `pnpm typecheck` を通り、推論された型が付くこと）は T1 の RED の段階で最初に確かめる。通らない場合は同名の `ready-issues-core.d.mts` を置く案に切り替え、計画を更新して人間に報告する。

**(b) 依存の解釈（AC-1〜4）**

- 対象は仕様ファイルの**最初の `- 関連:` で始まる行だけ**にする。理由: 本文にも「依存:」が現れる（仕様 0014 の 9 行目「各仕様の冒頭に `依存: 0004, 0006` のように」）。行全体から探すと 0014 が 0004・0006 に依存していると誤認する。関連行が無い、または関連行に `依存:` が無いときは `[]`（AC-4。`依存なし` は `依存:` を含まないので `[]`）。
- 手順: (1) 関連行の `依存:`（半角コロン。既存の仕様はすべて半角）より後ろを取る。(2) 全角・半角の括弧 `（…）` `(…)` とその中身を取り除く（AC-3）。(3) `/(\d{4})\s*[〜～~]\s*(\d{4})|\d{4}/g` で番号と範囲を拾い、範囲は 4 桁ゼロ埋めで展開する（AC-2）。(4) 出現順を保って重複を除く。
- 前提外（範囲の始点 > 終点、5 桁以上の数）の結果は定めず、テストしない（Q8）。
- 表形式テスト（実際の `docs/specs/` の関連行をそのまま使う）:

| 関連行（抜粋） | 期待 | 根拠 |
| --- | --- | --- |
| `` - 関連: `0001-github-repo-search.md`（親仕様）、依存: 0004, 0006 `` | `["0004", "0006"]` | AC-1（0007） |
| `…、依存: 0006〜0010` | `["0006", "0007", "0008", "0009", "0010"]` | AC-2（0011） |
| `…、依存: 0009, 0010、0003（APIの接続先の差し替えが必要になる可能性）` | `["0009", "0010", "0003"]` | AC-3（0013） |
| `` …（親仕様）、依存なし、`harness/MANUAL.md` `` | `[]` | AC-4（0002） |
| `` - 関連: `harness/MANUAL.md` 10.4 … `` ＋本文に `依存: 0004, 0006` | `[]` | AC-4（0014。本文の「依存:」を拾わない） |
| `` …、`_assignment.md`（課題文）、依存: 0011 `` | `["0011"]` | 0012（依存より前の括弧と番号を含まない） |

- `extractSpecNumber`: `/^\[[^\]]+\]\s+(\d{4})(?=\s|$)/`。`[feat] 0003 GitHub APIクライアント` → `"0003"`、`[docs] 0012 README・AI利用レポート` → `"0012"`（AC-5）、`[chore] 開発時依存 …`・`[feat] 依存が完了した Issue を…` → `null`（AC-6）。
- `collectSpecDependencies`: ファイル名が `/^(\d{4})-.+\.md$/` のものだけを対象にする（`_template.md` `_assignment.md` を除く）。`SpecFile = { name: string; text: string }`。改行は `\r?\n` で分ける（Windows の CRLF）。

**(c) 対応づけと判定（AC-7〜12）**

- 型: `IssueSummary = { number: number; title: string; state: "OPEN" | "CLOSED"; url?: string }`（`url` は Project の更新で使う。判定には使わない。2026-10-08 に追加）。
- `indexIssuesBySpec`: 仕様番号が `null` の Issue は除く（AC-6）。同じ番号の Issue が 2 件以上なら `bySpec` に入れず `duplicates: { specNumber: string; issueNumbers: number[] }[]` に入れる（AC-7）。
- `classifyIssues` の規則（上から順に適用）:
  1. `assumeClosed` に含まれる番号の Issue は `CLOSED` とみなす（AC-12）。
  2. 判定の対象は「仕様番号があり、重複でなく、（みなしの後で）`OPEN` の Issue」。`CLOSED` は対象外（AC-11）。
  3. 仕様ファイルが無い（`specDependencies` に番号が無い）Issue は対象外にし、警告を出す（Q4）。
  4. 依存が `[]` の Issue は対象外（AC-11。「待ち」にも出さない）。
  5. 各依存を判定: 重複の番号 → `{ reason: "duplicate" }`（AC-7）、Issue が無い → `{ reason: "no-issue" }`（AC-10）、`OPEN` → `{ reason: "open", issueNumber }`（AC-9）、`CLOSED`（みなしを含む）→ 完了。
  6. すべて完了 → `ready`（AC-8）。みなしで完了にした依存の Issue 番号を `assumed` に入れる（AC-12）。1 つでも未完了 → `waiting`（`blockers` に未完了の依存だけ）。
- 戻り値: `Classification = { ready: ReadyEntry[]; waiting: WaitingEntry[]; warnings: string[] }`、`ReadyEntry = { issue: IssueSummary; specNumber: string; dependencies: string[]; assumed: number[] }`、`WaitingEntry = { issue: IssueSummary; specNumber: string; blockers: Blocker[] }`、`Blocker = { specNumber: string; reason: "open" | "no-issue" | "duplicate"; issueNumber?: number }`。並びは仕様番号の昇順（同じ入力に同じ結果。仕様 8 節）。
- 警告の文言: `警告: 仕様番号 0005 の Issue が複数あります（#5, #30）。この番号は未解決として扱います`／`警告: #40（0015）の仕様ファイルが見つかりません。判定の対象外にします`／`警告: Issue の取得が上限（1,000件）に達しました。一部の Issue が判定に含まれていない可能性があります`（仕様 7 節。件数が 1,000 以上のとき。`gh issue list --limit 1000` は総数を返さないため「超えた」は「上限に達した」で代える）。

**(d) 表示の整形と制御文字（AC-21）**

- `sanitizeForTerminal`: `/\p{Cc}/gu`（C0 制御文字・DEL・C1 制御文字。ESC `\x1b`・CR・LF・TAB を含む）を取り除く。ESC を除けば端末は制御列として解釈しないため、`\x1b[31m赤` は `[31m赤` と表示される（文字は残る。仕様の「制御文字を取り除いて表示」に一致）。双方向制御文字（`\p{Cf}` の U+202E 等）は仕様の範囲外（提案 P2）。
- Issue のタイトルのほか、`gh` の標準エラー出力や Project のフィールド名・選択肢名・Status の値など、外部から来た文字列はすべて表示前に通す。
- 表示タイトル: タイトル先頭の `[種別] NNNN ` を除いた残り（仕様 6.2 の例 `#8 0008 詳細ページ`）。
- `formatClassification` の出力（行の配列。テストは完全一致）:

```
== Ready にできる Issue（1件）==
#8 0008 詳細ページ（依存: 0003 ✓, 0004 ✓）
#9 0009 戻る導線（依存: 0006 ✓, 0008 ✓）仮定: #8
== 待ち（2件）==
#9 0009 戻る導線（待ち: 0008）
#13 0013 E2E（待ち: 0014 Issue なし, 0005 Issue が複数）
```

  - 0 件のときは見出しの下に `（なし）`。警告は最後に 1 行ずつ。

**(e) Project の更新計画（AC-14〜16・19）**

- 型: `ProjectField = { id: string; name: string; options?: { id: string; name: string }[] }`、`ProjectItem = { id: string; status: string | null; content: { type: string; number: number | null; repository: string | null } }`。
- `findStatusField`: 名前が `Status` のフィールドが無い → `{ ok: false, message: "Status フィールドが見つかりません（存在したフィールド: Title, Assignees, …）" }`。選択肢に `Ready` が無い → `{ ok: false, message: "Status の選択肢に Ready がありません（存在した選択肢: Todo, In Progress, Done）" }`。あれば `{ ok: true }`（更新は名前で指定するため ID は使わない。2026-10-08 変更）。名前は完全一致（大文字小文字を区別）。
- `planProjectUpdates`: 候補ごとに、`content.type === "Issue"`・`content.number === Issue 番号`・`content.repository === repository` の項目を探す。
  - 無い → `{ action: "absent" }` → `ボードに無い`（AC-14・15）。
  - Status が `Backlog` → `{ action: "update" }` → `Backlog → Ready（更新予定）`（AC-14・15）。
  - それ以外（`Ready` を含む。値が無い場合は `なし`）→ `{ action: "keep", currentStatus }` → `変更しない（現在: In progress）`（AC-14・15・16）。
- `PlanEntry = { issueNumber: number; specNumber: string; title: string; action: "update" | "keep" | "absent"; issueUrl: string; currentStatus: string | null }`。表示行は `#8 0008 詳細ページ: Backlog → Ready（更新予定）`。

**(f) `gh` の呼び出しの契約**

- 呼び出しは配列の引数で `execFile("gh", args, { encoding: "utf8", maxBuffer: 16 MiB, windowsHide: true })`（シェルを経由しない。仕様 6.2）。入口だけが `node:child_process` を import する。トークンを読まず、環境変数はそのまま引き継ぎ、表示しない。`gh auth refresh` は呼ばない（仕様 8 節）。
- 使う引数（**`--help` での確認前の想定**。T5 の最初に確認して表を更新する）:

| 目的 | 引数の配列 | 使う出力 |
| --- | --- | --- |
| Issue の一覧 | `["issue", "list", "--state", "all", "--json", "number,title,state,url", "--limit", "1000"]` | `[{ number, title, state: "OPEN" \| "CLOSED", url }]` |
| リポジトリ（`--project` のときだけ） | `["repo", "view", "--json", "nameWithOwner"]` | `{ nameWithOwner: "owner/repo" }`（Q1） |
| フィールド | `["project", "field-list", "3", "--owner", "<owner>", "--format", "json"]` | `{ fields: [{ id, name, type, options?: [{ id, name }] }] }` |
| 項目 | `["project", "item-list", "3", "--owner", "<owner>", "--format", "json", "--limit", "1000"]` | `{ items: [{ id, status?, content: { type, number, repository } }], totalCount }`。Status の値はフィールド名を小文字にしたキー（`status`）に入る想定（Q6） |
| 更新（`--apply` のときだけ） | `["project", "item-edit", "3", "--owner", "<owner>", "--url", "<Issue の URL>", "--field", "Status", "--value", "Ready"]`（名前で指定する形。`gh project item-edit --help` で「通常の方法」とされている。2026-10-08 に人間が採用） | なし（終了コードだけ） |

- 確認の方法: `gh issue list --help`・`gh repo view --help`・`gh project field-list --help`・`gh project item-list --help`・`gh project item-edit --help` を実行する。**読み取りの実行（`--help` 以外）はしない**（Project の権限が無い）。`gh project item-edit --help` は `guard-bash.sh` の 3b の `ask_if` と `settings.json` の ask に合うため確認が出る。`gh project field-list` は allow に無いため確認が出る。いずれも人間に承認してもらう（内容は表示だけで変更しない）。
- 出力の検証: `parseIssueList` `parseRepoView` `parseFieldList` `parseItemList`（いずれも `stdout: string` を受け、`JSON.parse` の結果を `unknown` として形を確かめ、型付きの値を返す。形が違えば例外を投げ、CLI が「`gh` の出力を解釈できませんでした」と表示して終了コード 1）。zod は依存に無いため手書きの検証にする（依存を追加しない。仕様 4.1）。
- 権限不足の検知: `isMissingScopes(stderr: string): boolean` = `/missing required scopes/i.test(stderr)`。どの `gh` の呼び出しでも、失敗の標準エラー出力に含まれれば AC-18 の表示（`gh auth refresh -s project` をご自身のターミナルで実行してください）にして終了コード 1。
- Project が見つからない（AC-19）: `gh project field-list` が失敗し、権限不足でないとき → `Project #3（所有者: owner）が見つかりませんでした` と、`gh` の標準エラー出力（制御文字を除去）を表示して終了コード 1。

**(g) 引数と流れ（`runReadyIssues`）**

- `parseArgs({ args: argv, options: { "assume-closed": { type: "string", multiple: true }, project: { type: "string" }, owner: { type: "string" }, apply: { type: "boolean" } }, strict: true, allowPositionals: true, tokens: false })`。例外（未知のオプション、値の欠落、`--apply=true` のような真偽への値）は捕まえて使い方を表示し、終了コード 1。
- 値の検証: Issue 番号は `#` を 1 つまで許して `/^[1-9]\d*$/`。`--project` は `/^[1-9]\d*$/`。`--owner` は `@me` か `/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/`（引数は配列で渡すので注入は起きないが、外部入力として検証する。`.claude/rules/40-security.md`）。
- `--assume-closed 8 9`（仕様 6.2 の「番号は複数可」）: 位置引数は `--assume-closed` があるときだけ追加の番号として受け付け、それ以外の位置引数は使い方の誤りにする。`--assume-closed 8 --assume-closed 9` も可（Q3）。
- 使い方の誤り（終了コード 1、`gh` を一度も呼ばない）: `--apply` だけで `--project` が無い（AC-17）、`--apply` と `--assume-closed` の併用（Q2。仮定で Ready に更新しないため）、上記の値の誤り。
- 流れ: 引数 → `gh issue list` → 仕様ファイルの読み込み → `classifyIssues` → 表示 → `--project` が無ければ 0 → `gh repo view`（`--owner` が無いときの所有者と、項目の照合に使うリポジトリ名）→ `gh project field-list` → `findStatusField` → `gh project item-list` → `planProjectUpdates` → 表示 → `--apply` が無ければ 0（AC-13・14）→ `update` の項目ごとに `gh project item-edit`。失敗しても続行し、最後に `更新: 成功 1 件 / 失敗 1 件` を表示（AC-20）。失敗が 1 件以上なら 1、それ以外は 0（AC-15・16。更新 0 件も `更新: 成功 0 件 / 失敗 0 件` で 0）。
- 仕様ファイルの読み込みは入口が `new URL("../docs/specs/", import.meta.url)` を基準に行う（実行時のカレントディレクトリに依存しない）。

**(h) AC-22 の規則（`settings.json` と `guard-bash.sh`）**

- `settings.json`（評価の順は deny → ask → allow。MANUAL 4.3）:
  - allow に `"Bash(node scripts/ready-issues.mjs *)"`（MANUAL 4.3 の表どおり、引数なしの `node scripts/ready-issues.mjs` も含む）。
  - ask に `"Bash(node scripts/ready-issues.mjs *--apply*)"`。**パターンの途中の `*` が使えるかは Claude Code の公式ドキュメント（permissions）で T8 の最初に確認する**（Q10）。使えない場合でも、下の hook が allow より優先して確認を出すので AC-22 は満たせる（その場合は ask の行を足さず、理由を MANUAL に書く）。
- `guard-bash.sh`: 新しい節「6. リポジトリのスクリプトによる GitHub への書き込み」を**ファイルの末尾（`exit 0` の直前）**に置く。理由: `pretool_ask` はその場で終了するので、途中に置くと後ろの拒否の規則（4. `.env` の読み取り、5. パッケージマネージャ）より先に「確認」で抜けてしまう（例: `node scripts/ready-issues.mjs --apply; cat .env`）。
  ```bash
  # scripts/ready-issues.mjs は内部で gh project item-edit を呼ぶため、3b の確認が効かない。--apply を含む実行そのものを確認する。
  # 行継続（\ と改行）で --apply が次の行に来ても検出できるよう、改行を空白に置き換えてから照合する。
  flat="$(printf '%s' "$cmd" | tr '\r\n' '  ')"
  if printf '%s' "$flat" | grep -Eiq -- 'ready-issues\.mjs[^;&|]*--apply'; then
    pretool_ask '[harness] Project の Status を更新する操作（ready-issues.mjs --apply）です。表示された候補と更新予定を確認してください。'
  fi
  ```
- 照合の考察（`$stripped` ではなく元の `$cmd` を使う。`$stripped` だと `node "scripts/ready-issues.mjs" --apply` や `node scripts/ready-issues.mjs "--apply"` で引用符の中が消えて素通りするため）:

| コマンド | hook | settings | 判定の理由 |
| --- | --- | --- | --- |
| `node scripts/ready-issues.mjs --project 3 --apply` | 確認 | 確認 | 基本形 |
| `node scripts/ready-issues.mjs --apply --project 3` | 確認 | 確認 | 引数の順序に依らない |
| `node scripts\ready-issues.mjs --project 3 --apply` | 確認 | 許可に無い→既定で確認 | ディレクトリ区切りを見ない |
| `node ./scripts/ready-issues.mjs --apply` | 確認 | 許可に無い→既定で確認 | 同上 |
| `node "scripts/ready-issues.mjs" "--apply" --project 3` | 確認 | 許可に無い→既定で確認 | 元の文字列で照合 |
| `cd scripts && node ready-issues.mjs --apply --project 3` | 確認 | 許可に無い→既定で確認 | `&&` の後ろの区間で照合 |
| `node scripts/ready-issues.mjs --project 3 \`（改行）`  --apply` | 確認 | 不明 | 改行を空白にしてから照合（settings 側が許可に倒れても hook が確認する） |
| `node scripts/ready-issues.mjs --project 3 --apply \| tee log.txt` | 確認 | 確認 | `--apply` は `\|` より前 |
| `node scripts/ready-issues.mjs` / `--assume-closed 8` / `--project 3` / `--project 3 --owner foo` | 出力なし | 許可 | AC-22 の後半 |
| `node scripts/ready-issues.mjs --project 3 && echo --apply` | 出力なし | 許可（各区間で判定） | `&&` で区間が切れる（正しく素通り） |
| `pnpm test scripts/lib/ready-issues-cli.test.ts` | 出力なし | 許可 | ファイル名が `ready-issues.mjs` ではない |
| `git commit -m "feat: ready-issues.mjs に --apply を追加"` | **確認（誤検知）** | 許可 | 引用符の中も照合するため。安全側の誤検知として受け入れる（Q9） |

- 偽陰性として残るもの: `node -e` で `gh project item-edit` を直接呼ぶ、別名のファイルにコピーして実行する、など。これらは allow に無いので `settings.json` の既定（確認）に落ちる。hook はサンドボックスではない（MANUAL 10.7）ことを ADR に書く。
- `--apply` の短縮形（`-a`）・環境変数・設定ファイルでの有効化を作らないこと自体が規則の前提（1 節）。`parseArgs` の `strict: true` により `--APPLY`・`--apply=true` は使い方の誤りになる。

**(i) AC-22〜24 の検査方法（構造のテスト）**

- `tests/harness/ready-issues-harness.test.ts`（`// @vitest-environment node`。`tests/foundation/env-files.test.ts` と同じく `node:fs` と `execFileSync` を使う）。
- AC-22（hook）: 1.2 (h) の表のコマンドごとに `{"tool_input":{"command": …}}` を作り、`execFileSync("bash", [".claude/hooks/guard-bash.sh"], { input, env: { ...process.env, CLAUDE_PROJECT_DIR: root } })` で実行する。確認の行は標準出力の JSON の `hookSpecificOutput.permissionDecision` が `"ask"`、許可の行は標準出力が空、であることを `it.each` で検証する（実際の規則の動作を検証でき、正規表現の写しを持たない）。Windows で `bash` が WSL の `bash.exe` に解決される・`jq` が無い場合に失敗するため、Q5 で確認する。
- AC-22（settings）: `.claude/settings.json` を `JSON.parse` し、`permissions.allow` に `Bash(node scripts/ready-issues.mjs *)`、`permissions.ask` に `Bash(node scripts/ready-issues.mjs *--apply*)` が含まれ、allow に `Bash(node *)` のような広い規則が無いことを検証する（Claude Code の照合器はテストから呼べないため文字列で確かめる）。
- AC-23: `.claude/commands/feature.md` の Step 6 の節（`### Step 6.` から次の `## ` まで）に `node scripts/ready-issues.mjs --assume-closed` が含まれ、`--apply` が含まれないこと。
- AC-24: `docs/harness/MANUAL.md` の `### 10.4` から `### 10.5` までを切り出し、`| Ready |` で始まる行に「候補」と「承認」が含まれ「**人間** |」の旧記述が無いこと、節内に `node scripts/ready-issues.mjs --project` と `--apply` の使い方があること。

**(j) ADR の書き方**

- `docs/adr/0004-ready-candidates-from-dependencies.md`（テンプレート `0000-template.md` の構成。Status は `Proposed`、承認後に `Accepted`。決定者は人間）。
- 背景: MANUAL 10.4「Ready は人間が動かす」「Claude はボードの状態を自動では変更しません」。依存の手作業での照合が手間で漏れる（仕様 1 節）。
- 選択肢: 案A 現状（人間が手で照合して動かす）／案B スクリプトが候補を機械的に出し、人間が承認して `--apply` で更新する（採用）／案C GitHub Actions で自動更新（Project の権限をもつトークンをシークレットに置く必要があり、ハーネスの方針と衝突。仕様 4.2）／案D Projects の組み込み Workflows（依存関係を条件にできない）。
- 影響: 書き込みは `--apply` だけ、二重の確認（`settings.json` と `guard-bash.sh`）、`project` スコープは人間が付与。ADR 0002（Issue / Projects を管理元にする）は変更しない（状態の管理元は引き続き Projects）。追従が必要な更新: MANUAL 4.5・10.1・10.2・10.4・10.5・付録 A、`commands/feature.md`、`settings.json`、`guard-bash.sh`。
- 確認できていない点（「未確認」と明記）: 実際の `--apply` の動作、`gh project item-list` の出力の形（仕様 9 節）。

**(k) `/feature` の完了報告の手順（`.claude/commands/feature.md`）**

- Step 6 に 1 項目を足す: 「完了報告の前に `node scripts/ready-issues.mjs --assume-closed <この Issue の番号>` を実行し、出力の『Ready にできる Issue』を『この PR がマージされたら着手できるタスク』として報告に載せる。`--apply` は付けない（Ready への更新は、人間がマージ後に `--project <番号> --apply` を確認のうえで実行する）。`gh` が使えない・終了コードが 1 のときは、出力を事実のまま載せて続行する。」
- `allowed-tools` には足さない（`settings.json` の allow で足りる。`allowed-tools` に広い形を足すと `--apply` まで事前許可になるおそれがあるため）。

## 2. 影響範囲

| 種別 | パス | 内容 |
| --- | --- | --- |
| 新規 | `scripts/lib/ready-issues-core.mjs` / `ready-issues-core.test.ts` | 依存の解釈・仕様番号・対応づけ・判定（T1・T2） |
| 新規 | `scripts/lib/ready-issues-format.mjs` / `ready-issues-format.test.ts` | 制御文字の除去・判定結果の整形（T3） |
| 新規 | `scripts/lib/ready-issues-project.mjs` / `ready-issues-project.test.ts` | Status フィールドの検証・更新計画（T4） |
| 新規 | `scripts/lib/ready-issues-gh.mjs` / `ready-issues-gh.test.ts` | `gh` の引数・出力の検証・権限不足の検知（T5） |
| 新規 | `scripts/lib/ready-issues-cli.mjs` / `ready-issues-cli.test.ts` | 引数のパースと全体の流れ（T6・T7） |
| 新規 | `scripts/ready-issues.mjs` / `scripts/ready-issues.test.ts` | 入口と、プロセス起動のスモークテスト（T7） |
| 新規 | `tests/harness/ready-issues-harness.test.ts` | AC-22〜24 の構造テスト（T8・T9） |
| 新規 | `docs/adr/0004-ready-candidates-from-dependencies.md` | 運用方針の変更（T9） |
| 変更（保護・確認あり） | `.claude/settings.json` | allow / ask に 1 行ずつ（T8） |
| 変更（保護・確認あり） | `.claude/hooks/guard-bash.sh` | 末尾に `--apply` の確認の節（T8） |
| 変更（保護・確認あり） | `.claude/commands/feature.md` | Step 6 に候補の報告（T9） |
| 変更 | `docs/harness/MANUAL.md` | 4.5 の gh ルール表・10.2（T8）、10.1・10.4・10.5・10.9・10.10・付録 A（T9） |
| 変更なし | `app/` `features/` `lib/` `package.json` ロックファイル `.claude/harness.env` `CLAUDE.md` `scripts/*.sh` `.github/workflows/` | 触らない |

## 3. タスク（1 タスク = 1 コミットの大きさ）

- [x] **T1: 依存の解釈と仕様番号の取り出し**
  - 対応 AC: AC-1、AC-2、AC-3、AC-4、AC-5、AC-6
  - 先に書くテスト: `scripts/lib/ready-issues-core.test.ts`（`it.each` の表形式。期待値は配列・文字列のリテラル）
    - `AC-1: 依存: 0004, 0006 の関連行から ["0004", "0006"] を返し、依存より前の 0001 を含めない`
    - `AC-2: 依存: 0006〜0010 を 0006〜0010 の 5 件に展開する`
    - `AC-3: 括弧内の文と番号を無視して ["0009", "0010", "0003"] を返す`
    - `AC-4: 依存なし・依存の無い関連行・関連行の無い文書・本文にだけ「依存:」がある文書は [] を返す`（1.2 (b) の表）
    - `AC-5: [feat] 0003 … と [docs] 0012 … から 0003・0012 を取り出す`
    - `AC-6: 種別のあとに 4 桁の番号が無いタイトルは null を返す`
    - `collectSpecDependencies: NNNN-*.md だけを対象にし、_template.md と _assignment.md を除く`（AC-4・5 の補強）
  - RED: 各関数を `return []` / `return null` / `return new Map()` だけの仮実装にして、期待値の不一致で失敗することを確認する。同時に `pnpm typecheck` と `pnpm lint` が `.ts` → `.mjs` の import で通ることを最初に確かめる（1.2 (a)。通らなければ計画を更新して報告）。
  - 実装対象: `scripts/lib/ready-issues-core.mjs`、`scripts/lib/ready-issues-core.test.ts`（2 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T2: Issue と仕様の対応づけと「Ready にできる」の判定**
  - 対応 AC: AC-7、AC-8、AC-9、AC-10、AC-11、AC-12
  - 先に書くテスト: `scripts/lib/ready-issues-core.test.ts` に追加（入力の Issue 一覧と依存の Map はテスト内のリテラル）
    - `AC-7: 仕様番号 0005 の Issue が 2 件あると duplicates に番号と Issue 番号を返し、bySpec に入れない`
    - `AC-7: 重複した番号は候補にならず、それに依存する Issue は「待ち」（Issue が複数）になる`
    - `AC-8: 依存 0003・0004 がどちらも CLOSED の 0008（OPEN）を ready に含める`
    - `AC-9: 0006 が CLOSED・0008 が OPEN のとき 0009 を waiting に入れ、blockers は 0008 だけである`
    - `AC-10: 依存先 0014 の Issue が無いとき waiting に「no-issue」として入れる`
    - `AC-11: CLOSED の Issue と、依存が [] の OPEN の Issue は ready にも waiting にも入れない`
    - `AC-12: assumeClosed [8] のとき 0009 を ready に含め、assumed に 8 を入れる`
    - `AC-12: assumeClosed に入れた Issue 自身は CLOSED とみなして ready に含めない`（補強）
    - `仕様ファイルの無い OPEN の Issue は対象外にして警告を返す`（Q4）
  - RED: `classifyIssues` を空の結果を返す仮実装にして失敗を確認する。
  - 実装対象: `scripts/lib/ready-issues-core.mjs`、`scripts/lib/ready-issues-core.test.ts`（2 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T3: 表示の整形と制御文字の除去**
  - 対応 AC: AC-21、AC-9・AC-10・AC-12・AC-7 の表示部分
  - 先に書くテスト: `scripts/lib/ready-issues-format.test.ts`
    - `AC-21: ESC（\x1b[31m）・CR・LF・DEL・C1 制御文字を取り除き、通常の文字（日本語・絵文字・✓）は残す`
    - `AC-21: タイトルに ESC を含む Issue を整形した行に \x1b が含まれない`
    - `表示: ready は「#8 0008 詳細ページ（依存: 0003 ✓, 0004 ✓）」の形になる`（1.2 (d) の例を完全一致）
    - `AC-12: 仮定した Issue があると行末に「仮定: #8」を付ける`
    - `AC-9/10/7: 待ちの行は「（待ち: 0008）」「0014 Issue なし」「0005 Issue が複数」を表示する`
    - `0 件のときは見出しの下に「（なし）」を表示する`
  - RED: `sanitizeForTerminal` を入力をそのまま返す仮実装、`formatClassification` を `[]` を返す仮実装にして失敗を確認する。
  - 実装対象: `scripts/lib/ready-issues-format.mjs`、`scripts/lib/ready-issues-format.test.ts`（2 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T4: Status フィールドの検証と Project の更新計画**
  - 進捗: RED（テスト 21 件中 20 件が失敗）→ GREEN（verify --quick PASS、431 件）。変異確認: 「Backlog 以外も update」「repository の照合を外す」「content.type の照合を外す」の 3 つで、いずれもテストが 2 件失敗することを確認し、元に戻した。
  - 申し送り: `displayTitle` の正規表現が format.mjs と project.mjs の 2 か所にある。T6 で共通化するか判断する。`gh project` の実際の JSON 形は T5 でも未確認のまま（`project` スコープが必要）。
  - 対応 AC: AC-14、AC-15、AC-16（計画の部分）、AC-19（フィールド・選択肢の部分）
  - 先に書くテスト: `scripts/lib/ready-issues-project.test.ts`
    - `AC-19: Status フィールドが無いとき、存在したフィールド名の一覧を含む理由を返す`
    - `AC-19: Status の選択肢に Ready が無いとき、存在した選択肢の一覧を含む理由を返す`
    - `AC-14/15: Backlog は update、In progress は keep、ボードに無い候補は absent になる`
    - `AC-16: Status が Ready の候補は keep になり、update が 0 件である`
    - `別のリポジトリの同じ番号の Issue・Pull Request・下書きの項目とは照合しない`（補強）
    - `AC-14: 表示は「Backlog → Ready（更新予定）」「変更しない（現在: In progress）」「ボードに無い」になる`
  - RED: `planProjectUpdates` を `[]`、`findStatusField` を常に `{ ok: true, … }` を返す仮実装にして失敗を確認する。
  - 実装対象: `scripts/lib/ready-issues-project.mjs`、`scripts/lib/ready-issues-project.test.ts`（2 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T5: `gh` の境界（引数・出力の検証・権限不足の検知）**
  - 進捗: RED（35 件中 32 件失敗）→ GREEN（verify --quick PASS、466 件）。変異確認: Issue の state・nameWithOwner の形式検査・Status の値・大文字小文字の無視・item-list の上限の 5 つで検出。「options が配列でない」の分岐の除去は、後続の `.map` が例外になるため動作が変わらない等価な変異で未検出（問題なし）。`parseProjectView` はフロー（g）で使わないため作らなかった。
  - 着手前の確認（2026-10-08、gh 2.102.0）: `issue list`（`--state`・`--json`・`--limit`、JSON フィールドに number/title/state/url）、`repo view`（`--json nameWithOwner`）、`project field-list`（`--owner`・`--format json`・`--limit` 既定 30）、`project item-list`（`--owner`・`--format json`・`--limit` 既定 30）、`project item-edit`（名前で指定する形）はいずれも 1.2 (f) の想定と一致。`--help` では JSON の出力形（`fields` / `items` の形、Status のキー名）は分からないため未確認のまま。`field-list` は既定 30 件までだが、フィールド数は通常それより少ないので `--limit` は付けない。
  - 対応 AC: AC-18（検知の部分）、AC-13〜16 の前提（引数の形）
  - 着手前: 1.2 (f) の `--help` を確認し（`gh project item-edit --help` と `gh project field-list --help` は確認が出る。人間に承認してもらう）、表と本計画の進捗メモを更新する。想定と違えば人間に報告してから進める。
  - 先に書くテスト: `scripts/lib/ready-issues-gh.test.ts`
    - 引数の組み立て関数が 1.2 (f) の配列を返す（`toEqual` で完全一致。`--limit 1000`、`--format json` を含む）
    - `parseIssueList`・`parseFieldList`・`parseItemList`・`parseProjectView`・`parseRepoView` が想定の JSON を型付きの値にし、形の違う JSON（配列でない、`number` が文字列、`state` が想定外）では例外を投げる
    - `AC-18: 標準エラー出力に「missing required scopes」を含むとき isMissingScopes が true、それ以外は false`
  - RED: 各関数を仮実装（空配列・`false`）にして失敗を確認する。
  - 実装対象: `scripts/lib/ready-issues-gh.mjs`、`scripts/lib/ready-issues-gh.test.ts`（2 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T6: CLI（引数のパースと読み取りの流れ）**
  - 進捗: RED（41 件中 38 件失敗）→ GREEN（verify --quick PASS）。変異確認: 9 つ（`--apply` の制約 2 種、上限警告の境界、権限不足の案内、所有者の既定、位置引数、owner の検証、Status 検証、stderr の sanitize）すべてで検出。
  - テストの修正（理由つき）: RED の `--assume-closed 8 9` は #9 自身も仮定クローズして「#9 が ready」を期待していたが、計画 T2 の「仮定した Issue 自身は候補に出さない」と矛盾していた。2 つ目を #10（0009 と無関係）に変えた。期待値を弱めたのではなく、テストの前提の誤りの訂正。
  - REFACTOR: `displayTitle` を format.mjs から export して project.mjs と共通化した。
  - 注意: この時点の `--apply` は読み取りまでで item-edit を呼ばない（T7 で実装）。
  - 対応 AC: AC-12（引数）、AC-13、AC-14、AC-17、AC-18、AC-19（Project が無い）、仕様 7 節（1,000 件の警告）
  - 先に書くテスト: `scripts/lib/ready-issues-cli.test.ts`（偽の `runGh` は呼ばれた引数の配列を記録し、引数に応じて用意した `stdout` / 失敗を返す。`readSpecFiles` はリテラルの仕様を返す。`out` / `err` は配列に集める）
    - `AC-12: --assume-closed 8 と --assume-closed 8 9 と #8 を受け付け、不正な番号は使い方の誤りで終了コード 1`
    - `AC-13: --apply が無いとき（引数なし・--project 3）は item-edit を一度も呼ばない`（記録した引数に `item-edit` が無い）
    - `AC-14: --project 3 では読み取り（issue list・repo view・field-list・item-list）だけを行い、3 種の状態を表示して終了コード 0`
    - `AC-17: --apply だけのとき使い方を表示し、gh を一度も呼ばず終了コード 1`
    - `Q2: --apply と --assume-closed を併用すると使い方の誤りで、gh を呼ばず終了コード 1`
    - `AC-18: field-list が missing required scopes で失敗すると、「gh auth refresh -s project をご自身のターミナルで実行してください」を表示し、item-edit を呼ばず終了コード 1`
    - `AC-19: field-list が失敗すると Project の番号と所有者を表示して終了コード 1、Status / Ready が無いと選択肢の一覧を表示して終了コード 1`
    - `issue list が 1,000 件のとき上限の警告を表示する`
    - `未知のオプション・--apply=true は使い方の誤りで終了コード 1`
  - RED: `runReadyIssues` を常に 0 を返す仮実装にして失敗を確認する。
  - 実装対象: `scripts/lib/ready-issues-cli.mjs`、`scripts/lib/ready-issues-cli.test.ts`（2 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T7: CLI（`--apply` の更新）と入口**
  - 進捗: RED（49 件中 7 件失敗）→ GREEN（verify --quick PASS）。変異確認: 更新対象の絞り込み・終了コード・失敗時の続行・`--apply` の有無・成功件数で検出。空 URL の防御は初め未検出だったため、テスト（AC-20 の補強）を追加し、変異で検出されることを確認した。
  - 実機確認（2026-10-08）: `node scripts/ready-issues.mjs`（引数なし）で、実際の Issue から「Ready にできる: #8 0008」「待ち: #9〜#13」が表示された（終了コード 0）。`--project` / `--apply` の実機実行は `project` スコープが無いため未実施。
  - 対応 AC: AC-15、AC-16、AC-20、AC-17（実プロセス）
  - 先に書くテスト:
    - `scripts/lib/ready-issues-cli.test.ts` に追加
      - `AC-15: A=Backlog・B=In progress・C=ボードに無いとき、item-edit を A に対して 1 回だけ、1.2 (f) の引数で呼び、B と C の理由を表示する`
      - `AC-16: A が Ready になった状態で再実行すると item-edit を呼ばず「成功 0 件 / 失敗 0 件」で終了コード 0`
      - `AC-20: A の更新は成功・B の更新は失敗のとき、B を表示して続行し、「成功 1 件 / 失敗 1 件」を表示して終了コード 1`
      - `AC-18: item-edit が missing required scopes で失敗したときも権限不足の案内を表示する`（補強）
    - `scripts/ready-issues.test.ts`（`execFileSync(process.execPath, ["scripts/ready-issues.mjs", "--apply"])` を実行。`gh` は呼ばれない）
      - `AC-17: 実プロセスで --apply だけを付けると使い方を表示して終了コード 1`
      - `未知のオプションで終了コード 1`
  - RED: 更新の部分を未実装（`--apply` でも何もしない）にして AC-15・20 が失敗し、入口のファイルが無い状態でスモークテストが「使い方が出ない」ことで失敗することを確認する（モジュールが見つからないエラーは RED と認めないため、入口は先に `process.exitCode = 0` だけの仮実装を置く）。
  - 実装対象: `scripts/lib/ready-issues-cli.mjs`、`scripts/lib/ready-issues-cli.test.ts`、`scripts/ready-issues.mjs`、`scripts/ready-issues.test.ts`（4 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。`node scripts/ready-issues.mjs`（引数なし。読み取りだけ。allow に入る前なので確認が出る）を実行し、実際の Issue で判定が表示されることを確かめる（結果を進捗メモに記録）。

- [x] **T8: ハーネスへの組み込み（`--apply` を確認の対象にする）** ※ 保護ファイル 2 つ。編集時に確認が出る
  - 進捗: RED（21 件中 11 件失敗）→ GREEN（21 件 PASS）。Vitest から Git Bash と jq が動くことを確認（Q5 は文字列検査への切り替え不要）。変異確認: 照合を `$stripped` にする／節を `.env` の規則より前に移す／`[^;&|]*` を `.*` にする／改行の置換を外す、の 4 つすべてで検出。
  - Q10: 公式ドキュメント（permissions）では `*` は先頭・途中・末尾に置ける（調査エージェント経由。出典: https://code.claude.com/docs/en/permissions.md の Wildcard patterns）ため ask の行を足した。同じ報告に評価順（deny → ask → allow）と矛盾する記述（allow が優先する例）があり、実機では未確認。確認が出ることは hook が保証するので AC-22 には影響しない。
  - 注意: hook と settings の変更は **セッションの再起動で反映される**。このセッションでは反映前のため、`--apply` の確認は手動で hook を実行して見た（テストが同じことを検証している）。
  - 対応 AC: AC-22
  - 着手前: Claude Code の公式ドキュメント（permissions）で、パターンの途中の `*` の可否を確認する（Q10）。
  - 先に書くテスト: `tests/harness/ready-issues-harness.test.ts`（1.2 (i)）
    - `it.each`: `AC-22: 「$command」は guard-bash.sh で確認（ask）になる`（1.2 (h) の表の確認の行）
    - `it.each`: `AC-22: 「$command」は guard-bash.sh で止まらない`（許可の行。commit メッセージの誤検知の行は「確認になる」側に入れて挙動を固定する）
    - `AC-22: settings.json の allow に Bash(node scripts/ready-issues.mjs *)、ask に Bash(node scripts/ready-issues.mjs *--apply*) があり、Bash(node *) は無い`
    - `AC-22: 既存の規則は変わらない（.env の読み取りを含むコマンドは --apply があっても deny になる）`（節を末尾に置く理由の固定）
  - RED: 設定と hook を変える前に実行し、確認の行と settings のテストが失敗し、止まらない行が通ることを確認する。
  - 実装対象: `.claude/settings.json`、`.claude/hooks/guard-bash.sh`、`tests/harness/ready-issues-harness.test.ts`、`docs/harness/MANUAL.md`（4.5 の「`guard-bash.sh` の GitHub（`gh`）ルール」の表の確認の行と、10.2 のガードの行に `ready-issues.mjs --apply` を追記）（4 ファイル）
  - 完了条件: `pnpm test` PASS、`jq empty .claude/settings.json`、`bash scripts/harness-doctor.sh` に FAIL が無い、MANUAL 4.5 の手順で hook を手動実行して確認と素通りの両方を見る、`bash scripts/verify.sh --quick` PASS。hook の変更はセッションの再起動で反映されることを報告する。

- [x] **T9: `/feature` の手順・MANUAL の運用・ADR** ※ 保護ファイル 1 つ（`feature.md`）。編集時に確認が出る
  - 進捗: RED（27 件中 6 件失敗）→ GREEN（27 件 PASS）。`feature.md` の Step 6、MANUAL の 10.1・10.4・10.5・10.9・10.10・付録 A、ADR 0004（Status: Proposed。確認できていない点を明記）を更新。
  - 対応 AC: AC-23、AC-24
  - 先に書くテスト: `tests/harness/ready-issues-harness.test.ts` に追加
    - `AC-23: feature.md の Step 6 に node scripts/ready-issues.mjs --assume-closed の手順があり、--apply を含まない`
    - `AC-24: MANUAL 10.4 の Ready の行が候補と承認の運用になり、旧記述「**人間** |」が無い`
    - `AC-24: MANUAL 10.4 に node scripts/ready-issues.mjs --project と --apply の使い方がある`
  - RED: 文書を変える前に実行して失敗を確認する。
  - 実装対象:
    - `.claude/commands/feature.md`（1.2 (k)）
    - `docs/harness/MANUAL.md`: 10.4 の Ready の行（動かす人「人間が承認（候補はスクリプト）」、きっかけ「仕様の依存がすべて完了すると候補が出る」）、使い方（`node scripts/ready-issues.mjs`、`--assume-closed`、`--project <番号>`、`--project <番号> --apply`、前提の `gh auth refresh -s project` は人間が実行）、末尾の「Claude はボードの状態を自動では変更しません」を「`--apply` を付けたときだけ、確認のうえで Backlog → Ready に限り変更する」に改める。整合のため 10.1 の図の「(人間が移動)」、10.5 の 2、10.9 の表（`missing required scopes`）、10.10 の未検証（`--apply`）、付録 A のファイル一覧も直す（Q11）
    - `docs/adr/0004-ready-candidates-from-dependencies.md`（1.2 (j)）
    - `tests/harness/ready-issues-harness.test.ts`
    - （4 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [ ] **T10: 最終確認とレビュー**
  - 対応 AC: なし（検証）
  - 確認:
    - `bash scripts/verify.sh`（full）を実行し、PASS/FAIL を事実のまま進捗メモに記録する。
    - 実機（読み取りだけ）: `node scripts/ready-issues.mjs` と `node scripts/ready-issues.mjs --assume-closed <番号>` を実行し、現在の Issue の状態で判定が妥当か（例: 0003・0004 が CLOSED なら 0008 が候補）を目で確かめる。`--project` と `--apply` は権限が無いため実行しない（仕様 9 節の未決として残す）。
    - hook の手動テスト（MANUAL 4.5 の手順）。
    - `reviewer` と `security-reviewer`（外部コマンドの実行・他者の入力の表示・ハーネスの規則に触れるため）を並列で起動し、Critical / Major を直す。
  - 実装対象: 本計画の進捗メモ（1 ファイル）
  - 完了条件: `verify.sh` PASS、計画の `Status` を更新。

### 提案（仕様外。人間の判断で採否を決める。本計画のタスクには含めない）

- P1: `.claude/harness.env` の `SRC_REGEX` に `^scripts/.*\.mjs$` を足し、`scripts/` の変更にもテストの同伴を求める（保護ファイル。テストは `.test.ts` なので `TEST_REGEX` は変えなくてよい）。
- P2: 表示前に双方向制御文字（U+202A〜202E、U+2066〜2069）も取り除く（タイトルの見た目の偽装を防ぐ。仕様は「制御文字」までを定めている）。
- P3: `--help` / `-h` で使い方を表示して終了コード 0。
- P4: `harness-doctor.sh` で Node のバージョンが 22 以上かを確かめる。
- P5: `--apply` の後に、更新した項目を `item-list` で読み直して確かめる。

## 4. テスト方針

| 種類 | 対象 | ファイル | 環境 | モック |
| --- | --- | --- | --- | --- |
| 単体（表形式） | 依存の解釈・仕様番号・対応づけ・判定 | `scripts/lib/ready-issues-core.test.ts` | node | なし |
| 単体 | 制御文字の除去・整形 | `scripts/lib/ready-issues-format.test.ts` | node | なし |
| 単体 | Status フィールドの検証・更新計画 | `scripts/lib/ready-issues-project.test.ts` | node | なし |
| 単体 | `gh` の引数・出力の検証・権限不足の検知 | `scripts/lib/ready-issues-gh.test.ts` | node | なし（文字列の入力だけ） |
| 結合 | CLI の全体の流れ（AC-12〜20） | `scripts/lib/ready-issues-cli.test.ts` | node | `runGh`（引数の配列を記録する偽の実装）、`readSpecFiles`、`out` / `err` |
| スモーク | 入口の実プロセス（`gh` を呼ばない経路だけ） | `scripts/ready-issues.test.ts` | node | なし |
| 構造 | `settings.json`・`guard-bash.sh`（実行）・`feature.md`・MANUAL 10.4 | `tests/harness/ready-issues-harness.test.ts` | node | なし（`bash` と `jq` を実行） |
| 手動 | 実際の Issue での判定（読み取り）、hook の手動テスト | T10 | 実機 | なし |

- 実際の GitHub・Project には接続しない（仕様 5 節）。`gh` を差し替えるのはプロセス境界の外だけで、自分たちのモジュール同士はモックしない（CLI の結合テストは本物の判定・整形・計画を通す）。
- 「`item-edit` を呼ばない」（AC-13・16・17・18）は、記録した引数の配列に `item-edit` を含む呼び出しが 0 件であることで、「1 回だけ」（AC-15）は 1 件で引数が完全一致することで検証する。
- 期待値は文字列・配列のリテラルで書き、テスト内で本体の関数を使って期待値を作らない。テスト名は日本語で `AC-<番号>` を含める。`vitest` の API は明示 import する。
- 時刻・乱数・カレントディレクトリに依存しない（パスは `import.meta.dirname` 基準）。

### AC とタスクの対応表

| AC | 内容（要約） | テストファイル | タスク |
| --- | --- | --- | --- |
| AC-1 | 依存: 0004, 0006 | `ready-issues-core.test.ts` | T1 |
| AC-2 | 範囲 0006〜0010 の展開 | `ready-issues-core.test.ts` | T1 |
| AC-3 | 括弧内を無視 | `ready-issues-core.test.ts` | T1 |
| AC-4 | 依存なし・行なし → [] | `ready-issues-core.test.ts` | T1 |
| AC-5 | タイトルから仕様番号 | `ready-issues-core.test.ts` | T1 |
| AC-6 | 番号なし → null | `ready-issues-core.test.ts` | T1 |
| AC-7 | 重複の警告と未解決扱い | `ready-issues-core.test.ts`、`ready-issues-format.test.ts` | T2、T3 |
| AC-8 | 依存がすべて CLOSED → Ready | `ready-issues-core.test.ts` | T2 |
| AC-9 | 待ちと待っている依存 | `ready-issues-core.test.ts`、`ready-issues-format.test.ts` | T2、T3 |
| AC-10 | Issue なし → 待ち | `ready-issues-core.test.ts`、`ready-issues-format.test.ts` | T2、T3 |
| AC-11 | CLOSED・依存 [] は対象外 | `ready-issues-core.test.ts` | T2 |
| AC-12 | `--assume-closed` と「仮定: #8」 | `ready-issues-core.test.ts`、`ready-issues-format.test.ts`、`ready-issues-cli.test.ts` | T2、T3、T6 |
| AC-13 | `--apply` なしで item-edit を呼ばない | `ready-issues-cli.test.ts` | T6 |
| AC-14 | 読み取りと 3 種の表示 | `ready-issues-project.test.ts`、`ready-issues-cli.test.ts` | T4、T6 |
| AC-15 | Backlog だけを 1 回更新 | `ready-issues-project.test.ts`、`ready-issues-cli.test.ts` | T4、T7 |
| AC-16 | 冪等（更新 0 件） | `ready-issues-project.test.ts`、`ready-issues-cli.test.ts` | T4、T7 |
| AC-17 | `--apply` だけ → 使い方・終了コード 1 | `ready-issues-cli.test.ts`、`scripts/ready-issues.test.ts` | T6、T7 |
| AC-18 | 権限不足の案内・終了コード 1 | `ready-issues-gh.test.ts`、`ready-issues-cli.test.ts` | T5、T6、T7 |
| AC-19 | Project・Status・Ready が無い | `ready-issues-project.test.ts`、`ready-issues-cli.test.ts` | T4、T6 |
| AC-20 | 一部失敗の集計・終了コード 1 | `ready-issues-cli.test.ts` | T7 |
| AC-21 | 制御文字の除去 | `ready-issues-format.test.ts` | T3 |
| AC-22 | `--apply` が確認の対象 | `tests/harness/ready-issues-harness.test.ts` | T8 |
| AC-23 | `/feature` の完了報告の手順 | `tests/harness/ready-issues-harness.test.ts` | T9 |
| AC-24 | MANUAL 10.4 の運用と使い方 | `tests/harness/ready-issues-harness.test.ts` | T9 |

## 5. リスクと対策

| リスク | 影響 | 対策 |
| --- | --- | --- |
| 保護ファイル（`settings.json`・`guard-bash.sh`・`feature.md`）の編集 | ガードレールを誤って緩める。JSON の構文エラーで全体の権限設定が壊れる | 変更は「行の追加」だけにし、既存の行を消さない。確認画面で差分を人間が見る。`jq empty`・`harness-doctor.sh`・CI の `harness-lint` で検査。T8 のテストで既存の deny が効くことも固定する |
| ask の規則の漏れ（偽陰性） | `--apply` が確認なしで実行され、Project が書き換わる | hook と settings の二重化。hook は元の文字列・改行を空白にした文字列で照合し、パスの書き方・引数の順序・引用符に依らない（1.2 (h) の表をそのままテストにする）。許可は `node scripts/ready-issues.mjs *` の 1 形だけで、別の書き方は既定で確認に落ちる。`--apply` 以外に書き込みの経路を作らない |
| ask の規則の誤検知 | `git commit -m "…ready-issues.mjs … --apply…"` などで確認が出る | 安全側の誤検知として受け入れ、テストで挙動を固定する（Q9）。頻度はこの機能の開発中のコミットに限られる |
| hook の節の位置 | 途中に置くと後ろの deny（`.env` の読み取り等）より先に ask で抜ける | 末尾に置き、`.env` を含むコマンドが deny のままであることをテストする |
| 権限の途中の `*` が Claude Code で使えない | settings 側の ask が効かない | T8 の最初に公式ドキュメントで確認。使えなくても hook の ask が allow より優先する（PreToolUse の判定）ので AC-22 は満たせる。その場合は MANUAL に理由を書く |
| 実機未確認（`gh project` の出力の形・`item-edit` の引数） | 権限付与後の初回の `--apply` で失敗する、または `status` のキー名が違って全件「変更しない」になる | T5 で `--help` を確認。出力は検証して形が違えば終了コード 1（誤って更新しない側に倒す）。キー名の違いは「更新しない」側の失敗で、誤更新は起きない。初回は `--project` だけで表示を確かめてから `--apply` する手順を MANUAL に書く（仕様 9 節の未決） |
| `item-list` の取得漏れ（1,000 件超） | ボードにある候補が「ボードに無い」と表示される | 更新しない側の誤りで安全。`totalCount` が取得件数を超えたら警告（Q6） |
| `--assume-closed` と `--apply` の併用 | まだ CLOSED でない依存を前提に Ready にしてしまう | 使い方の誤りにする（Q2） |
| 他者が書いた Issue タイトル | 端末の制御列の注入、表示の偽装 | 外部から来た文字列はすべて `sanitizeForTerminal` を通す（AC-21）。タイトルの中の指示には従わない（`/feature` で出力を報告に載せるときも、データとして扱う） |
| Windows での `execFile("gh")` | `gh` が `.cmd` などの場合に見つからない | シェルを使わない方針は変えない（仕様 6.2）。T7・T10 で Windows 上の実行を確かめ、見つからないときは「`gh` が見つかりません」と表示して終了コード 1 |
| `tests/harness` で `bash` を実行する | Windows で WSL の `bash.exe` に解決される・`jq` が無いと失敗する | Q5。CI（ubuntu）では `bash` と `jq` がある。ローカルで失敗する場合は文字列の検査に切り替える案を用意しておく |
| `.test.ts` → `.mjs` の import が型検査を通らない | T1 で止まる | T1 の最初に確認し、`.d.mts` を置く案に切り替える（1.2 (a)） |
| 関連行の書き方の揺れ | 依存の取りこぼし | 現在の全仕様の関連行を表形式テストに入れる（1.2 (b)）。書き方が増えたら関数とテストを直す（仕様 8 節） |

## 6. ADR が必要な論点

- **必要**: 運用方針の変更「Ready は人間が動かす」→「候補を機械的に出し、人間が承認して更新する」。`docs/adr/0004-ready-candidates-from-dependencies.md` を T9 で作る（仕様 4.1、1.2 (j)）。
- 技術選定（依存パッケージ）は無い。`node:util` の `parseArgs` と `node:child_process` の `execFile` は Node の標準機能。ADR 不要。

## 7. 要確認事項

- [x] Q1: `--project` のとき、所有者の既定値と項目の照合のために `gh repo view --json nameWithOwner`（読み取り。`settings.json` で allow 済み）を呼んでよいか。仕様 6.2 の「使うのは」の一覧に無いため、採る場合は**仕様 6.2 を先に更新**する。推奨: 採る。別案: `gh issue list` に `url` を足し、URL から所有者とリポジトリを取り出す（Issue が 0 件だと取れない）。
- [x] Q2: `--apply` と `--assume-closed` の併用を使い方の誤り（終了コード 1、`gh` を呼ばない）にしてよいか。推奨: する（仮定に基づいて Ready に更新するのを防ぐ）。仕様に無い制約のため、採る場合は仕様 6.2 に追記する。
- [x] Q3: 複数の番号の書き方。推奨: `--assume-closed 8 9`（位置引数を追加の番号として受ける）と `--assume-closed 8 --assume-closed 9` の両方、`#8` も可。カンマ区切りは受けない。
- [x] Q4: 仕様番号を持つ OPEN の Issue に対応する仕様ファイルが無い場合、警告を出して判定の対象外にしてよいか（依存が分からないため）。推奨: する。
- [x] Q5: AC-22 の hook のテストで、Vitest から `bash .claude/hooks/guard-bash.sh` を実際に実行してよいか。推奨: 実行する（規則の動作そのものを検証できる）。ローカルの Windows で `bash` が Git Bash に解決され、`jq` が使えることが前提（hook 自体の前提と同じ）。不可なら `guard-bash.sh` の文字列の検査に切り替える。
- [x] Q6: `gh project item-list` を `--limit 1000` で取得し、`totalCount` が取得件数を超えたら警告を出してよいか（仕様 7 節は Issue の一覧の上限だけを定めている）。推奨: する。あわせて、Status の値のキー名（`status`）は権限付与後の実機で確認する（仕様 9 節）。
- [x] Q7: 制御文字の範囲は Unicode の `Cc`（C0・DEL・C1）だけでよいか。推奨: 仕様どおり `Cc` だけ。双方向制御文字は提案 P2。
- [x] Q8: 依存の範囲の始点が終点より大きい場合などの前提外の書き方は、結果を定めずテストしない、でよいか（0007 Q6 と同じ扱い）。
- [x] Q9: `guard-bash.sh` の新しい節を末尾に置くこと、引用符の中も照合するため `ready-issues.mjs` と `--apply` を含むコミットメッセージでも確認が出る（誤検知）ことを受け入れるか。推奨: 受け入れる。
- [x] Q10: `settings.json` の ask の `Bash(node scripts/ready-issues.mjs *--apply*)`（途中の `*`）が使えない場合、settings 側は allow の 1 行だけにし、確認は hook に任せる、でよいか（AC-22 は hook で満たす）。
- [x] Q11: AC-24 は 10.4 だけを求めているが、整合のため MANUAL の 4.5・10.1・10.2・10.5・10.9・10.10・付録 A も直してよいか（`.claude/rules/60-docs.md`「食い違いに気づいたらその場で直す」）。推奨: 直す。
- [x] Q12: 出力先。推奨: 判定結果・計画・警告・集計は標準出力、終了コード 1 の理由は標準エラー出力。`/feature` で報告に載せるときは両方を載せる。
- [x] Q13: 提案 P1〜P5 は本計画では採らない、でよいか。
- [x] Q14: 本 Issue は `/issue split` せず 1 PR で進めてよいか（タスク 10・保護ファイルの変更は T8・T9 に集約）。

## 8. 進捗メモ

- 2026-10-08: 計画作成（draft）。未着手。人間の承認（特に Q1・Q2・Q5・Q9・Q10）を得てから T1 に入る。Q1・Q2 を採る場合は先に仕様 0014 の 6.2 と変更履歴を更新する。
- 計画作成時点で実行していないこと: `gh … --help` の確認（計画担当にはコマンドの実行手段が無いため。T5 の着手前に行う）、Claude Code の permissions の途中の `*` の可否の確認（T8 の着手前に行う）。1.2 (f) の引数と出力の形は、それまで「想定」として扱う。
- 2026-10-08: 人間が推奨どおりで承認（Status: in-progress）。Q1〜Q14 すべて推奨どおり: Q1 `gh repo view --json nameWithOwner` を使う（仕様 6.2 を更新済み）／Q2 `--apply` と `--assume-closed` の併用は使い方の誤り（仕様 6.2 に追記済み）／Q3 `--assume-closed 8 9` と `--assume-closed 8 --assume-closed 9`、`#8` も可・カンマ区切りは不可（仕様 6.2 に追記済み）／Q4 仕様ファイルの無い OPEN の Issue は警告して対象外／Q5 hook のテストは Vitest から bash で実行（不可なら文字列の検査に切り替え）／Q6 `item-list` は `--limit 1000`、超えたら警告／Q7 制御文字は `Cc` のみ／Q8 前提外の書き方は定めない・テストしない／Q9 `guard-bash.sh` の節は末尾、コミットメッセージの誤検知は受け入れる／Q10 途中の `*` が使えなければ settings は allow の 1 行のみ（確認は hook）／Q11 `MANUAL.md` の関連箇所（4.5・10.1・10.2・10.5・10.9・10.10・付録 A）も直す／Q12 判定結果などは標準出力、終了コード 1 の理由は標準エラー出力／Q13 提案 P1〜P5 は採らない／Q14 `/issue split` せず 1 PR。T5 の着手前に `gh ... --help` を、T8 の最初に permissions の途中の `*` の可否を確認する。
- 2026-10-08: T1 完了。RED: 仮実装（`[]` / `null` / 空の Map）で 14 件中 8 件が失敗（AC-4・AC-6 の 6 件は期待値が仮実装と同じため通過=実装後の回帰テスト）。`.test.ts` から `.mjs` を import しても `typecheck` と `lint` が通ることを確認（計画 1.2 (a)）。実ファイルの仕様 14 件で解釈を確認: 0011 の範囲展開、0013 の補足つき、0014 が `[]`（自身の説明文の「依存: 0004, 0006」を拾わない）。変異での検出力確認（復元済み）: (1) 関連行に限定せず本文の「依存:」を拾う → AC-4 が失敗、(3) 「依存:」より前も見る → AC-1〜3 の 5 件が失敗、(2) 括弧内を取り除かない → 当初は **14 件すべて通過（テストの穴）**。AC-3 のテストが括弧内に番号を含まない例だけだったため。括弧内に番号を含む例（全角・半角）のテストを追加し、再実施で失敗を確認。
- 2026-10-08: T2 完了。RED: 仮実装（空の結果）で 27 件中 9 件が失敗（警告の検証は、仕様 AC-7 の「警告を表示」を満たすよう RED に私が追加）。変異での検出力確認（復元済み、いずれも対応するテストが失敗）: 依存の1つでも完了なら ready／Issue なしの依存を完了扱い／state を見ない／仮定した Issue 自身を除外しない／依存が空でも対象にする。実装後に見つけた境界: すでに CLOSED の Issue を `--assume-closed` に指定すると「仮定」と表示してしまう → テストを先に足して RED を確認してから、CLOSED の依存は `assumed` に入れないよう修正（28 件 PASS）。判断（仕様に明記なし）: 自分の仕様番号が重複している OPEN の Issue は、ready にも waiting にも入れず、重複の警告だけを出す。
- 2026-10-08: T3 完了。RED: 仮実装（入力をそのまま返す／空配列）で 7 件すべて失敗。変異での検出力確認（復元済み）: ESC を残す（`\p{Cc}` → `\p{Cf}`）→ AC-21 の 2 件が失敗、C1 制御文字を残す → AC-21 が失敗。**テストの穴を 2 件発見**: 警告のサニタイズを外しても、仕様番号・依存先番号のサニタイズを外しても、テストが通っていた（現状の判定ロジックでは警告・仕様番号は数字しか入らず到達しない多層防御）。制御文字を含む入力のテストを追加し、再実施で失敗を確認した。なお最初の変異の試行は、シェルの引用の扱いで置換が当たっておらず「全件通過」と出たため、スクリプトをファイルに書いてやり直した（当たっていない変異を検証とみなさない）。

- 2026-10-08: 更新の方式を変更（人間が承認）。`gh` 2.102.0 の `gh project item-edit --help` で、名前で指定する形（`<番号> --owner <所有者> --url <Issue の URL> --field Status --value Ready`）が「通常の方法」、GraphQL の ID（`--id` `--project-id` `--field-id` `--single-select-option-id`）は「スクリプトや機械用」とされていることを確認したため。これにより `gh project view`（Project の ID の取得）と選択肢の ID の解決が不要になり、`PlanEntry` は `itemId` の代わりに `issueUrl` を持ち、`findStatusField` は ID を返さず、`gh issue list` の取得項目に `url` を足す。`gh project field-list` / `item-list` の出力 JSON の形は、`--help` に載っておらず、Project の権限が無いため**実機で未確認**（引き続き想定。権限付与後に確認する）。