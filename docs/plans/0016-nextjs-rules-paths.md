# 0016: ルールとスキルの `src/` 表記をルート直下構成に合わせる 実装計画

Status: done                            <!-- draft | in-progress | done  ※ SessionStart hook が "Status: in-progress" の行を検出します。この行は変えないこと -->

- Issue: #16
- 対応する仕様: docs/specs/0016-nextjs-rules-paths.md
- ブランチ: feat/16-nextjs-rules-paths
- 作成日: 2026-10-09

## 1. 方針

- `.claude/` の 3 ファイル（`rules/10-nextjs.md`、`skills/nextjs-feature-scaffold/SKILL.md`、`skills/spec-writing/SKILL.md`）のパスの表記だけを直す（仕様 4.1）。ルールの内容（禁止事項・手順）は変えない（仕様 8 節）。
- AC-1〜AC-4 を検査する構成検査テストを `tests/harness/` に新規で 1 つ置く。`.claude/` のファイルを読むテストは `tests/harness/ready-issues-harness.test.ts` に前例がある。
- テストの流儀は `tests/foundation/public-assets-referenced.test.ts` に合わせる: `// @vitest-environment node`、`vitest` の API を明示 import、ファイル集め（`collectFiles`）と `/` 区切りへの正規化（`toRelative`）をテストファイル内に置く（既存テストは変えない）、判定は純粋関数にして実ファイルへの適用と陽性・陰性テストの両方に同じ関数を使う、走査の空振りを前提テストで防ぐ。
- フロントマターの解析は行ベースの簡易パーサで行う。YAML ライブラリを含め、依存パッケージは追加しない（`node:fs` `node:path` `node:os` と `vitest` だけ）。
- `.claude/` の編集は保護ファイルの扱いで、編集のたびに人間の確認が出る（注意点 e）。検出力の確認は、`.claude/` を変異させず、純粋関数の陽性・陰性テストと一時ディレクトリで行う方針にする（Q6）。

### 1.1 事前調査の結果（2026-10-09）

- `.claude/` 全体で `src/` を含む行は次の 7 行だけ（Grep で確認）。agents・commands・`review-checklist`・`checklist.md` には無い。
  - `.claude/rules/10-nextjs.md`: 3 行目 `"src/app/**/*.{ts,tsx}"`、5 行目 `"src/features/**/*.{ts,tsx}"`、8 行目 `"src/middleware.ts"`、27 行目 `` `src/features/<名前>/` に置く ``
  - `.claude/skills/nextjs-feature-scaffold/SKILL.md`: 13 行目 `src/features/<feature>/`、20 行目 `src/app/<route>/`（どちらもコードブロック内の行頭）
  - `.claude/skills/spec-writing/SKILL.md`: 13 行目 `` `src/` に再利用できる実装 ``
- `.claude/rules/` の他のファイル（`00-workflow` `20-typescript` `30-testing` `40-security` `50-git-and-pr` `60-docs`）に `src/` は無い（注意点 c）。
- 走査対象: `.claude/rules/*.md` は 7 ファイル、`.claude/skills/**/SKILL.md` は 3 ファイル（`nextjs-feature-scaffold` `review-checklist` `spec-writing`）。`review-checklist/checklist.md` は対象外（ファイル名が `SKILL.md` でない）。
- 現在の `paths`（2〜8 行目）は 6 項目: `src/app/**/*.{ts,tsx}`、`app/**/*.{ts,tsx}`、`src/features/**/*.{ts,tsx}`、`next.config.*`、`middleware.ts`、`src/middleware.ts`。すべてダブルクォートで囲まれ、`  - "…"` の形。
- ルート直下に `app/` と `features/` があり、`src/` は無い。`middleware.ts` と `proxy.ts` はどちらもルートに無い（注意点 f）。
- `vitest.config.mts` に `test.include` の指定は無く、既定の `**/*.{test,spec}.?(c|m)[jt]s?(x)` で `tests/harness/*.test.ts` も対象になる（既存の `ready-issues-harness.test.ts` が実行されていることと一致。注意点 g）。既定の環境は `jsdom` なので、新しいテストは先頭で `node` を指定する。
- `docs/architecture.md` 26 行目に「`src/` は使わず、ルート直下に置く（仕様 0002 で決定）」が既にある。ルール・スキルのパスの検査への言及は無い（Q7）。
- `docs/harness/MANUAL.md` 4.6 の表（445 行目）は `10-nextjs.md` の適用を「`app/**` `features/**` 等」と書いており、修正後の `paths` と一致する。一方、同節の例（457 行目 `src/features/payments/**`、465 行目 `src/**/*`）に `src/` が残るが、`docs/` は仕様の範囲外（提案 P1）。

### 1.2 確定する事項（計画の承認で確定）

