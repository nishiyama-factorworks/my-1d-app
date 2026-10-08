# 0012: README・AI利用レポート 実装計画

Status: in-progress              <!-- draft | in-progress | done  ※ SessionStart hook が "Status: in-progress" の行を検出します。この行は変えないこと -->

- Issue: #12
- 対応する仕様: docs/specs/0012-readme-ai-report.md
- ブランチ: docs/12-readme-ai-report（作成済み。成果物が文書と文書の構造検査だけのため `docs/`。Q12）
- 作成日: 2026-10-09

## 1. 方針

### 1.1 全体像

- 成果物は 2 つ: `README.md`（現在は `# my-1d-app` の 1 行だけ）と、その構造を検査する `tests/docs/readme.test.ts`（AC-30a〜AC-30d、AC-30f、AC-30g）。アプリのコード（`app/` `features/` `lib/` `components/`）、`package.json`、ロックファイル、`.claude/`、`scripts/`、`.github/` は変更しない（仕様 4.1・4.2）。
- 文書タスクだが TDD の順序を守る: 各節の検査テストを先に書き、README が未記入の状態で**期待値の不一致**で失敗すること（RED）を確かめてから、その節を書く（GREEN）。import エラー・構文エラー・ファイルの読み込み失敗での失敗は RED と認めない。
- README には**確認した事実だけ**を書く。書く前に調査タスク（T1）で一次情報（`package.json`、`app/` の構成、仕様・計画・ADR、`git log`、マージ済み PR）を読み、根拠（ファイルのパス・PR 番号・仕様番号）を本計画の進捗メモに記録する。数値（PR 数・仕様数など）は書く時点で確認した値を、確認日と取得方法つきで書く（仕様 8 節）。確認できなかったことは書かないか、「未確認」と書く。
- 文章の質（理由が通っているか、事実と合っているか）は自動検査の対象外。`reviewer` で確認する（仕様 5 節の注記）。AC-30e は新規クローンでの手動実行で確認し、結果を PR 本文に書く。
- README と実装・仕様・ADR の食い違いに気づいたら、README に誤りを書かない。コードの修正が必要なら別 Issue にする（仕様 4.2・8 節）。文書（仕様・計画・ADR）の食い違いは人間に報告して扱いを決める（Q11）。

### 1.2 構造検査テストの設計（`tests/docs/readme.test.ts`）

- 先頭に `// @vitest-environment node`。`root = path.resolve(import.meta.dirname, "../..")`、`readFileSync` で `README.md` と `package.json` を読む（`tests/harness/claude-paths-root-layout.test.ts`・`tests/foundation/package-scripts.test.ts` の流儀）。依存パッケージは追加しない（`node:fs` `node:path` `node:os` と `vitest` のみ。Markdown のパーサは入れない）。
- 判定は**純粋関数**に切り出し、陽性・陰性のテストを持たせる（README の現物に対するテストとは別の `describe`）。関数名は実装時に決めてよい。想定:

| 関数（想定） | 内容 | 陽性・陰性のテストで固定すること |
| --- | --- | --- |
| `extractHeadings(md)` | `##` と `###` の見出しを `{ level, text }` の列で返す | フェンス（```` ``` ```` / `~~~`）の中の `# コメント` を見出しにしない、CRLF と先頭の BOM、末尾の空白、`####` 以下は返さない |
| `getSection(md, path)` | 見出し（例: `["範囲と制約", "既知の制約"]`）の直下から、同じかそれより上のレベルの次の見出しの手前までの本文を返す。無ければ `null` | 最後の節（ファイル末尾まで）、同名の `###` が別の `##` の下にあっても取り違えない、フェンス内の `#` で切れない |
| `findPnpmCommands(md)` | 本文中の `pnpm <名前>` の名前を列挙する（`pnpm run <名前>` は `<名前>`） | `pnpm test` と `pnpm test:e2e` を別の名前として取る（部分一致で取り違えない）、`pnpm 12.9.1` のような数字や日本語の直後の `pnpm` を拾わない |
| `findRelativePaths(md)` | Markdown リンク `[..](target)` の相対の `target`（`http(s):`・`mailto:`・`#` で始まるものを除き、`#…` の断片を落とす）と、バッククォート内のリポジトリ内パス（1.4 の規則）を列挙する | 外部 URL・ページ内アンカーを除く、`<名前>` `*` `{` を含むプレースホルダー・glob を除く、`/repos/[owner]/[repo]` のような URL のパス（`/` で始まる）を除く |
| `existsExactCase(root, rel)` | パスの各セグメントを `readdirSync` の名前と**大文字小文字まで**照合して実在を判定する | Windows（大文字小文字を区別しない）で `docs/ADR/…` を誤って通さない（CI の Linux と結果を揃える）。一時ディレクトリで陽性・陰性を作る |
| `findSecretLike(md)` | `ghp_`・`github_pat_` を含む箇所、`GITHUB_TOKEN` の直後に `=`（前後の空白可）と 1 文字以上の値が続く箇所を返す | `GITHUB_TOKEN=` だけ（値なし。行末・バッククォートの直前）と、名前だけの `GITHUB_TOKEN` は検出しない（仕様 AC-30g の括弧書き） |

- README の現物に対するテスト（AC ごとの `describe`。テスト名は日本語で `AC-30x` を含める）:
  - 見出し（AC-30a〜AC-30d の前提）: `extractHeadings` の結果が、仕様 4.1 の `##` 5 つと `###` 10 個を**この順で過不足なく**並べた配列と完全一致する（Q3）。`#` のタイトル（`# my-1d-app`）は検査しない。
  - AC-30a〜AC-30d: 節ごとに `getSection` で本文を取り、必須キーワードがその節に含まれることを検査する（キーワードの一覧は 1.3）。別の節にあるだけでは通らない。
  - AC-30a（スクリプトの実在）: `findPnpmCommands` の結果のうち、pnpm 自体のコマンドの許可リスト（`install` のみ。Q4）以外が、すべて `package.json` の `scripts` のキーにある。前提として 1 件以上あること（空のまま緑にならない）。
  - AC-30f: `findRelativePaths` の結果が 1 件以上あり、すべて `existsExactCase` で実在する。
  - AC-30g: `findSecretLike(README)` が空配列。
- テスト内のトークン形式の文字列（陽性テストの入力）は、`"ghp" + "_" + "a".repeat(36)` のように**連結で組み立て**、`ghp_…` の完成形をソースに直書きしない（シークレットスキャナの誤検知を避ける。計画 0003 の SENTINEL と同じ考え方）。
- 不可視文字（ゼロ幅文字・BOM・全角空白など）を README・テストに直書きしない。テストの入力では `"\uFEFF"` `"\u3000"` のようにエスケープで書く（計画 0019 の方針）。T2・T3 の完了条件で README とテストを `[\u200B\u200C\u200D\u2060\uFEFF]` で Grep して 0 件を確認する。
- 限界（テストファイル先頭のコメントに書く）: 行ベースの簡易解析で、Setext 形式の見出し（`===` の下線）・HTML の見出し・参照形式のリンク（`[a][b]`）は扱わない。文章の妥当性は検査しない。

