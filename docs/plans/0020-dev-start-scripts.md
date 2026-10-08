# 0020: `dev` / `start` スクリプトの追加 実装計画

Status: in-progress                            <!-- draft | in-progress | done  ※ SessionStart hook が "Status: in-progress" の行を検出します。この行は変えないこと -->

- Issue: #35
- 対応する仕様: docs/specs/0020-dev-start-scripts.md
- ブランチ: chore/35-dev-start-scripts（作成済み。機能追加ではなく開発環境の整備のため `chore/`。Q4）
- 作成日: 2026-10-09

## 1. 方針

- `package.json` の `scripts` に `"dev": "next dev"` と `"start": "next start"` の 2 行だけを足す（仕様 4.1）。既存の 6 スクリプト・依存・`packageManager` は触らない。
- 構成検査テストを `tests/foundation/` に新規で置く（Q1）。流儀は `tests/foundation/project-structure.test.ts` に合わせる: 先頭に `// @vitest-environment node`、`vitest` の API を明示 import、`root = path.resolve(import.meta.dirname, "../..")`、`readFileSync` + `JSON.parse` で `package.json` を読む小さなヘルパ（`readPackageJson`）をテストファイル内に置く（既存テストのヘルパは共有化せず、既存ファイルは変えない）。
- 判定はすべて**完全一致**（`toBe`）。`toMatch` や `toContain` は使わない（仕様 AC-1〜AC-3 の「完全に一致する」）。
- AC-4（依存の追加・更新が無い）は仕様どおり自動検査しない。T1 のコミット前に `git diff` で確認し、進捗メモと PR 本文に記録して人間の確認に回す。
- 依存パッケージは追加しない（`node:fs` `node:path` と `vitest` だけを使う）。

### 1.1 確定する事項（計画の承認で確定）

| 事項 | 内容 |
| --- | --- |
| テストファイル | 新規 `tests/foundation/package-scripts.test.ts`（名前は Q1） |
| AC-1 | `expect(readPackageJson().scripts.dev).toBe("next dev")` |
| AC-2 | `expect(readPackageJson().scripts.start).toBe("next start")` |
| AC-3 | `it.each` で 6 件（`typecheck` → `next typegen && tsc --noEmit`、`lint` → `eslint .`、`test` → `vitest run`、`test:e2e` → `playwright test`、`build` → `next build`、`format` → `prettier --write .`）。期待値はテスト内にリテラルで持つ（`package.json` から読んだ値を期待値に使わない）。失敗時にどのスクリプトが変わったか分かるよう、テスト名にキーを入れる |
| 余分なスクリプトの検査 | しない（仕様にない。Q2） |

## 2. 影響範囲

| 種別 | パス | 内容 |
| --- | --- | --- |
| 新規 | `tests/foundation/package-scripts.test.ts` | 構成検査テスト（AC-1・AC-2・AC-3）（T1） |
| 変更 | `package.json` | `scripts` に `dev` と `start` の 2 行を追加（T1） |
| 変更 | `docs/plans/0020-dev-start-scripts.md` | 進捗メモ・Status（T1・T2） |
| 変更なし | `pnpm-lock.yaml`、`dependencies` / `devDependencies`、既存 6 スクリプト、`tests/foundation/project-structure.test.ts` ほか既存テスト、`README.md`、`.claude/harness.env`、`CLAUDE.md` | 触らない（仕様 4.2・AC-3・AC-4） |

事前調査の結果（2026-10-09）:

- 現在の `scripts` は `typecheck` `lint` `test` `test:e2e` `build` `format` の 6 つで、値は仕様 AC-3 の期待値と完全に一致している（したがって AC-3 のテストは最初から緑になる）。`dev` と `start` は無い。
- 既存の `tests/foundation/project-structure.test.ts` は `scripts.test`（`toBe("vitest run")`）と `scripts.typecheck`（`toMatch(/^next typegen && tsc /)`）を検査している。新テストの AC-3 と一部重なるが、仕様 0002 由来の検査なので変えない（重複は Q3）。
- `.claude/harness.env` の `CODE_REGEX` は `^package\.json$` を含むため、`package.json` の変更で Stop ゲートが動く。新しいテストは `TEST_REGEX`（`^tests/`）に一致するので「テストなしのソース変更」にはならない。`SRC_REGEX` には `package.json` は含まれない。
- `playwright.config.*` はまだ無い（E2E は仕様 0013）。`webServer` から `pnpm dev` / `pnpm start` を参照する箇所は現時点で無い。
- `AGENTS.md` には「`next dev` が自動で書き戻すブロック」があり、現在の内容はコミット済み。`pnpm dev` を手元で起動すると差分が出る可能性がある（5 節のリスク）。