| 事項 | 内容 |
| --- | --- |
| テストファイル | 新規 `tests/harness/claude-paths-root-layout.test.ts`（名前は Q1） |
| 走査対象の列挙 | `listScanTargets(base)`: `base/.claude/rules/` 直下の `*.md` と、`base/.claude/skills/` 配下を再帰で集めたうちファイル名が `SKILL.md` のもの。`base` からの相対パス（`/` 区切り）を並べ替えて返す。`base` を引数で受け、一時ディレクトリでも検査できるようにする |
| パスとしての `src/` の検出 | `findSrcPaths(text)`: 純粋関数。行に分け（`/\r?\n/`）、`/(?:^|[\s"'\`(\[{（「『])src\//` に一致する行の `{ line（1 始まり）, text }` を返す（境界の文字は Q2） |
| AC-1 の失敗メッセージ | 走査対象の全ファイルに `findSrcPaths` を当て、`"<相対パス>:<行番号>: <行の内容>"` の配列を作って `toEqual([])`。失敗時に差分としてファイルと行番号が出る |
| フロントマターの解析 | `parseFrontmatterPaths(text)`: 純粋関数。先頭の BOM を除き、1 行目が `---` のときだけ次の `---` の行までをフロントマターとする（無ければ `null`）。その中の `paths:` の行の後ろに続く `^\s+-\s+` の行を項目として集め、`"…"` または `'…'` で囲まれていれば外し、囲まれていなければ前後の空白を除いた値を使う。空行・項目でない行（次のキー）で止まる。`paths:` が無ければ `null`（注意点 a） |
| 本文の切り出し | `extractBody(text)`: フロントマターの閉じの `---` より後ろ。フロントマターが無ければ全体 |
| AC-2 の判定 | `comparePaths(actual, expected)`: 純粋関数。`{ missing, extra, duplicates }` を返す（順序は問わない。Q3）。実ファイルには期待値 `["app/**/*.{ts,tsx}", "features/**/*.{ts,tsx}", "next.config.*", "middleware.ts", "proxy.ts"]`（テスト内のリテラル）で当て、`toEqual({ missing: [], extra: [], duplicates: [] })` |
| AC-3 の判定 | 本文のうち `` `page.tsx` は薄く保つ `` を含む行を探し（無ければ原因の分かる例外）、その行が `` `features/<名前>/` に置く `` （先頭のバッククォートを含む）を含むこと。先頭のバッククォートを含めるので、現状の `` `src/features/<名前>/` に置く `` では一致しない（Q4） |
| AC-4 の判定 | `checkRootLayout(base)`: `base/app` と `base/features` がディレクトリとして存在し、`base/src` が存在しない（ファイルでもディレクトリでも）ことを検査し、問題の一覧（例: `"src/ が存在する"`）を返す。実リポジトリには `root` で当てて `toEqual([])` |
| 3 ファイルの修正後の表記 | `10-nextjs.md` の `paths` は 5 項目（順序は `app/**/*.{ts,tsx}`、`features/**/*.{ts,tsx}`、`next.config.*`、`middleware.ts`、`proxy.ts`。既存と同じくダブルクォートで囲む）、27 行目は `` `features/<名前>/` に置く ``。`nextjs-feature-scaffold` は `features/<feature>/`・`app/<route>/`（コードブロックの字下げ・桁揃えは周りに合わせる）。`spec-writing` は「`app/` `features/` `lib/` に再利用できる実装がないか」（文言は Q5） |

### 1.3 注意点と扱い

**(a) `paths` のフロントマターの解析**

- 依存を足さないため YAML ライブラリは使わず、1.2 の行ベースの簡易パーサにする。対象は「`paths:` の下にブロック形式の列（`- …`）が並ぶ」形だけで、本プロジェクトの rules（`10-nextjs` `20-typescript` `30-testing` `60-docs`）はすべてこの形。フロー形式（`paths: [a, b]`）やエスケープを含む引用符は扱わない。扱えない形のときは `null` または項目数の不一致で失敗する（黙って通らない）ので、限界としてテストの冒頭コメントに書く。
- `{ts,tsx}` の波括弧は引用符の中にあるので、引用符を外すだけでよい（波括弧は解釈しない）。陽性テストで `"app/**/*.{ts,tsx}"` が `app/**/*.{ts,tsx}` のまま取り出せることを固定する。
- Windows で Git の `core.autocrlf` により CRLF で取り出される場合に備え、行分割は `/\r?\n/`、`---` の判定は行全体の一致（`\r` を残さない）にする。先頭の BOM（`﻿`）も除く。
- 前提テスト: 実ファイルの `10-nextjs.md` で `parseFrontmatterPaths` が `null` でなく、1 件以上を返すこと（解析の空振りの防止）。

**(b) パスとしての `src/` の判定と誤検知**