### 1.3 節ごとの必須キーワード（テストの期待値。テスト内にリテラルで持つ）

| AC | 節（`getSection` の対象） | 必須（すべて含む） |
| --- | --- | --- |
| AC-30a | `## 概要` | `GitHub`、`リポジトリ`、`検索`、`詳細`（アプリの概要が書かれていることの最低限の確認。Q5） |
| AC-30a | `## セットアップ` | `findPnpmCommands` の結果に `install` `dev` `build` `start` `test` `test:e2e` がすべてある、文字列 `bash scripts/verify.sh`、`GITHUB_TOKEN`、`任意`、`未設定` |
| AC-30b | `### 画面構成とルーティング` | `` `/` ``（バッククォートで囲んだ `/`）、`/repos/[owner]/[repo]` |
| AC-30b | `### ディレクトリ構成` | `` `app/` `` `` `features/` `` `` `lib/` `` `` `components/` `` `` `tests/` `` `` `e2e/` `` `` `docs/` ``（バッククォートで囲んだ形。`docs/specs/` の中の `specs/` などとの部分一致を避ける） |
| AC-30b | `### 工夫した点と理由` | `subscribers_count`、`サーバー側`、`URL`、`/1,000\s*件/`、`/300\s*秒/`、`/600\s*秒/`（「理由とともに」はレビューで確認。Q5） |
| AC-30c | `### プロダクション想定の範囲` | `セキュリティ` `信頼性` `アクセシビリティ` `パフォーマンス` `見やすさ` `メタデータ` `品質ゲート` `テスト方針`（親仕様 0001 の 8 節の 8 項目の名前と同じ表記） |
| AC-30c | `### 対応しなかった事項` | `タイトル` と `仮`、`ブラウザ`、`ダークモード`。あわせて、運営上の項目（`評価基準`、`期限`、`公開設定`）を**含まない**（仕様 9 節の決定。Q6） |
| AC-30c | `### 既知の制約` | `/1,000\s*件/`、`レート制限` |
| AC-30d | `### 使ったツール` | `Claude Code` |
| AC-30d | `### 進め方` | `仕様駆動`、`TDD`、`CLAUDE.md`、`.claude/`、`scripts/verify.sh` |
| AC-30d | `### 人間が判断・修正した点`、`### AIの出力で注意した点` | それぞれに根拠の番号が 1 つ以上（`/(仕様|計画|ADR)\s*\d{4}/`、`/PR\s*#\d+/`、または `docs/(specs|plans|adr)/\d{4}-` へのリンクのいずれか） |

- 正規表現はテストファイル内のリテラル（`/…/`）で書く。`new RegExp` に文字列で渡す形は使わない（エスケープの二重化を避ける）。

### 1.4 相対パスの検査の規則（AC-30f）と `components/` の扱い

- 検査対象: (1) Markdown リンクの相対の `target` すべて、(2) バッククォート内の文字列のうち、`docs/` `app/` `features/` `lib/` `components/` `tests/` `e2e/` `scripts/` `.claude/` `.github/` のいずれかで始まり、空白・`<` `>` `*` `{` `}` を含まないもの、(3) バッククォート内のルート直下のファイル名（`CLAUDE.md` `AGENTS.md` `package.json` など、拡張子つきで `/` を含まないもの。`.env.local` のように Git 管理外のものは対象外にするため、`.env` で始まるものは除く）。
- **問題点（Q1）**: AC-30b は「ディレクトリ構成」に `` `components/` `` を書くことを求めるが、`components/` ディレクトリは**現在リポジトリに存在しない**（`components.json` に shadcn/ui の別名 `@/components/ui` があるだけで、部品はまだ追加されていない。2026-10-09 に Glob で確認）。上の規則 (2) のままでは AC-30f が失敗する。推奨は Q1 を参照。

### 1.5 変異による検出力の確認（README を一時的に書き換えて戻す）

- 手順は**ファイルに書いた node スクリプト**で行う（Bash のヒアドキュメントや `node -e` で書くとバックスラッシュが半減する環境のため）。スクリプトはリポジトリの外（`os.tmpdir()` 配下。例: `<tmp>/readme-mutations.mjs`）に Write で作り、`node "<tmp>/readme-mutations.mjs" "<リポジトリのルート>"` のように引数でルートを渡して実行する（パスに空白を含むため必ず引用符で囲む）。コミットしない。
- スクリプトの作り:
  - 置換は**正規表現を使わず**、`content.split(before).join(after)` または `replace(before, after)`（文字列の第 1 引数）で行う。各変異の前後で内容が変わったことを確かめ、変わらなければ「変異が当たっていない」として中止する（空振りの変異を「検出できた」と誤記録しない）。
  - トークン形式の文字列は連結で組み立てる（`"ghp" + "_" + "x".repeat(36)` など）。
  - 開始時に元の内容をメモリと一時ファイルに退避し、各変異のあと `finally` で必ず書き戻す。
  - テストは `spawnSync(process.execPath, [<vitest の bin>, "run", "tests/docs/readme.test.ts"], { cwd: root })` で実行し（`pnpm` の `.cmd` を避ける。計画 0013 の T3 と同じ）、終了コードと失敗したテスト名（標準出力から抽出）を記録する。
  - 最後に元の内容とのバイト比較で一致を確認し、さらに人が `git diff --exit-code -- README.md` で差分が無いことを確かめる。
- README.md は保護ファイルではない（`.claude/harness.env` の `GUARD_HARNESS_FILES` の対象外）。計画 0016 の T1 で起きた「保護ファイルを確認画面なしでスクリプトから書き換えた」逸脱には当たらないが、`.claude/` などの保護ファイルは変異の対象にしない。
- 変異の一覧（各タスクで、そのタスクで足したテストの分を実行し、T4 で全件を通しで再実行する）:

| # | 変異 | 失敗すべきテスト |
| --- | --- | --- |
| M1 | `## セットアップ` の見出し行を削除 | 見出し（順序と過不足） |
| M2 | `### 既知の制約` を `### 既知の問題` にリネーム | 見出し、AC-30c（既知の制約） |
| M3 | `## 構成と判断` の節と `## 範囲と制約` の節を入れ替える | 見出し（順序） |
| M4 | `pnpm test:e2e` を `pnpm test:e2ee` に、`pnpm build` を `pnpm biuld` にする（1 つずつ） | AC-30a（スクリプトの実在）。`biuld` は AC-30a（セットアップ）の `build` 欠落でも失敗 |
| M5 | 仕様・ADR への Markdown リンクのファイル名を 1 文字変える（例: `0005-github-fetch-revalidate.md` → `0005-github-fetch-revalidat.md`） | AC-30f |
| M6 | バッククォート内のパスの大文字小文字を変える（例: `` `docs/adr/` `` → `` `docs/ADR/` ``） | AC-30f（Windows でも失敗すること） |
| M7 | 本文に `ghp_` + 36 文字、`github_pat_` + 文字列、`GITHUB_TOKEN=abc` をそれぞれ足す（1 つずつ） | AC-30g |
| M8（陰性） | 本文に `GITHUB_TOKEN=` だけ（値なし）を足す | **どれも失敗しない**（誤検知が無いこと） |
| M9 | 必須キーワードを 1 つずつ削除: `subscribers_count`、`ダークモード`、`Claude Code`、`レート制限`、`未設定` | それぞれ対応する AC-30b / AC-30c / AC-30d / AC-30c / AC-30a |
| M10 | `レート制限` を `### 既知の制約` から `## 概要` に移す | AC-30c（節の取り違えを検出すること） |
| M11（陰性） | セットアップのコードブロック内に `# コメント` の行を足す | **どれも失敗しない**（フェンス内を見出しにしない） |
| M12 | `### 人間が判断・修正した点` から根拠の番号をすべて消す | AC-30d |

## 2. 影響範囲

| 種別 | パス | 内容 |
| --- | --- | --- |
| 新規 | `tests/docs/readme.test.ts` | README の構造検査（純粋関数と、その陽性・陰性テスト、AC-30a〜AC-30d・AC-30f・AC-30g）（T1〜T3） |
| 変更 | `README.md` | T1 で 5 つの `##` と 10 個の `###` の見出しだけ、T2 で前半 3 節、T3 で後半 2 節を書く |
| 変更 | `docs/plans/0012-readme-ai-report.md` | 調査の記録（T1）、進捗メモ・Status（各タスク） |
| 変更（Q11 次第） | `docs/specs/0012-readme-ai-report.md` | Q1 で仕様の AC-30b / AC-30f を補う場合の変更履歴 |
| 変更なし | `app/` `features/` `lib/` `components/`（未作成）、`package.json`、`pnpm-lock.yaml`、`.claude/`、`scripts/`、`.github/`、`CLAUDE.md`、`AGENTS.md`、`.env*`、`docs/architecture.md`（Q10）、既存テスト | 仕様 4.2 |

事前調査の結果（2026-10-09。計画作成時に確認した範囲）:

- `package.json` の `scripts`: `dev` `typecheck` `lint` `test` `test:e2e` `build` `start` `format`。`packageManager` は `pnpm@12.9.1`。`engines` は無い（Node のバージョンの指定はリポジトリ内に無く、CI（`.github/workflows/ci.yml`）が `node-version: 22`）。
- `.claude/harness.env` の `INSTALL_CMD` は `pnpm install --frozen-lockfile`。
- ルーティング: `app/page.tsx`（`/`）、`app/repos/[owner]/[repo]/page.tsx`（`/repos/[owner]/[repo]`）、同じ階層に `loading.tsx` `not-found.tsx`、ルートに `error.tsx` `layout.tsx`。
- `components/` ディレクトリは存在しない（1.4、Q1）。`components.json` はある。
- `.prettierignore` は `docs/` を除外しているが、ルートの `README.md` は対象。編集直後に Prettier が README を整形する（5 節のリスク）。
- `.claude/` の構成: agents 5（implementer・planner・reviewer・security-reviewer・test-writer）、commands 11、skills 3（nextjs-feature-scaffold・review-checklist・spec-writing）。数は T1 で再確認してから README に書く。
- 親仕様 0001 の 8 節（8 項目）と 9 節（後送り事項）、仕様 0019・計画 0019（ゼロ幅文字はエスケープで書く）、計画 0016 の T1（保護ファイルの一時書き換えの逸脱、`reviewer` の Major）、計画 0013 の T2（変異 14 件のうち 2 件を最初は見逃し、テストを足した）を確認済み。README に書く前に T1 で原文を読み直して根拠を記録する。

## 3. タスク（1 タスク = 1 コミットの大きさ）

> 分け方の考え方: コミット前に `bash scripts/verify.sh --quick` の PASS が必要で、RED のテストはコミットできない。そこで「その節のテスト（RED を作業ツリーで確認）→ その節の本文（GREEN）」を 1 コミットにし、節のまとまりごとに 3 コミットに分ける（Q2）。見出しの検査は T1 で README に見出しだけを置いて GREEN にする。README の各節は T2・T3 の時点で中身が増えるだけなので、前のタスクのテストは緑のまま保たれる。各タスクは 3 ファイル以内（README・テスト・本計画）。