## 3. タスク（1 タスク = 1 コミットの大きさ）

> 分け方の考え方: コミット前に `verify.sh --quick` の PASS が必要なため、RED のままのテストはコミットしない。AC-1・AC-2 は `package.json` を変えるまで RED なので、テストと `package.json` の変更を同じコミット（T1）に入れ、RED は作業ツリー上で確認する。T2 はコードを変えない検証・レビュー。

- [x] **T1: 構成検査テストの追加と `dev` / `start` スクリプトの追加（AC-1・AC-2 の RED → GREEN、AC-3、AC-4 の確認）**
  - 対応 AC: AC-1、AC-2、AC-3、AC-4（人間の確認用の記録）
  - 先に書くテスト: `tests/foundation/package-scripts.test.ts`
    - `describe("package.json の起動スクリプト（仕様 0020）")`
      - `AC-1: scripts.dev が next dev と完全に一致する`
      - `AC-2: scripts.start が next start と完全に一致する`
    - `describe("AC-3: 既存のスクリプトは変わらない")`
      - `it.each`: `AC-3: scripts.$name が $expected と完全に一致する`（6 件）
  - RED の方法（**`package.json` は未変更のまま**テストだけを書いて実行する）:
    - `pnpm test tests/foundation/package-scripts.test.ts` を実行し、**AC-1 と AC-2 の 2 件が失敗**することを確認する。失敗理由は期待値の不一致（`expected undefined to be 'next dev'` / `'next start'`）であること。import エラー・構文エラー・JSON の読み込み失敗での失敗は RED と認めない。
    - **AC-3 の 6 件は最初から緑でよい**（既存の値を固定する回帰防止のテストで、変更前から満たされているのが正しい状態）。AC-3 の検出力は後述の変異で確かめる。
    - 失敗件数とメッセージを進捗メモに記録する。
  - 実装: `package.json` の `scripts` に `"dev": "next dev"` と `"start": "next start"` を追加する（位置は Q5。既存行の順序・値は変えない）。編集直後の自動整形（Prettier）で既存行が変わっていないことを `git diff` で確認する。
  - GREEN: 同じテストを実行し、8 件すべて通ることを確認する。
  - 検出力の確認（GREEN 後に一時的に変異を入れて戻す。各変異のあと `git diff -- package.json` が「`dev` と `start` の 2 行追加だけ」に戻っていることを確認する）:
    1. `dev` を `next dev --turbopack` にする → AC-1 が失敗（オプション付きを完全一致で弾く）。
    2. `dev` の行を消す → AC-1 が `undefined` で失敗。
    3. `start` を `next start -p 3000` にする → AC-2 が失敗。
    4. `start` の行を消す → AC-2 が失敗。
    5. `build` を `next build --debug` にする → AC-3 の `build` だけが失敗（他の 5 件は通る。`it.each` で失敗箇所が特定できる）。
    6. `format` を `prettier --check .` にする → AC-3 の `format` が失敗。
    7. `test:e2e` のキーを消す → AC-3 の `test:e2e` が失敗。
    8. `dev` と `start` の値を入れ替える → AC-1・AC-2 の両方が失敗。
    - 変異の結果（検出できたか）を進捗メモに記録する。
  - AC-4 の確認（自動検査はしない）: `git diff -- package.json` で `dependencies` / `devDependencies` / `packageManager` に差分が無いこと、`git status` でロックファイル（`pnpm-lock.yaml`）が変更されていないことを確認し、差分の要約を進捗メモに記録する（PR 本文にも貼り、人間が最終確認する）。`pnpm install` は実行しない。
  - 起動の実地確認（任意。Q6）: `pnpm build` → `pnpm start` と、`pnpm dev` を短時間起動し、`curl` で `/`（クエリなし）が 200 を返すことを確認して停止する。終了後に `git status` で `AGENTS.md` などに差分が出ていないことを確認する（出た場合は 5 節の対策）。
  - 実装対象: `tests/foundation/package-scripts.test.ts`（新規）、`package.json`（変更）
  - 完了条件: 新しいテスト 8 件が通り、既存テストは変更なしで通る。`pnpm typecheck`・`pnpm lint`・`pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。変異 1〜8 がすべて検出されたことを記録済み。コミットは 1 つ（例: `chore: dev と start のスクリプトを追加する` + 本文末尾に `Refs #35`）。