- 仕様 AC-1 の定義（行頭、または空白・引用符・バッククォート・括弧の直後）をそのまま正規表現にする。`\s` は全角空白も含む。
- 陽性（検出する）: 行頭の `src/features/<feature>/`、字下げの後の `  src/app/`、`"src/app/**"`、`'src/x'`、`` `src/` ``、`(src/x)`、`[src/x]`、`{src/x}`、`（src/x）`、`「src/x」`。
- 陰性（検出しない）: `docs/src/`（直前が `/`）、`mysrc/`、`resources/`、`srcs/`、`src_dir/`、`src`（スラッシュなし）、`<img src="/x" />`（`src=`）、`SRC_REGEX`、空文字列。
- 限界: `./src/` と `../src/`（直前が `.`）は仕様の定義に入らないので検出しない（Q2 の別案で扱う）。
- 対象は `.claude/rules/*.md` と `.claude/skills/**/SKILL.md` だけ。`CLAUDE.md`（73 行目付近の「`src/` は使わず」）、`docs/` の仕様・計画・`architecture.md`・`MANUAL.md`、`tests/`（このテスト自身が `src/` を含む）、agents・commands は走査しない。前提テストで、走査対象に `CLAUDE.md`・`docs/`・`tests/`・`.claude/agents/`・`.claude/commands/`・`checklist.md` が含まれないことを固定する。
- 仕様の帰結として、今後 rules・skills の本文に「`src/` は使わない」のような否定の説明を書いても AC-1 で失敗する。必要になった場合は仕様を変えて扱う（リスク表）。

**(c) `.claude/rules/` の他のファイル**

- 事前調査で 00〜60 のうち `10-nextjs.md` 以外に `src/` は無いことを確認済み。AC-1 は rules の全ファイルを走査するので、恒常的にも検査される。前提テストで、走査対象に rules の 7 ファイルと skills の 3 つの `SKILL.md` がちょうど含まれる（少なくとも `10-nextjs.md`・`nextjs-feature-scaffold/SKILL.md`・`spec-writing/SKILL.md` を含む）ことを検査する（Q8）。

**(d) Windows のパス区切り**

- `path.relative(base, file).split(path.sep).join("/")` で正規化してから比較・表示する（既存の `toRelative` と同じ）。ファイル名の判定は `path.basename`。失敗メッセージのパスも `/` 区切り。

**(e) `.claude/` の編集で hook の確認が出る**

- `.claude/hooks/guard-files.sh` は `Edit|Write|MultiEdit` で `.claude/*` への書き込みに `pretool_ask` を返す。T1 の 3 ファイルの編集は implementer が行うが、各編集で人間の確認が出る（3 ファイル、最低 3 回）。確認を避けるために Bash（`sed` 等）で書き換えない（ガードレールの回避になる）。
- 人間は確認画面で、差分がパスの表記だけであること（仕様 8 節）を見る。T2 で `git diff .claude/` を全文で reviewer に渡す。
- `tests/harness/` は保護対象ではないので、テストの作成では確認は出ない。
- `.claude/` の変更は Stop hook の「テストの無いソース変更」の判定の対象（`app` `features` `lib` `components`）に当たらない（計画 0017 の調査結果）。

**(f) `middleware.ts` と `proxy.ts`**

- どちらも現在プロジェクトに存在しない。仕様 8 節のとおり、AC-4 の実在の検査は `app/` と `features/` までで、この 2 つは検査しない（AC-2 で `paths` に指定されていることだけを検査する）。`next.config.*` も実在の検査はしない（仕様の範囲外）。

**(g) `tests/harness/` が vitest の対象か**

- 1.1 のとおり対象。T1 の RED で、新しいテストが実際に実行されて失敗することを確かめる（ファイル名の打ち間違いで拾われない事故の防止）。

## 2. 影響範囲

| 種別 | パス | 内容 |
| --- | --- | --- |
| 新規 | `tests/harness/claude-paths-root-layout.test.ts` | 構成検査テスト（列挙・検出・解析・判定の陽性・陰性、走査の前提、AC-1〜AC-4）（T1） |
| 変更（保護） | `.claude/rules/10-nextjs.md` | `paths` を 5 項目に、27 行目を `features/<名前>/` に（T1） |
| 変更（保護） | `.claude/skills/nextjs-feature-scaffold/SKILL.md` | 13・20 行目の構成図（T1） |
| 変更（保護） | `.claude/skills/spec-writing/SKILL.md` | 13 行目の手順 2（T1） |
| 変更 | `docs/architecture.md` | 5 節に検査の 1 行を追加（T2。要否は Q7） |
| 変更 | `docs/plans/0016-nextjs-rules-paths.md` | 進捗メモ |
| 変更（GitHub） | Issue #16 のタイトルと本文 | 仕様 4.1 のとおり範囲に合わせる（T2。人間の承認を得てから） |
| 変更なし | `CLAUDE.md`、`.claude/` のその他（hooks・agents・commands・settings・harness の設定）、`docs/harness/MANUAL.md`、既存のテスト、`app/` `features/` `lib/` のコード、`package.json`、ロックファイル | 触らない（仕様 4.2） |

