# 0002: プロジェクト基盤 実装計画

Status: in-progress <!-- draft | in-progress | done  ※ SessionStart hook が "Status: in-progress" の行を検出します。この行は変えないこと -->

- Issue: #2
- 対応する仕様: docs/specs/0002-setup-foundation.md
- ブランチ: feat/2-setup-foundation（現在の作業ブランチは `feat/0002-setup-foundation`。命名規則 `feat/<Issue番号>-<slug>` との差は「7. 要確認事項」を参照）
- 作成日: 2026-10-07

## 1. 方針

- Create Next App で作られた現状（Next 16.3.8 / React 19.2.8 / Tailwind v4 / ESLint 9 / TypeScript strict / vitest・Testing Library・jsdom・prettier 導入済み、scripts `typecheck` `lint` `test`（`vitest run`）`build` `format` 定義済み）を**そのまま使う**。新しく足すのは「不足している設定ファイル」「AC を検査するテスト」「shadcn/ui の初期化」「文書の整合」だけ。
- ディレクトリ構成は `src/` を使わずルート直下（`app/` `features/` `components/ui/` `lib/`）。`tsconfig.json` の `paths` は既に `"@/*": ["./*"]` でルート直下を指しているので変更しない。
- 受け入れ条件の検査は「人が目で確認する」のではなく、**Vitest のテストに落とす**（AC-21b の構成検査、AC-32a の `.gitignore` / `.env.example` 検査）。テストで表現しにくい AC-21a（クリーン状態からの 4 コマンド）と AC-32b（harness-doctor）は、最後のタスクで**実際にコマンドを実行**して結果を記録する。
- 設定ファイルの検査テストは jsdom ではなく Node 環境で動かす（ファイル先頭の `// @vitest-environment node`）。
- shadcn/ui は「`components.json` と `lib/utils.ts` の `cn`」までに留める（仕様 4.1）。依存追加は CLAUDE.md 5節に従い、**導入前に人間へ個別承認を取る独立タスク**にする。
- 依存順: テスト基盤 → 検査テストと設定修正 → 判断の記録（ADR）→ 依存追加（承認）→ shadcn/ui 初期化 → 文書の整合（CLAUDE.md）→ 最終確認。

## 2. 影響範囲

| 種別             | パス                                         | 内容                                                                                                                                               |
| ---------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新規             | `vitest.config.mts`                          | Vitest 設定（`@vitejs/plugin-react`、`environment: "jsdom"`、`@` エイリアスをルートへ、setup ファイル指定）                                        |
| 新規             | `vitest.setup.ts`                            | `@testing-library/jest-dom/vitest` の読み込み、テストごとの `cleanup`                                                                              |
| 新規             | `app/page.test.tsx`                          | スモークテスト（AC-21b）                                                                                                                           |
| 新規             | `tests/foundation/project-structure.test.ts` | package.json / tsconfig / `app/` の構成検査（AC-21b）                                                                                              |
| 新規             | `tests/foundation/env-files.test.ts`         | `.gitignore` / `.env.example` の検査（AC-32a）                                                                                                     |
| 新規             | `docs/adr/0003-tailwind-and-shadcn-ui.md`    | Tailwind CSS v4 + shadcn/ui 採用の ADR                                                                                                             |
| 新規             | `components.json`                            | shadcn/ui 設定（ルート直下構成のエイリアス）                                                                                                       |
| 新規             | `lib/utils.ts`                               | `cn`（clsx + tailwind-merge）                                                                                                                      |
| 新規             | `lib/utils.test.ts`                          | `cn` の単体テスト（`lib/` は `SRC_REGEX` 対象のため Stop ゲート上テスト必須）                                                                      |
| 変更             | `app/page.tsx`                               | Create Next App の雛形をプレースホルダーに置き換え                                                                                                 |
| 変更             | `.gitignore`                                 | `.env*` を除外し `!.env.example` で例外化                                                                                                          |
| 変更             | `.env.example`                               | キー名 `GITHUB_TOKEN=` のみにする（無関係な例 `DATABASE_URL` 等の行を削除）                                                                        |
| 変更             | `docs/architecture.md`                       | 技術スタック表（スタイリング・テスト）と構成（`src/` → ルート直下）の更新                                                                          |
| 変更             | `package.json` / `pnpm-lock.yaml`            | shadcn/ui 用依存の追加（**人間承認後**、`pnpm add` 経由でのみ更新。ロックファイルは手で編集しない）。T8 で `typecheck` script を変更する可能性あり |
| 変更             | `CLAUDE.md`                                  | 6節の `src/` 記述をルート直下構成に合わせる（**保護ファイル。編集時に確認が出る**）                                                                |
| 変更（条件付き） | `app/globals.css`                            | shadcn/ui のテーマ変数を今入れる場合のみ（T6 の選択肢 B）                                                                                          |