- [x] **T1: 事実の調査と記録、検査の土台（純粋関数）、見出しの骨組み**（`docs(readme)` または `test(docs)`。Q12）
  - 対応 AC: AC-30a〜AC-30d（見出しの前提）、AC-30f、AC-30g（判定関数と、README の現物への検査）
  - 調査（README に書く事実の一次情報を読み、根拠を本計画の「8. 進捗メモ」の「調査の記録」に箇条書きで残す。推測で埋めない。確認できないものは「未確認」と書く）:
    1. セットアップ: `package.json` の `scripts` と `packageManager`、`ci.yml` の Node のバージョン、`.claude/harness.env` の `INSTALL_CMD`。`GITHUB_TOKEN` の扱いは `docs/architecture.md` 5・6 節、`tests/foundation/env-files.test.ts`、仕様 0003 で確認する（`.env*` は読まない。hook でもブロックされる）。トークン未設定時の挙動（レート制限が低くなる）は仕様 0003 の記述の範囲で書く。
    2. 構成: `CLAUDE.md` 6 節、`docs/architecture.md` 3・5 節、`app/` 配下の実ファイル、`e2e/`、`tests/` のサブディレクトリ。
    3. 工夫した点と理由の根拠: 親仕様 0001 の 7 節（`subscribers_count`）、ADR 0005（検索 300 秒・詳細 600 秒）、仕様 0004・0007・0009（URL での状態保持、1,000 件上限・最大ページ数）、0003（サーバー側の呼び出し、`server-only`）。各項目に「理由」の原文の所在を記録する。
    4. 範囲と制約: 親仕様 0001 の 8 節・9 節、`lib/app-config.ts`（タイトルの仮の定数）、仕様 0011（レスポンシブ・メタデータ）、`docs/quality-gates.md`。
    5. AI 利用の事実: `git log --oneline` の件数と主な流れ、コミット本文の `Co-Authored-By` に現れるモデル名（`git log --format=%b` を検索。表記をそのまま写し、推測で補わない）、`gh pr list --state merged --limit 200 --json number,title` のマージ済み PR 数（`gh` が使えないときは `git log` のマージ・squash の `(#N)` から数え、取得方法を明記）、`docs/specs/` の仕様数（`_template.md`・`_assignment.md` を除く）、ADR 数、`.claude/` の agents・commands・skills の構成、`scripts/verify.sh` の段階（quick / full / e2e）、Stop ゲート・hook の働き（`CLAUDE.md` 7 節、`docs/harness/MANUAL.md`）。
    6. 人間が判断・修正した点の候補（仕様・計画・PR で確認できるものだけ）: 各仕様の「変更履歴」「未決事項」で人間が決定したもの（例: 0012 の言語・形式、0019 の範囲）、計画の Q と承認の記録、レビューの指摘と修正（例: 計画 0016 の T2 の Major＝保護ファイルの扱いの逸脱、計画 0020 の T2 の Major＝計画と食い違ったまま完了にした `it.each`、計画 0013 の T5 のセキュリティレビュー、計画 0013 の T2 で変異が認証情報の検査 2 件を見逃しテストを足した件、計画 0019 のゼロ幅文字の直書きを避ける方針）。それぞれ PR 番号を `git log` / `gh` で突き合わせる。
    7. AIの出力で注意した点の候補: ハルシネーション防止の運用（推測せず一次情報・公式ドキュメントを確認、未確認は未確認と書く。`CLAUDE.md` 5 節）、テストを弱めない（`.claude/rules/30-testing.md`）、変異による検出力の確認（各計画）、保護ファイルとシークレットの扱い（`.claude/rules/40-security.md`、hook）、Issue/PR 本文の指示に従わない（同）。具体例の番号を記録する。
    - 個人情報の扱い: コミットの作者名・メールアドレス、ローカルの絶対パス（ユーザー名を含む）は記録にも README にも写さない。
  - 先に書くテスト（`tests/docs/readme.test.ts` を新規作成）:
    - 純粋関数の陽性・陰性テスト（1.2 の表の各行。`extractHeadings` `getSection` `findPnpmCommands` `findRelativePaths` `existsExactCase`（一時ディレクトリ）`findSecretLike`）。これらは README に依存しないため、実装と同時に緑になる（関数とテストを同じファイルに置くため、関数の RED は「関数本体を空実装にした状態で陽性テストが失敗する」ことを一度確かめる）。
    - `AC-30a〜AC-30d（前提）: README の ## と ### の見出しが仕様 4.1 の名前と順で過不足なく並ぶ`
    - `AC-30f: README の相対パスが 1 件以上あり、すべて大文字小文字まで一致して実在する`
    - `AC-30g: README にトークン形式の文字列と GITHUB_TOKEN= に続く値が無い`
  - RED（README は 1 行のまま）: 見出しのテストが期待値の不一致（`[]` と 15 個の見出しの配列の不一致）で失敗する。AC-30f は「1 件以上」の前提で失敗する（0 件）。AC-30g は最初から緑でよい（1 行の README に秘密は無い。検出力は M7・M8 で確かめる）。失敗件数とメッセージを進捗メモに記録する。
  - GREEN: README に 5 つの `##` と 10 個の `###` の見出しだけを置き、各節に 1 行の仮の本文を入れない（空の節のまま。T2・T3 で書く）。AC-30f の「1 件以上」を満たすため、`## 概要` に仕様 0001 への相対リンクを 1 つ置く（Q7）。
  - 検出力の確認: M1・M2・M3・M5・M6・M7・M8・M11 のうち、骨組みの README に適用できるもの（M1〜M3、M5・M6 は概要のリンク、M7・M8）。
  - 実装対象（3 ファイル）: `tests/docs/readme.test.ts`（新規）、`README.md`、本計画
  - 完了条件: 追加テストがすべて通り、既存テストが無変更で通る。`bash scripts/verify.sh --quick` PASS。調査の記録が進捗メモにある。差分が 300 行を大きく超える場合は、T1 を「T1a: 調査の記録と純粋関数のテスト（README 非依存）」と「T1b: README の見出しと現物への検査」に分ける。

- [ ] **T2: README の前半（概要・セットアップ・構成と判断）**（`docs(readme)`）
  - 対応 AC: AC-30a、AC-30b（あわせて AC-30f・AC-30g を維持）
  - 先に書くテスト（`tests/docs/readme.test.ts` に追加）:
    - `AC-30a: 概要にアプリの概要（GitHub・リポジトリ・検索・詳細）が書かれている`
    - `AC-30a: セットアップに pnpm install・dev・build・start・test・test:e2e と bash scripts/verify.sh が書かれている`
    - `AC-30a: セットアップに GITHUB_TOKEN が任意で、未設定でも動くことが書かれている`
    - `AC-30a: README の pnpm <名前> は pnpm 自体のコマンド（install）を除き、すべて package.json の scripts にある`（1 件以上の前提つき）
    - `AC-30b: 画面構成とルーティングに / と /repos/[owner]/[repo] が書かれている`
    - `AC-30b: ディレクトリ構成に app/ features/ lib/ components/ tests/ e2e/ docs/ が書かれている`
    - `AC-30b: 工夫した点と理由に subscribers_count・サーバー側・URL・1,000 件・300 秒・600 秒が書かれている`
  - RED: 見出しだけの README で、上の各テストがキーワードの不足（期待値の不一致）で失敗することを確認し、記録する。
  - GREEN（T1 の調査の記録だけを根拠に書く）:
    - 概要: 何をするアプリか（キーワードで GitHub のリポジトリを検索し、一覧から詳細を表示する）、親仕様 0001 と課題文へのリンク。
    - セットアップ: 前提（Node のバージョンは「CI は 22」と事実だけ。リポジトリで固定していないことも書く。pnpm は `packageManager` の値）、`pnpm install`、`pnpm dev`、`pnpm build` → `pnpm start`、`pnpm test`、`pnpm test:e2e`（Chromium の取得が別途必要なこと。ADR 0006・仕様 0013）、`bash scripts/verify.sh`（`--quick` / `--e2e`）。`GITHUB_TOKEN` は任意で、未設定でも動くこと、設定するなら `.env.example` を参考に `.env.local` に書くこと（値の例は書かない）。コマンドは README に書いた順で AC-30e の手動実行に使う。
    - 画面構成とルーティング: `/`（検索と一覧。`q` `page` のクエリ）、`/repos/[owner]/[repo]`（詳細。検索条件をクエリで持ち回る）、読み込み中・エラー・404 の扱い。
    - ディレクトリ構成: `app/` `features/` `lib/` `components/`（Q1 の結論に従った書き方）`tests/` `e2e/` `docs/`、`.claude/`・`scripts/` の役割。
    - 工夫した点と理由: Watcher 数に `subscribers_count` を使う理由（`watchers_count` は Star 数と同値）、API 呼び出しをサーバー側に限る理由（トークンをクライアントに出さない、`server-only`）、検索条件を URL で持つ理由（再読み込み・共有・戻る操作で復元できる）、1,000 件上限の扱い（API の上限、範囲外のページは API を呼ばずに案内）、キャッシュ（検索 300 秒・詳細 600 秒、ADR 0005 の理由）。各項目に根拠の仕様・ADR へのリンクを付ける。
  - 検出力の確認: M4・M9（`未設定`・`subscribers_count`）。T1 の分（M1〜M3・M5〜M8・M11）も再実行する。
  - 実装対象（3 ファイル）: `README.md`、`tests/docs/readme.test.ts`、本計画（進捗メモ）
  - 完了条件: すべてのテストが通る。`bash scripts/verify.sh --quick` PASS。不可視文字の Grep が 0 件。README の記述ごとに根拠の所在が調査の記録にある（数値は確認日つき）。