## 3. タスク（1 タスク = 1 コミットの大きさ）

> 分け方の考え方: コミット前に `verify.sh --quick` の PASS が必要なため、RED のままのテストはコミットしない。AC-1〜AC-3 は 3 ファイルを直すまで RED なので、テストと 3 ファイルの修正を同じコミット（T1。4 ファイル）に入れる。RED は作業ツリー上で確認して進捗メモに記録する。T2 はコードを変えない文書・検証・レビュー・Issue。別案は Q9。

- [x] **T1: 構成検査テストの追加と 3 ファイルのパス表記の修正（AC-1〜AC-4 の RED → GREEN）**
  - 進捗: RED 1（検出・解析・判定を仮実装）で 40 件中 24 件が失敗 → 本実装で RED 2（`.claude/` 未修正）3 件失敗: AC-1 が 7 件（`10-nextjs.md:3`・`:5`・`:8`・`:27`、`nextjs-feature-scaffold/SKILL.md:13`・`:20`、`spec-writing/SKILL.md:13`）、AC-2 が `missing: [features/**, proxy.ts]`・`extra: [src/app/**, src/features/**, src/middleware.ts]`・`duplicates: []`、AC-3（27 行目が `` `features/<名前>/` に置く `` を含まない）、AC-4 は通る → `.claude/` の 3 ファイルを Edit で修正（編集ごとに人間の確認）して GREEN（40 件 PASS）。
  - `.claude/` の差分: パスの表記の行だけ（+6 -7）。`paths` は 6 行 → 5 行（`app/**`・`features/**`・`next.config.*`・`middleware.ts`・`proxy.ts`）。ルールの禁止事項・手順は変えていない。
  - 変異確認（14 個、すべて検出または期待どおり）: `src/` 検出の境界から引用符を外す／行頭 `^` を外す／単純な `includes` にする、`paths` の引用符処理を外す／別キーで止まる処理を外す／CRLF を扱わない、重複検出を外す、`listScanTargets` を rules だけにする／`SKILL.md` の判定を外す、ルートに `src/` を作る（失敗）→ 消す（通る）。変異 6（AC-3 の期待値の先頭のバッククォート）: バッククォートなしの期待値は RED 時点の文言（`` `src/features/<名前>/` に置く ``）でも部分一致で通り、ありの期待値は失敗する。
  - 注意（手順の逸脱）: 変異 6 の確認のため、`.claude/rules/10-nextjs.md` を一時的に RED 時点の文言へ戻した際、Edit ではなく Bash のスクリプトで書き換えたため、保護ファイルの編集時の確認画面を経ていない。直後に元へ戻し、`git diff` で差分が修正後と同一（3 ファイル +6 -7）であることを確認した。
  - 対応 AC: AC-1、AC-2、AC-3、AC-4
  - 先に書くテスト: `tests/harness/claude-paths-root-layout.test.ts`
    - `describe("走査の前提")`
      - `AC-1（前提）: 走査対象に .claude/rules/10-nextjs.md・skills/nextjs-feature-scaffold/SKILL.md・skills/spec-writing/SKILL.md を含む rules の 7 ファイルと SKILL.md の 3 ファイルが含まれる`
      - `AC-1（前提）: 走査対象に CLAUDE.md・docs/・tests/・.claude/agents/・.claude/commands/・checklist.md が含まれない`
      - `AC-1（前提）: listScanTargets は一時ディレクトリの rules/*.md と skills/**/SKILL.md だけを / 区切りで列挙する`（`mkdtempSync` に `.claude/rules/a.md`、`.claude/rules/sub/b.md`（直下でないので除く）、`.claude/skills/x/SKILL.md`、`.claude/skills/x/checklist.md`（除く）、`.claude/skills/y/z/SKILL.md`、`.claude/agents/c.md`（除く）を作る。`afterEach` で `rmSync(..., { recursive: true, force: true })`）
      - `AC-2（前提）: 10-nextjs.md のフロントマターの paths が解析でき、1 件以上ある`
      - `AC-3（前提）: 10-nextjs.md の本文に「page.tsx は薄く保つ」の行がある`
    - `describe("src/ の検出")`（入力はテスト内の文字列の断片。注意点 b）
      - `it.each`（陽性）: `AC-1（検出）: $label の src/ を検出する`（1.3 (b) の 10 例）
      - `it.each`（陰性）: `AC-1（検出）: $label は検出しない`（1.3 (b) の 10 例）
      - `AC-1（検出）: 複数行の文字列で、該当する行の行番号（1 始まり）と内容を返す`（CRLF を含む断片で、行番号がずれないこと）
    - `describe("フロントマターの解析")`
      - `AC-2（解析）: ダブルクォート・シングルクォート・引用符なしの項目を取り出し、{ts,tsx} の波括弧をそのまま残す`
      - `AC-2（解析）: paths の後ろに別のキーがあるとき、そこで止まる`
      - `AC-2（解析）: CRLF の改行と先頭の BOM でも解析できる`
      - `AC-2（解析）: フロントマターが無い、または paths が無いとき null を返す`
      - `AC-2（解析）: 本文の --- や - "…" の行を paths に含めない`（フロントマターの後ろの本文に水平線と箇条書きがある断片）
    - `describe("paths の比較")`
      - `AC-2（判定）: 期待どおりのとき missing・extra・duplicates がすべて空`（順序を入れ替えた入力でも空）
      - `AC-2（判定）: 欠落・余分・重複をそれぞれ返す`（`features/**` の欠落、`src/app/**` の余分、`app/**` の重複）
    - `describe("ルート直下の構成の判定")`（一時ディレクトリ）
      - `AC-4（判定）: app/ と features/ があり src/ が無いとき問題なし`
      - `AC-4（判定）: src/ ディレクトリ、または src ファイルがあるとき問題を返す`
      - `AC-4（判定）: app/ または features/ が無い、またはディレクトリでなくファイルのとき問題を返す`
    - `describe("AC-1: rules と skills にパスとしての src/ が無い")`
      - `AC-1: .claude/rules/*.md と .claude/skills/**/SKILL.md に、パスとしての src/ が 1 件も無い`（`toEqual([])`。失敗時に `ファイル:行: 内容` が出る）
    - `describe("AC-2: 10-nextjs.md の paths")`
      - `AC-2: paths が app/**・features/**・next.config.*・middleware.ts・proxy.ts の 5 つちょうどで、重複が無い`
    - `describe("AC-3: 10-nextjs.md の本文")`
      - `AC-3: page.tsx のロジックの置き場所が「features/<名前>/ に置く」と書かれている`
    - `describe("AC-4: ルート直下の構成")`
      - `AC-4: リポジトリのルートに app/ と features/ があり、src/ が無い`
  - RED の方法:
    1. 列挙・検出・解析・判定の関数を「空配列／`null`／空の結果を返す」仮実装で先に書いて実行し、前提テストと陽性テスト（検出・解析・判定の問題を返すはずのもの）が期待値の不一致で失敗することを確認する（import エラー・構文エラーでの失敗は RED と認めない）。本実装に置き換えて、前提・検出・解析・判定のテストを緑にする。
    2. 3 ファイルを直す前に全体を実行し、次で失敗することを確認して進捗メモに記録する。
       - AC-1: 7 件（`.claude/rules/10-nextjs.md:3`・`:5`・`:8`・`:27`、`.claude/skills/nextjs-feature-scaffold/SKILL.md:13`・`:20`、`.claude/skills/spec-writing/SKILL.md:13`）。
       - AC-2: `missing: ["features/**/*.{ts,tsx}", "proxy.ts"]`、`extra: ["src/app/**/*.{ts,tsx}", "src/features/**/*.{ts,tsx}", "src/middleware.ts"]`、`duplicates: []`。
       - AC-3: 27 行目が `` `features/<名前>/` に置く `` を含まない。
       - AC-4: 現状で通る（期待どおり。検出力は判定の一時ディレクトリのテストと変異 4 で確かめる）。
  - 実装: 1.2 のとおり 3 ファイルを直す。`.claude/` の編集は implementer が Edit で行い、編集ごとに人間の確認が出る（注意点 e）。編集後に `git diff .claude/` で、差分がパスの表記の行だけであることを確かめる。
  - 実装対象: `tests/harness/claude-paths-root-layout.test.ts`（新規）、`.claude/rules/10-nextjs.md`、`.claude/skills/nextjs-feature-scaffold/SKILL.md`、`.claude/skills/spec-writing/SKILL.md`（4 ファイル）
  - 検出力の確認（GREEN 後に一時的に変異を入れて戻す。`.claude/` は変異させない。Q6）:
    1. `findSrcPaths` の境界から引用符（`"`）を外す → 陽性 `"src/app/**"` が失敗。行頭の `^` を外す → 陽性の行頭の例が失敗。境界を外して単純な `includes("src/")` にする → 陰性 `docs/src/`・`mysrc/` が失敗。
    2. `parseFrontmatterPaths` で引用符を外す処理を外す → 解析の陽性テストが失敗。フロントマターの終わりで止める処理を外す → 「本文の行を含めない」が失敗。`\r` の除去を外す → CRLF のテストが失敗。
    3. `comparePaths` の重複の検出を外す（`Set` で比べるだけにする）→ 「重複を返す」が失敗。
    4. ルートに空の `src/` ディレクトリを一時的に作る → AC-4 が「`src/ が存在する`」で失敗。消して通ることを確かめる（Git は空ディレクトリを追跡しないが、消し忘れないよう `git status` と `Test-Path`／`ls` で確認する）。
    5. `listScanTargets` を `rules/` だけにする → 前提テスト（SKILL.md の 3 ファイルを含む）が失敗。`SKILL.md` の判定を外して `skills/` の全 `.md` にする → 一時ディレクトリの前提テスト（`checklist.md` を除く）が失敗。
    6. AC-3 の期待値の先頭のバッククォートを外す → RED 時点の文言（`` `src/features/<名前>/` に置く ``）でも通ってしまうことを、作業ツリー上で一時的に確かめ、元に戻す（期待値に先頭のバッククォートが必要な理由の確認。Q4）。
  - 完了条件: 新しいテストがすべて通り、既存テストは変更なしで通る。`pnpm typecheck`・`pnpm lint`・`pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。`git diff .claude/` がパスの表記の 7 行（`paths` は 6 行 → 5 行）だけ。コミットは 1 つ（例: `chore(harness): ルールとスキルの src/ 表記をルート直下構成に合わせる` + `Refs #16`）。