## 3. タスク（1 タスク = 1 コミットの大きさ）

- [x] **T1: Vitest の設定とスモークテスト、トップページの置き換え**
  - 対応 AC: AC-21b（スモークテストが1件以上あり、パスする）
  - 先に書くテスト: `app/page.test.tsx` / `AC-21b: トップページを描画するとプレースホルダーの見出しが表示される`（`getByRole("heading", { level: 1 })` でアプリ名などのプレースホルダー文言を検証）
  - 実装対象: `vitest.config.mts`、`vitest.setup.ts`、`app/page.test.tsx`、`app/page.tsx`（4 ファイル）
  - 手順: (1) `vitest.config.mts` と `vitest.setup.ts` を作る → (2) テストを書き `pnpm test` で**見出し文言の不一致による失敗**を確認（RED。設定不備やインポートエラーでの失敗は RED と認めない）→ (3) `app/page.tsx` を雛形から最小のプレースホルダー（同期の Server Component、`next/image` や外部リンクなし）に置き換えて GREEN。
  - 注意: `async` な Server Component は Testing Library で直接描画できないため、ページは同期関数のままにする。`vitest` のグローバル API は使わず、`import { describe, it, expect } from "vitest"` で明示 import する（tsconfig の型設定を増やさないため）。
  - 完了条件: `pnpm test` が終了コード 0、`pnpm typecheck` `pnpm lint` も PASS。

- [x] **T2: 構成検査テスト（Next.js バージョン・`app/`・tsconfig strict・test script）**
  - 対応 AC: AC-21b
  - 先に書くテスト: `tests/foundation/project-structure.test.ts`（`// @vitest-environment node`）
    - `AC-21b: package.json の next のメジャーバージョンが16以上である`（`dependencies.next` の範囲表記から最小メジャーを取り出して比較）
    - `AC-21b: ルート直下に app ディレクトリと app/page.tsx・app/layout.tsx がある`
    - `AC-21b: tsconfig.json の compilerOptions.strict が true である`（コメント付き JSON にも耐えるよう `typescript` の `readConfigFile` で読む）
    - `AC-21b: app/ 配下にスモークテスト（*.test.tsx）が1件以上ある`
    - （非機能 8節）`scripts.test が watch しない形（vitest run）である`
  - 実装対象: `tests/foundation/project-structure.test.ts`（1 ファイル）
  - RED について: 現状が既に条件を満たしているため、正しく書けば最初から PASS する（特性テスト）。**検出力の確認**として、ローカルで一時的に `tsconfig.json` の `strict` を `false` にして該当テストが失敗することを確かめ、すぐ元に戻す（コミットしない）。テスト側を書き換えて確認しない。
  - 完了条件: `pnpm test` PASS、検出力確認の結果を進捗メモに記録。

- [x] **T3: `.gitignore` と `.env.example` の整備、検査テスト**
  - 対応 AC: AC-32a
  - 先に書くテスト: `tests/foundation/env-files.test.ts`（`// @vitest-environment node`）
    - `AC-32a: .env.example に GITHUB_TOKEN のキーがある`
    - `AC-32a: .env.example のコメント以外の行はすべて「キー名=」で値を持たない`（`^[A-Z][A-Z0-9_]*=$` に一致すること）
    - `AC-32a: .env.example に GITHUB_TOKEN 以外のキーが無い`（コメント行内の `KEY=` 例も含めて検出する）
    - `AC-32a: .env / .env.local / .env.development / .env.production / .env.test.local は Git 管理外である`（`git check-ignore --no-index -q <path>` を `execFileSync` で引数配列として呼ぶ。ファイルの実在は不要で、`.env*` の中身は一切読まない）
    - `AC-32a: .env.example は Git 管理外ではない`（同コマンドが終了コード 1 を返す）
  - RED: 現状は `.env.production` / `.env.development` が除外されておらず、`.env.example` に `GITHUB_TOKEN` が無く例示キー（`DATABASE_URL` 等）があるため、意図どおり失敗する。
  - 実装対象: `tests/foundation/env-files.test.ts`、`.gitignore`（`.env*` と `!.env.example` に置き換え）、`.env.example`（説明コメント＋ `GITHUB_TOKEN=` のみ。「任意。未設定でも動作する」旨をコメントに書く）（3 ファイル）
  - 注意: `.env.example` は Edit/Write ツールで編集できる（guard-files.sh の例外）。Bash の `cat` 等では読まない。`.env` / `.env.local` は読まない・作らない。
  - 完了条件: `pnpm test` PASS。