- [ ] **T2: 最終確認とレビュー**
  - 対応 AC: なし（AC-1〜AC-4 の総合確認）
  - 先に書くテスト: なし（コードを変えない）
  - 実装対象: 本計画の進捗メモと `Status`
  - 確認:
    - `bash scripts/verify.sh`（full。build を含む）を実行し、PASS/FAIL を事実のまま進捗メモに記録する。
    - `reviewer` サブエージェントで差分を点検する（完全一致の検査、既存スクリプト・依存・ロックファイルの無変更、既存テスト無変更）。`security-reviewer` は省く想定（Q7）。
    - `docs/architecture.md` は更新しない想定（Q8）。
  - 完了条件: `verify.sh`（full）PASS、レビューの重大指摘の解消、AC-4 の差分要約を PR 本文用に用意、計画の `Status` を更新。

### 提案（仕様外。人間の判断で採否を決める。本計画のタスクには含めない）

- P1: `scripts` のキー集合が `typecheck` `lint` `test` `test:e2e` `build` `format` `dev` `start` の 8 つだけであることの検査（意図しないスクリプトの追加を検出できる）。仕様に無いため採らない想定（Q2）。
- P2: `tests/foundation/project-structure.test.ts` と重複する `scripts.test` / `scripts.typecheck` の検査の整理。既存テストを変えない方針（仕様 4.2）のため採らない想定（Q3）。
- P3: `CLAUDE.md` 3 節のコマンド表に `pnpm dev` / `pnpm start` を追記する。README（#12）で案内するため、本計画では採らない想定。`CLAUDE.md` の変更は確認が必要。

## 4. テスト方針

| 種類 | 対象 | ファイル | 環境 | モック |
| --- | --- | --- | --- | --- |
| 構成検査 | AC-1・AC-2・AC-3 | `tests/foundation/package-scripts.test.ts`（新規） | node | なし（実ファイルの `package.json` を読む） |
| 既存（変更なし） | 全テスト | 既存すべて | 既存のまま | 既存のまま |
| 手動（人間） | AC-4（依存の追加・更新が無い） | `git diff -- package.json`、`git status` | — | — |
| 手動（任意） | `pnpm dev` / `pnpm start` で起動できる | — | ローカル | なし（Q6） |
| E2E | なし（画面の見た目と挙動は変わらない） | — | — | — |

- テスト名は日本語で `AC-<番号>` を含める。
- 期待値はすべてテスト内のリテラル。完全一致（`toBe`）で検査し、部分一致は使わない。
- ネットワーク・一時ファイルは使わない。

### AC とタスクの対応表

| AC | 内容（要約） | テスト / 確認方法 | タスク |
| --- | --- | --- | --- |
| AC-1 | `scripts.dev` が `next dev` と完全一致 | `tests/foundation/package-scripts.test.ts` | T1 |
| AC-2 | `scripts.start` が `next start` と完全一致 | 同上 | T1 |
| AC-3 | 既存 6 スクリプトが仕様の値と完全一致 | 同上（最初から緑。変異 5〜7 で検出力を確認） | T1 |
| AC-4 | 依存の追加・更新が無い | `git diff` で人間が確認（自動検査なし） | T1、T2 |

## 5. リスクと対策

| リスク | 影響 | 対策 |
| --- | --- | --- |
| AC-3 が最初から緑のため、検査が効いているか分からない | 既存スクリプトの変更を見逃す | T1 の変異 5〜7 で、1 つ変えると該当の 1 件だけが失敗することを確かめる |
| 編集直後の自動整形（Prettier）で `package.json` の既存行や並びが変わる | AC-3・AC-4 の確認が紛らわしくなる | 編集後に `git diff -- package.json` を見て、差分が `dev` / `start` の 2 行（と直前行の末尾カンマ）だけであることを確認する |
| 誤って `pnpm install` 等を実行しロックファイルが変わる | AC-4 違反 | `pnpm install` を実行しない。コミット前に `git status` でロックファイルの無変更を確認する（ロックファイルは hook でも保護） |
| `pnpm dev` の起動で `next dev` が `AGENTS.md` を書き戻し、差分が出る | 無関係な変更の混入 | 起動確認は任意（Q6）。実施した場合は `git status` で確認し、差分が出たら本 PR に含めず `git restore AGENTS.md` で戻して人間に報告する |
| 起動確認で GitHub API を呼び、レート制限を消費する | 他の作業に影響 | クエリなしの `/` だけを 1〜2 回取得する |
| 既存テスト `project-structure.test.ts` と検査が重複する | 将来の変更時に 2 か所を直す必要 | 本計画では既存テストを変えない（仕様 4.2）。整理は提案 P2 として分ける |