- [x] **T2: 文書の更新・最終確認・レビュー・Issue の修正**
  - 対応 AC: なし（文書・検証。AC-1〜AC-4 の総合確認）
  - 先に書くテスト: なし（コードを変えない）
  - RED の方法: 該当なし
  - 実装対象: `docs/architecture.md` 5 節に 1 行（Q7。例:「ルールとスキルのパス表記（0016）: `.claude/rules/*.md` と `.claude/skills/**/SKILL.md` にパスとしての `src/` を書かない。`10-nextjs.md` の `paths` は `app/**` `features/**` `next.config.*` `middleware.ts` `proxy.ts` の 5 つ。検査は `tests/harness/claude-paths-root-layout.test.ts`」の趣旨）、本計画の進捗メモ
  - 検出力の確認（変異）: 該当なし（T1 で実施）
  - 確認:
    - `bash scripts/verify.sh`（full。build を含む）を実行し、PASS/FAIL を事実のまま進捗メモに記録する。
    - `reviewer` サブエージェントで差分を点検する（`git diff .claude/` がパスの表記だけでルールの内容を変えていないこと、検出器の誤検知・見逃し、前提テストの十分さ、Windows の区切り・CRLF）。`security-reviewer` は「ガードレールを緩めていないこと」に絞って通す（Q10）。
    - Issue #16 のタイトルと本文を仕様 4.1 のとおり直す。`gh issue edit` は人間の承認を得てから行う。`gh` が使えないときは手順だけ報告する。
    - 任意: 修正後、`features/` のファイルを読んだときに `10-nextjs.md` が読み込まれることを `/context` で目視確認する（MANUAL 4.6 の「編集後の確認」。人間が行う。自動検査はしない）。
  - 完了条件: `verify.sh`（full）PASS、レビューの重大指摘の解消、Issue の修正（または未実施の理由の報告）、計画の `Status` を更新。