- [x] **T4: ADR（Tailwind CSS v4 + shadcn/ui 採用）と architecture.md の更新**
  - 対応 AC: なし（仕様 4.1「決定は ADR に記録する」「ディレクトリ構成の決定」）
  - 先に書くテスト: なし（文書のみ。Stop ゲート対象外）
  - 実装対象: `docs/adr/0003-tailwind-and-shadcn-ui.md`（`docs/adr/0000-template.md` をコピー。Status: Accepted、決定日 2026-10-07、決定者は人間。比較案: Tailwind のみ / Tailwind + shadcn/ui / CSS Modules / 他の UI ライブラリ。追加される依存とその導入方針（T5）も「影響」に書く）、`docs/architecture.md`（2節のスタイリング＝Tailwind CSS v4 + shadcn/ui（ADR 0003）、テスト＝Vitest + Testing Library + jsdom、3節の `src/app/` 等をルート直下の `app/` `features/<名前>/` `components/ui/` `lib/` に修正）（2 ファイル）
  - 完了条件: ADR がテンプレートのセクションを削らず埋まっている。architecture.md に `src/` の記述が残っていない。

- [x] **T5: 【人間の承認が必要】shadcn/ui 用の依存追加**
  - 対応 AC: なし（仕様 4.1 / 9節の未決事項「導入時に人間へ個別承認を取る」）
  - 先に書くテスト: なし（依存追加のみ。利用とテストは T6）
  - 手順:
    1. 追加候補ごとに「用途・代替案・メンテ状況・ライセンス」を示して**人間の承認を得る**（承認が出るまで `pnpm add` を実行しない）。候補は「6. ADR が必要な論点」の選択肢 A / B を参照。推奨は A（`clsx` `tailwind-merge` の 2 つだけ）。
    2. 承認された依存だけを `pnpm add <pkg>` で追加する（`package.json` と `pnpm-lock.yaml` は pnpm が更新する。手で編集しない）。
  - 実装対象: `package.json`、`pnpm-lock.yaml`（2 ファイル、いずれもコマンド経由）
  - 完了条件: 承認内容（パッケージ名・バージョン・承認日）を進捗メモに記録。`pnpm install --frozen-lockfile` が通る。`bash scripts/verify.sh --quick` PASS。

- [x] **T6: shadcn/ui の初期化（`components.json` と `lib/utils.ts` の `cn`）**
  - 対応 AC: なし（仕様 4.1）。AC-21a/21b を壊さないことを確認する
  - 先に書くテスト: `lib/utils.test.ts`
    - `cn: 複数のクラス名を空白区切りで連結する`
    - `cn: false / undefined / null の値を除外する`
    - `cn: 競合する Tailwind クラスは後に書いたものが残る（例: "p-2" と "p-4" → "p-4"）`
  - RED: `lib/utils.ts` が無い段階ではインポートエラーになり RED と認められないため、先に `cn` を空実装（例: 常に空文字を返す）で置いてからテストを実行し、期待値の不一致で失敗することを確認する。
  - 実装対象: `components.json`（`tsx: true`、`rsc: true`、`tailwind.config: ""`（v4）、`tailwind.css: "app/globals.css"`、エイリアス `@/components` `@/components/ui` `@/lib` `@/lib/utils` `@/hooks`）、`lib/utils.ts`、`lib/utils.test.ts`（3 ファイル。選択肢 B の場合は `app/globals.css` を加えて 4 ファイル）
  - 方法: 選択肢 A では `shadcn init` CLI を使わず、shadcn/ui 公式の manual installation 手順に沿って手で作成する（CLI は承認していない依存や `globals.css` の書き換えを伴うため）。手順は実施時に公式ドキュメントで確認し、推測で書かない。
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T7: CLAUDE.md 6節のディレクトリ構成をルート直下に修正**
  - 対応 AC: なし（仕様 4.1「CLAUDE.md 6節と `SRC_REGEX` は実態に合わせる」）
  - 先に書くテスト: なし（文書のみ）
  - 実装対象: `CLAUDE.md`（1 ファイル）。6節のツリーから `src/` を外し、`app/` `features/<名前>/` `components/ui/` `lib/` をルート直下に置く形にする。末尾の「※ `src/` を使わない構成にする場合は…」の注記を「ルート直下構成を採用（ADR 0003 / 仕様 0002）。`SRC_REGEX` はルート直下を対象にしている」旨に書き換える。
  - 注意: **CLAUDE.md は保護ファイルで、編集時に確認（承認画面）が出る。** 承認されなければ編集せず、差分案を人間に提示して止める。200 行以内を保つ。
  - 完了条件: 6節に `src/` の記述が残っていない。行数が 200 以内。