## 6. ADR が必要な論点

- なし。依存パッケージの追加・技術選定は無い。Next.js 標準の `next dev` / `next start` を `scripts` に登録するだけで、ポートやオプションも固定しない（仕様 4.2）。

## 7. 要確認事項

- [ ] Q1: テストファイル名。推奨: 新規 `tests/foundation/package-scripts.test.ts`（何を検査するかが名前で分かり、既存ファイルを変えずに済む）。別案: 既存の `tests/foundation/project-structure.test.ts` に追記する（ファイルは増えないが、仕様 0002 の検査と混ざり、既存テストの変更になる）。
- [ ] Q2: `scripts` に仕様外のキーが無いことまで検査するか。推奨: しない（仕様の AC にない。必要なら提案 P1 として別 Issue）。
- [ ] Q3: `project-structure.test.ts` の `scripts.test` / `scripts.typecheck` の検査と新テストの AC-3 が重複するが、既存側はそのまま残してよいか。推奨: 残す（既存テストを変えない。整理は提案 P2）。
- [ ] Q4: ブランチ名。推奨: 作成済みの `chore/35-dev-start-scripts` をそのまま使う（ユーザー向け機能ではなく開発環境の整備のため。CLAUDE.md 9 節の `chore/<slug>` に Issue 番号を付けた形）。別案: `feat/35-dev-start-scripts` を作り直す。
- [ ] Q5: `dev` / `start` を `scripts` のどこに置くか。推奨: 先頭に `dev`、`build` の直後に `start`（Next.js の雛形と同じ並びで読みやすい。既存行の値・相対順は変えない）。別案: 末尾（`format` の後）に 2 行まとめて足す（差分が最小）。いずれもテストには影響しない。
- [ ] Q6: 起動の実地確認（`pnpm dev` / `pnpm build` → `pnpm start` を短時間起動して `/` が 200 を返すか）を T1 で行うか。推奨: 行う（`curl` で 1〜2 回、終了後に `git status` で `AGENTS.md` の差分を確認）。仕様の AC には無いが、README（#12）の前提となる「起動できる」ことの裏付けになる。別案: 行わない（AC はすべて構成検査で満たせる）。
- [ ] Q7: レビューの範囲。推奨: `reviewer` のみ（シークレット・認可・外部入力・依存に関わる変更が無い）。別案: `security-reviewer` も通す。
- [ ] Q8: `docs/architecture.md` の更新。推奨: しない（起動コマンドは設計上の決定ではなく、案内は README（#12）で行う）。別案: 構成検査の一覧に新テストを 1 行足す。
- [ ] Q9: 提案 P1〜P3 は本計画では採らない、でよいか。

## 8. 進捗メモ

- 2026-10-09: 計画作成（draft）。未着手。人間の承認（特に Q1・Q5・Q6）を得てから T1 に入る。`/issue split` はせず 1 PR で進める想定（2 タスク）。

- 2026-10-09: 人間が計画を承認（Q1〜Q9 すべて推奨どおり）。Status: in-progress。T1 から着手。

- 2026-10-09: T1 完了。RED: `package.json` 未変更で AC-1・AC-2 が `expected undefined to be 'next dev' / 'next start'` で失敗、AC-3 は緑（3 件中 2 失敗）。GREEN: `dev`（先頭）と `start`（`build` の直後）を追加し、`verify.sh --quick` PASS。変異 8 件（dev/start へのオプション付与、dev/start 行の削除、dev と start の入れ替え、build・format の変更、test:e2e キーの削除）をすべて検出し、`package.json` を復元（差分は 2 行の追加のみ）。AC-4: `git diff` で `dependencies` / `devDependencies` / `packageManager` に差分なし、`pnpm-lock.yaml` も未変更（`pnpm install` は未実行）。Q6: `pnpm dev`、`pnpm build` → `pnpm start` を起動して `/` が HTTP 200、起動後の `git status` に意図しない差分なし、サーバー停止済み。