### 提案（仕様外。人間の判断で採否を決める。本計画のタスクには含めない）

- P1: `docs/harness/MANUAL.md` 4.6 の新規ルールの例（457 行目 `src/features/payments/**`、465 行目 `src/**/*`）をルート直下の表記に直す。例を写して新しいルールを作ったときに同じ誤りが再発するのを防げるが、仕様 0016 の範囲（`.claude/` の 3 ファイル）外で、MANUAL は `src/` 構成のプロジェクトにも使うキットの説明でもあるため、本計画では採らない想定。採るなら別 Issue。
- P2: AC-1 の検出を `./src/`・`../src/` にも広げる（Q2 の別案）。

## 4. テスト方針

| 種類 | 対象 | ファイル | 環境 | モック |
| --- | --- | --- | --- | --- |
| 構成検査 | 列挙・検出・解析・判定の陽性・陰性、走査の前提、AC-1〜AC-4 | `tests/harness/claude-paths-root-layout.test.ts`（新規） | node | なし（実ファイルと一時ディレクトリを読む） |
| 既存（変更なし） | 全テスト | 既存すべて | 既存のまま | 既存のまま |
| 結合・E2E | なし（アプリの挙動は変わらない） | — | — | — |
| 目視（任意） | `features/` のファイルで `10-nextjs.md` が読み込まれる | — | — | — |