- [ ] **T8: クリーン状態からの品質ゲート確認と harness-doctor の実行**
  - 対応 AC: AC-21a、AC-32b
  - 先に書くテスト: なし（コマンド実行で確認する AC）
  - 手順:
    1. T1〜T7 をコミットした状態で、スクラッチ領域へ `git clone`（ローカルパスから）したクリーンな作業コピーを作り、`pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm lint` → `pnpm test` → `pnpm build` を順に実行し、各終了コードを記録する（AC-21a）。
    2. 作業ブランチで `bash scripts/harness-doctor.sh` を実行し、出力に `[FAIL]` が無く、`typecheck/lint/test/build → scripts.*` がすべて `[ OK ]` であることを確認する（AC-32b）。gh 未認証や origin/main 無しの `[WARN]` は FAIL ではない。
    3. `bash scripts/verify.sh` を実行し PASS/FAIL を事実のまま記録する。
  - 想定される修正（発生した場合のみ）: クリーン状態では `.next/types` と `next-env.d.ts`（Git 管理外）が無く、`app/layout.tsx` の `LayoutProps<"/">`（Next.js が生成するグローバル型）が未定義になって `pnpm typecheck` が失敗する可能性が高い。その場合は `package.json` の `typecheck` を `next typegen && tsc --noEmit` に変える（`next typegen` は 16.3.8 の CLI に存在することを確認済み）。script 名は変わらないので `harness.env` の `TYPECHECK_CMD` と harness-doctor の対応は維持される。この修正を入れる場合は、T2 のテストに「`scripts.typecheck` が型生成を含む」検査を加えるかを人間と相談する。
  - 実装対象: 原則なし。上記修正が必要なら `package.json`（1 ファイル）と本計画の進捗メモ。
  - 完了条件: AC-21a の 5 コマンドがすべて終了コード 0、harness-doctor に `[FAIL]` 無し、`verify.sh` PASS。結果を進捗メモに記録し、計画の `Status` を更新。

- [ ] **T9: `SRC_REGEX` に `features` を追加し、`.prettierignore` を追加（人間承認済みの追加タスク）**
  - 対応 AC: なし（要確認事項 2 と提案 P1 の採用）
  - 先に書くテスト: なし（設定のみ）
  - 実装対象: `.claude/harness.env`（`SRC_REGEX` の `(src|app|lib|components|pages)` に `features` を追加。**保護ファイル。編集時に確認が出る**）、`.prettierignore`（`pnpm-lock.yaml`、`.next/`、`node_modules/`、`docs/` 等）
  - 完了条件: `bash scripts/harness-doctor.sh` に `[FAIL]` 無し、`pnpm format` がロックファイルを書き換えない。
  - 追加で T7 に P3（CLAUDE.md 2 節のプレースホルダーを ADR 0003 の決定で埋める）を含める。

### 提案（仕様外。人間の判断で採否を決める。本計画のタスクには含めない）

- P1: `.prettierignore` の追加（`pnpm-lock.yaml`、`.next/`、`docs/` 等）。現状 `pnpm format`（`prettier --write .`）はロックファイルや生成物も整形対象にしうる。`.prettierrc` は既定値で運用できるため不要と考える。
- P2: `.claude/rules/10-nextjs.md` の `src/features/<名前>/` 表記をルート直下に合わせる（`.claude/` は保護ファイル）。
- P3: CLAUDE.md 2節の `<例: ...>` プレースホルダー（スタイリング・テスト）を ADR 0003 の決定内容で埋める。T7 と同じコミットにまとめられる。
- P4: `app/layout.tsx` の `metadata`（`Create Next App`）と `lang="en"` をプロジェクトに合わせる。`public/` の雛形 SVG（`next.svg` `vercel.svg` 等）の削除。
- P5: `package.json` の `test:e2e`（`playwright test`）は Playwright 未導入のため現状失敗する。仕様 0013（E2E）で扱う想定。