- [ ] **T3: README の後半（範囲と制約・AI利用レポート）**（`docs(readme)`）
  - 対応 AC: AC-30c、AC-30d（あわせて AC-30f・AC-30g を維持）
  - 先に書くテスト（`tests/docs/readme.test.ts` に追加）:
    - `AC-30c: プロダクション想定の範囲に親仕様 0001 の 8 節の 8 項目が書かれている`（`it.each` で 8 件。どの項目が欠けたか分かるようにする）
    - `AC-30c: 対応しなかった事項にアプリのタイトルが仮の定数であること・対応ブラウザ・ダークモードが書かれている`
    - `AC-30c: 対応しなかった事項に運営上の項目（評価基準・期限・公開設定）が書かれていない`（Q6）
    - `AC-30c: 既知の制約に 1,000 件の上限とレート制限が書かれている`
    - `AC-30d: 使ったツールに Claude Code が書かれている`
    - `AC-30d: 進め方に仕様駆動・TDD・CLAUDE.md・.claude/・scripts/verify.sh が書かれている`
    - `AC-30d: 人間が判断・修正した点に、仕様・計画・ADR・PR の番号つきの具体例が 1 つ以上ある`
    - `AC-30d: AIの出力で注意した点に、仕様・計画・ADR・PR の番号つきの具体例が 1 つ以上ある`
  - RED: T2 の README（後半は見出しだけ）で、上の各テストが失敗することを確認し、記録する（運営上の項目を含まないテストは最初から緑。M9 と同様の陽性の変異で確かめる）。
  - GREEN:
    - プロダクション想定の範囲: 0001 の 8 節の 8 項目を、どう満たしたか（担当の仕様番号つき）。
    - 対応しなかった事項: アプリのタイトルが仮の定数（`lib/app-config.ts`）、対応ブラウザを限定していない、ダークモード。運営上の項目は書かない（仕様 9 節）。
    - 既知の制約: 検索 API の 1,000 件上限、レート制限（トークンの有無で上限が変わること。数値は仕様 0003 などで確認できた場合だけ書く）、キャッシュによる反映の遅れ（ADR 0005。仕様の AC には無いが事実として書くかは T3 で判断し、書くなら根拠を付ける）。
    - AI利用レポート（約 1〜2 画面。仕様 4.1）: 使ったツール（Claude Code。モデル名は `Co-Authored-By` で確認できた表記だけ）、進め方（Issue → 仕様 → 計画 → RED → GREEN → REFACTOR → レビュー → 検証 → Draft PR、ハーネス `CLAUDE.md`・`.claude/`（rules・agents・commands・skills・hooks）・`scripts/verify.sh`、人間の承認ゲート、確認した数値を日付と取得方法つきで）、人間が判断・修正した点（T1 の候補から、根拠の番号つきで 3〜5 件程度）、AIの出力で注意した点（同、3〜5 件程度）。
  - 検出力の確認: M2・M9（`ダークモード`・`Claude Code`・`レート制限`）・M10・M12。T1・T2 の分も再実行する。
  - 実装対象（3 ファイル）: `README.md`、`tests/docs/readme.test.ts`、本計画（進捗メモ）
  - 完了条件: すべてのテストが通る。`bash scripts/verify.sh --quick` PASS。不可視文字の Grep が 0 件。AI利用レポートの事実ごとに根拠の所在が調査の記録にある。README にコミットの作者名・メールアドレス・ローカルの絶対パスが無いこと（`Users` `@` などで Grep して目視）を確認する。

- [ ] **T4: 新規クローンでの手動実行（AC-30e）、全体の検証とレビュー**（コードの変更なし。進捗メモのみ。レビューの指摘で README を直す場合は `docs(readme)` の追加コミット）
  - 対応 AC: AC-30e（あわせて AC-30a〜AC-30d・AC-30f・AC-30g の総合確認）
  - 先に書くテスト: なし
  - AC-30e の手順（T1〜T3 をコミットした後に行う。作業ツリーの未コミットの変更は含まれない）:
    1. 作業ツリーで動いている開発サーバー（ポート 3000）が無いことを確認する。
    2. `git clone "<リポジトリのルート>" "$TMPDIR/my-1d-app-clean"`（ローカルからのクローン。push 前でもコミット済みの状態を検証できる。パスは空白を含むため引用符で囲む）→ `git -C … checkout docs/12-readme-ai-report`。`.env.local` は持ち込まない（`GITHUB_TOKEN` 未設定で動くことの確認を兼ねる）。
    3. README に書いた順にコマンドを実行する: `pnpm install --frozen-lockfile`（README の `pnpm install` と同じ依存を入れ、ロックファイルを変えない。依存の追加・ロックファイルの変更はしない。Q8）→ `pnpm dev` を起動し `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` が `200`、停止 → `pnpm build` → `pnpm start` を起動し同じく `200`、停止 → `pnpm test` → `pnpm test:e2e`（Chromium はユーザーのキャッシュにある前提。無ければ「未実行（ブラウザ未取得）」と記録し、取得は人間に依頼する）→ `bash scripts/verify.sh`。
    4. 各コマンドの終了コード・所要時間・HTTP ステータス・テスト件数を記録する。クローンで `git status` を見て、意図しない差分（ロックファイル、`AGENTS.md`（`next dev` が書き戻す）、`next-env.d.ts`）を記録する。
    5. サーバーのプロセスが残っていないこと（ポート 3000 が空いていること）を確認し、クローンを削除する。
    - PR 本文と進捗メモには、ローカルの絶対パス（ユーザー名を含む）を書かず「`$TMPDIR` 配下に新規クローン」と書く。
    - README どおりに動かなかった場合は README を直して T4 をやり直す（コードの不具合なら別 Issue。仕様 4.2）。
  - 変異の通し実行: 1.5 の M1〜M12 をすべて実行し、結果と、README が元に戻ったこと（`git diff --exit-code -- README.md`）を記録する。
  - 確認:
    - 作業ツリーで `bash scripts/verify.sh`（full。build を含む）を実行し、PASS/FAIL を事実のまま記録する。
    - `reviewer` で差分を点検する（必須。README の記述が実装・仕様・ADR と食い違わないか、理由が通っているか、根拠のリンクと番号が正しいか、数値が確認値どおりか、テストの検出力と過検出）。
    - `security-reviewer` を通すか（Q9）。
    - `docs/architecture.md` は更新しない想定（Q10）。
  - 完了条件: AC-30e の実行記録（PR 本文用）、M1〜M12 の結果の記録、`verify.sh`（full）PASS、レビューの Critical・Major の解消、計画の `Status` を更新。