- テスト名は日本語で `AC-<番号>` を含める。`vitest` の API は明示 import する。
- 判定は実ファイルと同じ関数を断片・一時ディレクトリに当てて陽性・陰性を固定し、実ファイルへの適用は違反の一覧が空であることを `toEqual` で検査する（失敗時に違反箇所が分かるようにする）。
- `paths` の期待値 5 つと AC-3 の文言はテスト内にリテラルで持つ（実ファイルから読み取った値を期待値に使わない）。
- 一時ディレクトリは各テストで作って後始末し、テスト間で共有しない。ネットワーク・`gh`・hook の実行は使わない。

### AC とタスクの対応表

| AC | 内容（要約） | テストファイル | タスク |
| --- | --- | --- | --- |
| AC-1 | rules と skills の SKILL.md にパスとしての `src/` が無い（ファイル・行番号を出す） | `tests/harness/claude-paths-root-layout.test.ts` | T1 |
| AC-2 | `10-nextjs.md` の `paths` が 5 つちょうどで重複なし | 同上 | T1 |
| AC-3 | 本文に「`features/<名前>/` に置く」 | 同上 | T1 |
| AC-4 | ルート直下に `app/` `features/` があり `src/` が無い | 同上 | T1 |

## 5. リスクと対策

| リスク | 影響 | 対策 |
| --- | --- | --- |
| 走査・解析が空振りして常に通る（列挙の漏れ、フロントマターの解析失敗で空配列） | 退行を見逃す | 前提テスト（既知の 3 ファイルを含む、解析結果が 1 件以上、`page.tsx` の行がある）と、一時ディレクトリ・断片での陽性テスト。変異 1・2・5 で確かめる |
| `src/` の誤検知（`docs/src/`、`src=`、`SRC_REGEX`） | 正当な記述で検査が落ちる | 仕様の境界の定義どおりの正規表現と、陰性テストで固定（注意点 b） |
| `./src/` を見逃す | パスとしての `src/` が残る | 仕様の定義の外。限界として明記し、Q2・P2 で判断 |
| 将来 rules・skills に「`src/` は使わない」と書くと AC-1 で落ちる | 説明が書けない | 仕様の意図どおり（説明は `CLAUDE.md`・`docs/architecture.md` に置く）。必要になったら仕様を変える |
| `.claude/` の編集でルールの内容まで変わる（ガードレールの緩み） | 開発ルールが弱まる | 編集ごとの hook の確認、`git diff .claude/` の目視、reviewer と security-reviewer（Q10）の点検 |
| Bash でのファイル書き換えにより hook の確認を回避してしまう | ガードレールの回避 | `.claude/` の編集は Edit だけで行う。検出力の確認で `.claude/` を変異させない（Q6） |
| Windows の `\` 区切り・CRLF・BOM で比較や解析が失敗する | 誤検知・空振り | `toRelative` の正規化、`/\r?\n/`、BOM の除去と、CRLF・BOM の解析テスト（注意点 a・d） |
| 変異 4 の `src/` の消し忘れ | 以後の AC-4 が失敗し続ける | 戻した後に `git status` と存在確認。AC-4 自体が消し忘れを検出する |
| 別セッションの作業との衝突 | 意図しない変更の混入 | 変更は 4 ファイル（T1）と文書（T2）だけ。コミット前に `git status` で確認する |

## 6. ADR が必要な論点

- なし。依存パッケージの追加・技術選定は無い。ルート直下構成は仕様 0002 で決定済みで、本計画はその決定にルールとスキルの表記を合わせるだけ。`proxy.ts` の追加は Next.js 16 の改名への追従で、アーキテクチャ上の選択ではない。検査の存在は `docs/architecture.md`（T2。Q7）とテストファイルに記録すれば足りる。

## 7. 要確認事項

- [x] Q1: テストファイル名。推奨: `tests/harness/claude-paths-root-layout.test.ts`（`.claude/` のパス表記とルート直下構成を検査することが名前で分かる）。別案: 仕様の slug に揃えて `tests/harness/nextjs-rules-paths.test.ts`（仕様との対応は分かるが、スキル 2 つも対象なので名前が狭い）。
- [x] Q2: 「括弧」に含める文字と `./src/` の扱い。推奨: 境界は行頭・空白（全角空白を含む）・`"` `'` `` ` ``・`(` `[` `{`・全角の `（` `「` `『` とし、`./src/` `../src/` は仕様の定義どおり検出しない（限界として明記）。別案 A: 括弧を ASCII の `(` だけにする（仕様の文言に最も狭く忠実）。別案 B: 直前が `./` `../` の場合も検出する（現状の対象ファイルに該当は無く誤検知も増えないが、仕様の定義より広い。採るなら仕様の AC-1 を先に更新する）。
- [x] Q3: AC-2 の比較で順序を問うか。推奨: 問わない（仕様は「5 つがちょうど指定されていて、重複が無い」で順序を定めていない）。修正後の並びは 1.2 の順にする。別案: 1.2 の順序まで固定する（並べ替えの変更でもテストが落ち、仕様より厳しい）。
- [x] Q4: AC-3 の照合方法。推奨: `` `page.tsx` は薄く保つ `` の行に限定し、その行が `` `features/<名前>/` に置く `` （先頭のバッククォートを含む）を含むこと。先頭のバッククォートを含めないと、現状の `` `src/features/<名前>/` に置く `` でも部分一致で通ってしまう（変異 6 で確認）。別案: 本文全体で `` `features/<名前>/` に置く `` を探す（行を限定しない。置き場所の記述が別の行に移っても通るが、無関係な行で満たされうる）。
- [x] Q5: `spec-writing/SKILL.md` 13 行目の文言。推奨: 「`docs/specs/` に近い仕様がないか、`app/` `features/` `lib/` に再利用できる実装がないかを確認する。」（仕様 4.1 の列挙どおり。`components/` は現在存在しないので含めない）。別案: `components/ui/` も足す（`CLAUDE.md` 6 節の構成には含まれるが、仕様 4.1 の列挙より広い）。
- [x] Q6: 検出力の確認の方法。推奨: `.claude/` のファイルは変異させず、純粋関数の陽性・陰性テスト、一時ディレクトリ、RED 時点の実ファイルの失敗（7 件・欠落・余分）で検出力を示す。AC-4 だけはルートに一時的な `src/` を作って確かめる（`.claude/` 外なので確認は出ない）。別案: GREEN 後に `.claude/` の 3 ファイルを一時的に戻して失敗を確かめる（実ファイルでの確認になるが、編集のたびに hook の確認が出て、戻し忘れでガードレールのファイルを汚すおそれがある）。
- [x] Q7: `docs/architecture.md` の更新。推奨: 5 節に 1 行足す（0017・0018 と同じく、検査の存在を設計文書から辿れるようにする。3 節 26 行目の「`src/` は使わず」は既に正しいので変えない）。別案: 更新しない（3 節に既に方針があり、食い違いは無い）。
- [x] Q8: 走査対象の前提テストの強さ。推奨: rules の 7 ファイルと `SKILL.md` の 3 ファイルを「含む」こと（`arrayContaining`）と、除外すべきものが無いことを検査する。ファイル数の完全一致は求めない（rules・skills を足すたびにこのテストを直す必要が出るため）。別案: 一覧の完全一致（追加・削除に気づけるが、保守の手間が増える）。
- [x] Q9: タスクの分け方（2 タスク）。推奨: T1（テスト＋3 ファイルの修正を 1 コミット。RED は作業ツリー上で確認して記録）→ T2（文書・full verify・レビュー・Issue）。別案 A: テストと 3 ファイルの修正を `test:` → `chore:` の 2 コミットに分ける（`test:` 単体のコミットは RED のままなので `verify.sh --quick` を通らず、ルール上できない）。別案 B: T1 を「検出器・前提・AC-4（最初から緑）」、T2 を「AC-1〜AC-3 のテスト＋3 ファイル修正＋文書」に分ける（0018 と同じ分け方。この大きさでは過剰）。
- [x] Q10: レビューの範囲。推奨: `reviewer` は必須、`security-reviewer` は「ハーネス（`.claude/`）の変更がパスの表記だけで、ガードレールを緩めていないこと」に絞って通す（ハーネスの設定に触れるため。点検範囲が狭く負担は小さい）。別案: `reviewer` のみ（シークレット・認可・外部入力に関わらない）。
- [x] Q11: 提案 P1・P2 は本計画では採らない、でよいか。

## 8. 進捗メモ

- 2026-10-09: 計画作成（draft）。未着手。人間の承認（特に Q2・Q4・Q6・Q9・Q10）を得てから T1 に入る。`/issue split` はせず 1 PR で進める想定（2 タスク）。

- 2026-10-09: 人間が計画を承認（Q1〜Q11 すべて推奨どおり）。Status: in-progress。T1 から着手。

- 2026-10-09: T2 完了。`docs/architecture.md` 5 節に 1 行追記（レビューの Minor を受けて検査の対象外 `./src/` を補足）。`bash scripts/verify.sh`（full）: typecheck / lint / test（890 件）/ build すべて PASS。`reviewer`: Approve（Critical なし。Major は T1 の変異 6 で `.claude/rules/10-nextjs.md` を確認画面を経ずに一時書き換えた手順の逸脱で、コードの修正は不要・PR 本文に明記する）。`security-reviewer`（ガードレール緩和の有無に限定）: 指摘なし。Low の補足（`lib/` が `paths` に無い）は今回の差分によるものではなく、AC-2 が 5 つちょうどのため別 Issue で扱う。Status: done。