## 4. テスト方針

| 種類                       | 対象                                                          | ファイル                                     | 環境                                |
| -------------------------- | ------------------------------------------------------------- | -------------------------------------------- | ----------------------------------- |
| コンポーネント（スモーク） | トップページの描画                                            | `app/page.test.tsx`                          | jsdom                               |
| 設定検査                   | package.json / tsconfig / `app/` 構成（AC-21b）               | `tests/foundation/project-structure.test.ts` | node                                |
| 設定検査                   | `.gitignore` / `.env.example`（AC-32a）                       | `tests/foundation/env-files.test.ts`         | node                                |
| 単体                       | `cn`                                                          | `lib/utils.test.ts`                          | jsdom（既定。DOM 不要だが問題なし） |
| コマンド実行               | クリーン状態の 4 コマンド（AC-21a）、harness-doctor（AC-32b） | T8 で実行し記録                              | —                                   |
| E2E                        | なし（仕様 0013 で扱う）                                      | —                                            | —                                   |

- AC と検証手段の対応

| AC     | 検証手段                                                                                                                                                                                    | タスク |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| AC-21a | クリーンな clone で `pnpm install --frozen-lockfile` → typecheck → lint → test → build を実行し終了コード 0 を確認。CI（`.github/workflows/ci.yml` の verify ジョブ）も同条件で再確認される | T8     |
| AC-21b | `project-structure.test.ts`（Next ≥16、`app/` あり、strict true、スモークテスト存在）＋ `app/page.test.tsx`（スモークテストが PASS）                                                        | T1, T2 |
| AC-32a | `env-files.test.ts`（`.env.example` のキーと値の有無、`git check-ignore --no-index` による管理外判定）                                                                                      | T3     |
| AC-32b | `bash scripts/harness-doctor.sh` を実行し `[FAIL]` 無し・scripts 対応が `[ OK ]`                                                                                                            | T8     |

- モック: なし（外部 API・ネットワークを使わない）。`git check-ignore` は実プロセスを呼ぶが、リポジトリ内の読み取りのみで副作用はない。
- テスト名は日本語で `AC-<番号>` を含める（`.claude/rules/30-testing.md`）。

## 5. リスクと対策

| リスク                                                                          | 影響                                                                            | 対策                                                                                                       |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| クリーン状態で `LayoutProps` 等の Next 生成型が無く `pnpm typecheck` が失敗する | AC-21a 不達、CI の verify ジョブが失敗                                          | T8 でクリーン clone を使って実際に確認。失敗時は `typecheck` を `next typegen && tsc --noEmit` に変更      |
| `.gitignore` の `.env*` 化で `.env.example` まで除外される                      | 雛形が追跡されなくなる                                                          | `!.env.example` を併記し、T3 のテストで「管理外ではない」ことを検査                                        |
| `.env*` の内容がテストやログに出る                                              | シークレット漏えい                                                              | テストは `.env.example` 以外を読まない。管理外判定は `git check-ignore` でパスだけを扱う                   |
| shadcn CLI が未承認の依存追加や `globals.css` の大幅な書き換えを行う            | CLAUDE.md 5節違反、既存スタイルへの影響                                         | 選択肢 A では CLI を使わず手動で `components.json` / `lib/utils.ts` を作る。依存は T5 で承認されたものだけ |
| 構成検査テスト（T2）が最初から PASS し RED を確認できない                       | テストの検出力が不明                                                            | 一時的に対象設定を崩して失敗を確認し元に戻す（コミットしない）。結果を進捗メモに残す                       |
| jsdom 環境で Node API（`fs` `child_process`）を使うテストが不安定               | テスト失敗                                                                      | 設定検査テストは `// @vitest-environment node` を指定                                                      |
| CLAUDE.md（保護ファイル）の編集が承認されない                                   | 文書と実態の不一致が残る                                                        | 差分案を提示して止め、人間の判断を待つ                                                                     |
| Windows 環境で `jq` が無い等により harness-doctor が `[FAIL]`                   | AC-32b 不達                                                                     | T8 で実行結果をそのまま報告し、ツール導入は人間に依頼（ハーネス側を緩めない）                              |
| `SRC_REGEX` に `features/` が含まれていない                                     | 以降のタスクで `features/` のコードにテストが無くても Stop ゲートが差し戻さない | 要確認事項として人間に判断を仰ぐ（`harness.env` は保護ファイル）                                           |