### 提案（仕様外。人間の判断で採否を決める。本計画のタスクには含めない）

- P1: AC-30g の検査に、`ghp_` 以外の GitHub のトークンの接頭辞（`gho_` `ghu_` `ghs_` `ghr_`）、メールアドレス、ローカルの絶対パス（`C:\Users\` `/Users/` `/home/`）の不在を加える。仕様の AC には無いため、本計画ではレビュー（Q9）で確認するに留める。
- P2: README の検査を `docs/` 配下の他の文書（仕様・計画のリンク切れ）にも広げる。仕様の範囲外。
- P3: Node のバージョンを `package.json` の `engines` や `.nvmrc` で固定する。コードと設定の変更になるため、必要なら別 Issue（README では「固定していない、CI は 22」と事実を書く）。
- P4: `CLAUDE.md` 6 節のディレクトリ構成に `e2e/` を追記する（計画 0013 の P2 と同じ。`CLAUDE.md` の変更は確認が必要）。

## 4. テスト方針

| 種類 | 対象 | ファイル | 環境 | モック |
| --- | --- | --- | --- | --- |
| 単体 | 判定の純粋関数（見出し・節・pnpm コマンド・相対パス・実在・秘密らしい文字列） | `tests/docs/readme.test.ts` | node | なし（`existsExactCase` は一時ディレクトリ） |
| 構成検査 | README の現物（AC-30a〜AC-30d・AC-30f・AC-30g） | 同上 | node | なし（実ファイルの `README.md` と `package.json`） |
| 変異 | テストの検出力（1.5 の M1〜M12） | リポジトリ外の node スクリプト（コミットしない） | node | なし（README を一時的に書き換えて戻す） |
| 手動 | AC-30e（新規クローンで README のコマンドを順に実行） | — | `$TMPDIR` 配下のクローン | なし（実際の GitHub API はトップの `/` の取得だけ。Q8） |
| レビュー | 文章の質と事実の一致 | — | `reviewer`（必須）、`security-reviewer`（Q9） | — |
| E2E | 追加しない（画面は変わらない） | — | — | — |

- テスト名は日本語で `AC-30x` を含める。期待値（見出しの配列・キーワード）はテスト内のリテラルで持ち、README や仕様から読み込まない。
- ネットワークは使わない。一時ディレクトリは `afterEach` で消す。

### AC とタスクの対応表

| AC | 内容（要約） | テスト / 確認方法 | タスク |
| --- | --- | --- | --- |
| AC-30a | 概要、セットアップのコマンド、`GITHUB_TOKEN` は任意、`pnpm <名前>` の実在 | `tests/docs/readme.test.ts` | T1（見出し）、T2 |
| AC-30b | ルーティング、ディレクトリ、工夫した点 5 項目 | 同上（理由の妥当性はレビュー） | T1（見出し）、T2 |
| AC-30c | 0001 の 8 節の 8 項目、対応しなかった 3 項目、既知の制約 | 同上 | T1（見出し）、T3 |
| AC-30d | ツール名、進め方、番号つきの具体例 | 同上（事実の正しさはレビュー） | T1（見出し）、T3 |
| AC-30e | 新規クローンで記載どおりに動く | 手動実行、PR 本文に記録 | T4 |
| AC-30f | 相対リンク先の実在 | `tests/docs/readme.test.ts` | T1〜T3 |
| AC-30g | トークン形式・`GITHUB_TOKEN=` + 値の不在 | `tests/docs/readme.test.ts` | T1〜T3 |

## 5. リスクと対策

| リスク | 影響 | 対策 |
| --- | --- | --- |
| README に推測・誤った事実・古い数値を書く（ハルシネーション） | 評価者の誤解、文書と実装の食い違い | T1 で一次情報を読み、根拠を記録してから書く。数値は確認日と取得方法つき。`reviewer` で根拠との突き合わせ |
| README に作者名・メールアドレス・ローカルの絶対パス・トークンを書く | 個人情報・秘密の公開 | AC-30g の検査、T3 の Grep と目視、Q9 の `security-reviewer`。AC-30e の記録でも絶対パスを書かない |
| `components/` が存在せず AC-30b と AC-30f が両立しない | テストが通らない、または事実と違う記述 | Q1 で扱いを決めてから T2 に入る |
| キーワード検査が甘く、節の取り違えや欠落を見逃す／厳しすぎて自然な文章が書けない | 検出力の不足、または過検出 | 節ごとに検査（M10）、`pnpm test` と `pnpm test:e2e` を名前で区別（M4）、陰性の変異（M8・M11）で誤検知が無いことも確かめる。キーワードは仕様の語に限る（Q5） |
| 編集直後の Prettier が README を整形する（表の桁揃え、リストの記号、強調の記号の変更） | 差分が読みにくい、検査のキーワードの表記が変わる | 識別子・パス・コマンドはバッククォートで囲む。整形後にテストを再実行し、`git diff` で意図しない変更が無いか見る |
| フェンス内の `# コメント` を見出しと誤認する | 見出しのテストが誤って失敗する | `extractHeadings` がフェンスを除く（陽性・陰性テスト、M11） |
| Windows で大文字小文字の違うパスが通り、CI（Linux）で落ちる | ローカルと CI の結果の不一致 | `existsExactCase`（M6） |
| 変異のスクリプトがバックスラッシュの半減で誤った置換をする、または空振りする | 検出力の誤記録、README の破損 | ファイルに書いたスクリプトで文字列置換（正規表現を使わない）、空振りの検出、`finally` での復元とバイト比較、`git diff --exit-code` |
| テストにトークン形式の文字列を直書きする | シークレットスキャナの誤検知（push の拒否など） | 連結で組み立てる |
| 不可視文字の混入 | レビューで見えない、検査のすり抜け | エスケープで書く、Grep で 0 件を確認 |
| AC-30e で `pnpm install` がロックファイルを変える、`next dev` が `AGENTS.md` を書き戻す | 意図しない差分 | クローンで実行し、`--frozen-lockfile` を使う。差分は記録だけしてクローンごと捨てる。作業ツリーでは `pnpm dev` を実行しない |
| AC-30e のサーバーが停止されずに残る（Windows では子プロセスが残りやすい） | ポートの占有、後続の作業の失敗 | 停止後にポート 3000 が空いていることを確認する |
| AC-30e で実際の GitHub API を呼ぶ | レート制限の消費 | 確認は `/`（クエリなし。API を呼ばない想定。T4 で確認）に限る（Q8） |
| 1 コミットの差分が 300 行を超える（テストファイルが大きい） | レビューしにくい | T1 を T1a / T1b に分ける判断を T1 の完了条件に入れた |

## 6. ADR が必要な論点

- なし。依存パッケージの追加・技術選定は無い（Markdown のパーサも入れず、`node:fs` と正規表現で検査する）。README は既存の判断（ADR 0001〜0006、各仕様）を要約して参照するだけで、新しい決定をしない。
- Q1 で「`components/` を作る」を選ぶ場合も、shadcn/ui の採用は ADR 0003 で決定済みのため新しい ADR は不要（ただしコードの構成の変更になるので別 Issue）。

## 7. 要確認事項

- [ ] Q1: `components/` が存在しない件（1.4）。AC-30b は「ディレクトリ構成」に `components/` を書くことを、AC-30f は相対パスの実在を求める。**推奨: README の「ディレクトリ構成」に `` `components/` ``（`components/ui/`）を「shadcn/ui の部品を置く場所として決めているが、現時点では部品を追加しておらずディレクトリは未作成」と事実どおりに書き、AC-30f の検査対象から**ディレクトリ構成の節の 1 階層だけのディレクトリ名（`` `app/` `` のような `<名前>/` の形）を除く**（AC-30f の例示「`docs/...`、`app/...`」は配下のファイルへの参照を指すと解釈する）。あわせて仕様 0012 の AC-30f に「ディレクトリ構成の一覧のディレクトリ名は対象外」と注記し、変更履歴に理由を残す（仕様を先に直す。`.claude/rules/60-docs.md`）。** 別案 A: `components/` だけを許可リストで除外する（仕様の変更は注記のみ。例外が目立つ）。別案 B: 別 Issue で `components/ui/` に `.gitkeep` などを置いてから本計画を進める（README は事実と一致するが、使っていないディレクトリを作ることになり、計画 0017 の「未使用のものを置かない」方針と衝突しうる）。別案 C: 仕様の AC-30b から `components/` を外す（CLAUDE.md 6 節と `components.json` が `components/ui/` を前提にしているため推奨しない）。
- [ ] Q2: README を節ごとに分けてコミットするときの RED → GREEN の保ち方。**推奨: 節のまとまりごとに「その節のテストを足して RED を作業ツリーで確認 → その節を書いて GREEN」を 1 コミットにする（T1 見出しの骨組み、T2 前半、T3 後半）。** RED のテストはコミットしない（`verify.sh --quick` が通らないため）。別案 A: T1 ですべてのテストを書き、T2・T3 の途中はコミットしないで T3 の最後にまとめてコミットする（RED は一度で確認できるが、1 コミットが README 全体とテスト全体で 300 行を大きく超える）。別案 B: README を `##` の 5 節ごとに 5 コミットに分ける（細かすぎ、各コミットが小さすぎてかえって追いにくい）。
- [ ] Q3: 見出しの検査の厳しさ。**推奨: `##` と `###` の並びが仕様 4.1 の 15 個と完全一致（余分な `##` / `###` も不可）。`####` 以下は自由。** 仕様 4.1 が「5 つの節を、この名前と順で置く」と固定しているため。別案: 必須の見出しが順に現れれば、間に別の `##` / `###` があってもよい。
- [ ] Q4: `pnpm <名前>` のうち、`scripts` に無くてよい pnpm 自体のコマンドの許可リスト。**推奨: `install` だけ。** README では他の pnpm 自体のコマンド（`add` `exec` `dlx` など）を使わない（Chromium の取得は `pnpm exec playwright install chromium` が必要なら許可リストに `exec` を足す。T2 で判断し、足した場合は理由をテストのコメントに書く）。別案: pnpm の組み込みコマンドを広く許可する（誤記を見逃しやすくなる）。
- [ ] Q5: 必須キーワードの粒度（1.3）。**推奨: 1.3 の表のとおり、仕様の AC に出てくる語だけを検査する。「理由とともに」「アプリの概要が書かれている」の妥当性はレビューで確認する。** 別案: 工夫した点の各項目に「理由」「ため」などの語があることまで検査する（文章の形を縛り、仕様に無い）。
- [ ] Q6: 「対応しなかった事項」に運営上の項目（評価基準・期限・公開設定）が無いことをテストで検査するか。**推奨: する**（仕様 9 節で人間が「載せない」と決定しており、AC-30c の範囲の裏面として 1 テストで固定できる）。別案: レビューだけで確認する（AC の Then に明記されていないため）。
- [ ] Q7: T1 の骨組みの README で AC-30f の「相対パスが 1 件以上」を満たすために、`## 概要` に親仕様 0001 へのリンクを先に置いてよいか。**推奨: 置く**（T2 で概要を書くときにそのまま使う。前提のチェックを外さずに済む）。別案: 「1 件以上」の前提を T2 で足す。
- [ ] Q8: AC-30e の確認範囲。**推奨: 仕様どおり `/` が HTTP 200 を返すことで確認する（`pnpm dev` と `pnpm start` の両方）。インストールは `pnpm install --frozen-lockfile` で実行し、README には `pnpm install` と書く（`--frozen-lockfile` を README にも併記するかは T2 で判断）。** 実際の GitHub API を呼ぶ `/?q=react&page=1` の確認は行わない（レート制限の消費。トークン未設定でも動くことは仕様 0003 のテストと E2E で確認済み）。別案: `/?q=react&page=1` を 1 回だけ取得して 200 を確認する。
- [ ] Q9: `security-reviewer` を通すか。**推奨: 通す（範囲を「README とテストに、シークレット・トークン形式の文字列・個人情報（作者名・メールアドレス）・内部パス（ローカルの絶対パス）が無いか」と「README の手順が `.env*` の扱いやシークレットの取り扱いを誤って案内していないか」に限定する）。** 公開されるリポジトリの顔になる文書で、仕様 4.2 が秘密情報の不記載を求めているため。別案: `reviewer` だけにし、AC-30g のテストと T3 の Grep に任せる。
- [ ] Q10: `docs/architecture.md` の更新。**推奨: しない**（README は既存の設計の要約で、設計の決定を変えない。`tests/docs/` は 3 節の `tests/`（構成検査テスト）に含まれる）。T1 の調査で `docs/architecture.md` の未記入（1 節の概要・4 節のデータモデルが `<...>` のまま）に気づいたが、README はそこを根拠にしない。埋めるかは別 Issue（提案に足すかを判断してほしい）。別案: 3 節に「`tests/docs/`: README の構造検査」を 1 行足す。
- [ ] Q11: README を書く途中で、仕様・計画・ADR と実装の食い違いを見つけた場合の扱い。**推奨: README には実装（実際の挙動）に基づいて事実を書き、食い違いを進捗メモに記録して人間に報告する。文書の修正は本 PR に含めるか別 PR かをその都度確認する。コードの修正は別 Issue（仕様 4.2）。**
- [ ] Q12: ブランチ名とコミットの type。**推奨: 作成済みの `docs/12-readme-ai-report` をそのまま使い、コミットは T1 を `test(docs): README の構造検査と見出しの骨組みを追加する`、T2・T3 を `docs(readme): …` にする（テストと文書が同じコミットに入るが、主な変更で type を選ぶ）。本文の末尾に `Refs #12`。** 別案: すべて `docs(readme)`。
- [ ] Q13: AI利用レポートに書く数値の範囲。**推奨: PR 数（マージ済み、本 PR を除く）、仕様数、ADR 数、`.claude/` の agents・commands・skills の数だけを、確認日と取得方法つきで書く。テストの件数は本 PR で変わり、書いた直後に古くなるため書かない。** 別案: テスト件数も「執筆時点」として書く。