## 6. ADR が必要な論点

- **Tailwind CSS v4 + shadcn/ui の採用（必要。T4 で `docs/adr/0003-tailwind-and-shadcn-ui.md` を作成）** — 決定自体は 2026-10-07 に人間が済ませているため、記録のみ。
- **shadcn/ui 初期化時の依存の範囲（ADR 0003 の「影響」に記載。別 ADR は不要）**
  - 選択肢 A（推奨）: `clsx` + `tailwind-merge` のみ追加し、`components.json` と `lib/utils.ts` を手動作成。`class-variance-authority` `lucide-react` `tw-animate-css` とテーマ CSS 変数は、最初のコンポーネントを追加するタスクで改めて承認を取る。仕様 4.1 の範囲（`components.json` と `cn` まで）に最も忠実で、未使用依存を持たない。
  - 選択肢 B: `pnpm dlx shadcn@latest init` を実行。`clsx` `tailwind-merge` `class-variance-authority` `lucide-react` `tw-animate-css` が追加され、`app/globals.css` にテーマ変数が書き込まれる。後続タスクでの追加作業は減るが、本タスク時点では未使用の依存とスタイル変更が入る。
- ディレクトリ構成（ルート直下）は ADR 0003 または architecture.md に記録すれば足りると考える（独立 ADR にするかは要確認事項）。

## 7. 要確認事項

- [ ] shadcn/ui の依存範囲は選択肢 A（`clsx` `tailwind-merge` のみ・手動初期化）でよいか。B（`shadcn init` 実行）にするか。
- [ ] `SRC_REGEX='^(src|app|lib|components|pages)/...'` には `features/` が含まれていない。仕様 4.1 は「`SRC_REGEX` は既にルート直下を許容済み」としているが、`features/<名前>/` のコードは TDD 強制の対象外になる。`features` を追加するか（`.claude/harness.env` は保護ファイルで、本計画の範囲外なら別 Issue にするか）。
- [ ] T8 でクリーン状態の `pnpm typecheck` が失敗した場合、`typecheck` を `next typegen && tsc --noEmit` に変更してよいか（代替: `app/layout.tsx` の props 型を `{ children: React.ReactNode }` に書き換える。ただし今後 `PageProps` 等を使う際に同じ問題が再発する）。
- [ ] ブランチ名: 現在は `feat/0002-setup-foundation` だが、規則（`feat/<Issue番号>-<slug>`）では `feat/2-setup-foundation`。このまま進めるか、リネームするか。
- [ ] ディレクトリ構成の決定を独立した ADR にするか、ADR 0003 と architecture.md への記載で足りるか。
- [ ] 提案 P1〜P5 の採否（採用する場合は本計画にタスクを追加するか、別 Issue にする）。

## 8. 進捗メモ

- 2026-10-07: 計画作成（draft）。未着手。次は人間の承認後に T1 から開始する。
- 2026-10-07: 人間が推奨どおりで承認（Status: in-progress）。決定事項: shadcn/ui は選択肢 A（`clsx` `tailwind-merge` のみ・手動初期化。ただし `pnpm add` 実行前に T5 で改めて承認を取る）／`SRC_REGEX` に `features` を本タスクで追加（T9）／`typecheck` 失敗時は `next typegen && tsc --noEmit` に変更／ブランチ名は `feat/0002-setup-foundation` のまま／ディレクトリ構成の独立 ADR は作らない／P1・P3 を採用（P2・P4・P5 は別 Issue）／`/issue split` はせず 1 PR で進める。
- 2026-10-07: T5 人間承認のうえ追加: clsx 2.1.1 / tailwind-merge 3.7.0（`pnpm add` 経由）。
- 2026-10-07: T6 完了。components.json は style=new-york / baseColor=neutral（公式ドキュメントでは初期化後に変更不可とされる。最初のコンポーネント追加前なら変更可）。iconLibrary は lucide-react 承認時に追加。