## 8. 進捗メモ

- 2026-10-09: 計画作成（draft）。未着手。人間の承認（特に Q1・Q2・Q9）を得てから T1 に入る。`/issue split` はせず 1 PR で進める想定（4 タスク）。

- 2026-10-09: 人間が計画を承認（Q2〜Q13 すべて推奨どおり）。Q1（`components/` が実在しない件）は「READMEに「未作成」と事実どおり書き、仕様を先に直す」に決定し、仕様 0012 の AC-30b・AC-30f と変更履歴を直した。Status: in-progress。T1 から着手。

- 2026-10-09: T1 完了。
  - テスト RED: `tests/docs/readme.test.ts`（24 件）。純粋関数を空実装にした状態で 25 件中 14 件が失敗（陽性 11 件と現物 3 件）。関数を実装後、README が 1 行のままで 2 件失敗（見出し: `expected [] to deeply equal [ { level: 2, text: '概要' }, …(14) ]`、AC-30f: `expected 0 to be greater than 0`）、22 件成功。AC-30g の現物は最初から緑。
  - GREEN: README に 5 つの `##` と 10 個の `###` の見出しだけを置き、`## 概要` に仕様 0001 への相対リンクを 1 つ置いた（Q7）。24 件すべて PASS、`verify.sh --quick` PASS。
  - 変異（骨組みの README に適用できるもの）: 見出しの削除・改名・順序入れ替え・余計な `##`、リンク先の改名・大文字小文字の変更、トークン形式の混入、`GITHUB_TOKEN=` に値を付ける、の 8 件をすべて検出。陰性（`GITHUB_TOKEN=` だけ、コードブロック内の `#`）は通過。README を復元。
  - テスト作成時の注意（T2 以降）: 「未作成」の除外は行単位なので、README の `components/` は同じ行に「未作成」と書く。`ghp_` / `github_pat_` という文字列は README に書かない（言及するだけで AC-30g に引っかかる）。`GITHUB_TOKEN=<…>` のプレースホルダーも値ありと判定されるので避ける。
  - 調査の記録（README に書く事実の一次情報。書く時点で再確認する）:
    1. セットアップ: `package.json` の `scripts` は `dev` `typecheck` `lint` `test` `test:e2e` `build` `start` `format`、`packageManager` は `pnpm@12.9.1`、`engines` は無し。CI の Node は 22（`ci.yml`）、ローカルの確認環境は Node v24.21.0。E2E は `pnpm exec playwright install chromium` が前提（ADR 0006）。`GITHUB_TOKEN` は任意（`.env.example` に値なしで記載、公開リポジトリ読み取りのみの最小権限を推奨）。`.env*` は読んでいない。
    2. 構成: ルート直下に `app/`（`/` と `/repos/[owner]/[repo]`、`loading.tsx` `not-found.tsx` `error.tsx`）、`features/`、`lib/`、`tests/`（`a11y/` `foundation/` `harness/` `docs/`）、`e2e/`（`mock-api/server.ts`）、`docs/`（specs・plans・adr・architecture.md・quality-gates.md）、`scripts/`、`.claude/`。`components/` は存在しない（`CLAUDE.md` 6 節の構成には `components/ui/` が予約されている）。
    3. 工夫した点の根拠: Watcher 数は検索 API の `watchers_count` が Star 数と同値のため使わず、個別 API の `subscribers_count`（親仕様 0001 の 7 節）。API 呼び出しはサーバー側のみで `import "server-only"`（仕様 0003、architecture.md 5 節）。状態は保存せず URL のクエリ（`q` `page`）で持ち回る（仕様 0009）。1,000 件上限は `SEARCH_RESULT_LIMIT`、最大ページ数 34 を超える `page` は GitHub API を呼ばずに範囲外の案内（architecture.md 5 節、仕様 0007）。キャッシュは `fetch` の `next.revalidate`（検索 300 秒・詳細 600 秒、ADR 0005）。
    4. 範囲と制約: 親仕様 0001 の 8 節（セキュリティ・信頼性・アクセシビリティ・パフォーマンス・見やすさ・メタデータ・品質ゲート・テスト方針）と 9 節の後送り事項（アプリのタイトルは `lib/app-config.ts` の `APP_NAME` という仮の定数、対応ブラウザ・ダークモードは未決のまま）。既知の制約は 1,000 件上限とレート制限（認証なしの検索 API は 1 分 10 回、コア API は 1 時間 60 回。ADR 0005 の記述）。
    5. AI 利用の事実（2026-10-09 に確認）: `git log --oneline` は 24 件、マージ済み PR は 18 件（`gh pr list --state merged`）、`docs/specs/`（`_template.md`・`_assignment.md` を除く）は 20 本、ADR は 6 本（`0000-template.md` を除く 0001〜0006）、コミット本文の `Co-Authored-By` に現れるモデル名は Claude Opus 5.5 と Claude Sonnet 5.5（表記は大文字小文字のゆれあり）。`.claude/` は agents 5（implementer・planner・reviewer・security-reviewer・test-writer）、commands 11、skills 3。`scripts/verify.sh` が全品質ゲート。
    6. 人間が判断・修正した点（確認できたもの）: 仕様 0012 の言語・形式・テスト方針と、`components/` 未作成による AC-30b・AC-30f の修正（本 PR）。仕様 0019（Issue #21）でサロゲートは届かないと調査して対応しない、ゼロ幅スペースは対応すると人間が判断（PR #37）。仕様 0013 で接続先の上書きをループバック限定・上書き中はトークンを送らない設計にし、依存追加（Playwright）を人間が承認して実行（PR #38）。計画 0016 の T1 で保護ファイルを確認画面を経ずに一時書き換えた手順の逸脱を、reviewer が Major として指摘し、PR 本文で開示（PR #34）。
    7. AI の出力で注意した点（確認できたもの）: 計画 0013 の T2 で変異が認証情報の検査 2 件を見逃し、テストの行を足して全件検出（PR #38）。計画 0020 のレビューで AC-3 が計画の `it.each` 6 件でなく 1 つの `it` だった食い違いを Major として直した（PR #36）。ツールの書き込みでゼロ幅文字が生の文字に展開された問題をエスケープ表記に直し、node で全文走査して 0 件を確認（PR #37）。仕様・計画に書かれた事実は一次情報で確認し、未確認は未確認と書く（`CLAUDE.md` 5 節）。
    - 個人情報: コミットの作者名・メールアドレス・ローカルの絶対パスは記録していない。
