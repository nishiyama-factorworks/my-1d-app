# 0016: ルールとスキルの `src/` 表記をルート直下構成に合わせる

- Status: approved
- 作成日: 2026-10-08
- Issue: #16
- 関連: `0002-setup-foundation.md`（ルート直下構成を決めた仕様）、依存: 0002

## 1. 背景と目的

仕様 0002 でルート直下構成（`src/` なし）に決めたが、`.claude/` の次の 3 ファイルに `src/` 付きの表記が残っている。ルールとスキルの記述と実態を揃える。PR #14 の提案 P2。

- `.claude/rules/10-nextjs.md`: `paths`（3、5、8 行目）と本文（27 行目）。`paths` はこのルールを読み込む対象のファイルを決める設定なので、`src/` のままでは `features/` のファイルでルールが読み込まれない。4 行目にすでに `app/**/*.{ts,tsx}` があるため、3 行目だけを直すと重複する。
- `.claude/skills/nextjs-feature-scaffold/SKILL.md`: 構成図の `src/features/<feature>/` と `src/app/<route>/`（13、20 行目）。新機能を追加するときの標準構成として、誤った場所を示している。
- `.claude/skills/spec-writing/SKILL.md`: 手順 2 の「`src/` に再利用できる実装がないか」（13 行目）。

あわせて、Next.js 16 で `middleware.ts` が `proxy.ts` に改名された（`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`）ことを、`paths` に反映する。

## 2. 対象ユーザーと前提

- 開発者と Claude（ルールは `paths` に一致するファイルを読み書きするときに読み込まれる。スキルは該当する作業のときに読み込まれる）。
- `.claude/` は保護ファイルで、編集時に確認が出る。

## 3. ユーザーストーリー

- 開発者として、ルールとスキルが実際のディレクトリ構成を指すようにしたい。それはルールが正しく読み込まれ、Claude が新機能を正しい場所に作るようにするためである。

## 4. 範囲

### 4.1 やること

- `.claude/rules/10-nextjs.md` の `paths` を、実際の構成に合わせて次の 5 つにする（重複を除く）: `app/**/*.{ts,tsx}`、`features/**/*.{ts,tsx}`、`next.config.*`、`middleware.ts`、`proxy.ts`。本文 27 行目の `src/features/<名前>/` を `features/<名前>/` に直す。
- `.claude/skills/nextjs-feature-scaffold/SKILL.md` の `src/features/<feature>/` を `features/<feature>/` に、`src/app/<route>/` を `app/<route>/` に直す。
- `.claude/skills/spec-writing/SKILL.md` の「`src/` に再利用できる実装」を、実際の構成（`app/` `features/` `lib/`）に直す。
- 上記が保たれることを検査する構成検査テスト（`tests/harness/`）の追加。
- Issue #16 のタイトルと本文を、範囲に合わせて直す。

### 4.2 やらないこと（Non-goals）

- ルール・スキルの、パスの表記以外の内容変更（ガードレールを緩める変更を含めない）
- `CLAUDE.md` 73 行目の「`src/` は使わず、ルート直下に置く」という説明（正しい記述なので変えない）
- `.claude/harness.env` の `SRC_REGEX` など、ハーネスの設定の変更
- `lib/**` や `components/**` などへの、ルールの適用範囲の拡大

## 5. 受け入れ条件（テストに直訳できる粒度で）

| ID   | Given | When | Then |
| ---- | ----- | ---- | ---- |
| AC-1 | `.claude/rules/*.md` と `.claude/skills/**/SKILL.md` | パスとしての `src/`（行頭、または空白・引用符・バッククォート・括弧の直後の `src/`）を検索する | 1 件も見つからない。見つかれば、ファイルと行番号を失敗メッセージに出す |
| AC-2 | `.claude/rules/10-nextjs.md` のフロントマターの `paths` | 指定されたパターンを確認する | `app/**/*.{ts,tsx}`、`features/**/*.{ts,tsx}`、`next.config.*`、`middleware.ts`、`proxy.ts` の 5 つがちょうど指定されていて、重複が無い |
| AC-3 | `.claude/rules/10-nextjs.md` の本文 | `page.tsx` のロジックの置き場所の記述を確認する | 「`features/<名前>/` に置く」と書かれている |
| AC-4 | `paths` の `app/` と `features/` | 実際のディレクトリを確認する | どちらもリポジトリのルート直下に実在し、`src/` ディレクトリは存在しない |

## 6. 画面・API の契約

該当なし。

## 7. データ

該当なし。

## 8. 非機能要件

- 保護ファイル（`.claude/`）の編集は確認が出る。変更はパスの表記だけで、ルールの内容（禁止事項・手順）は変えない。変更前後の差分で確認する。
- `paths` のパターンが実在するファイルに一致するかの検査は、`app/` と `features/` が実在すること（AC-4）までとする。`middleware.ts` と `proxy.ts` は現在プロジェクトに存在しない（将来作ったときにルールが読み込まれるための指定）。

## 9. 未決事項

- なし（2026-10-09: 範囲をスキル 2 つに広げる、`proxy.ts` を足す、構成検査テストを足す、を人間が決定）

## 10. 変更履歴

| 日付       | 変更                                 | 理由                                      |
| ---------- | ------------------------------------ | ----------------------------------------- |
| 2026-10-08 | 下書きを作成（仕様番号 0016 を付与） | Ready の判定の対象にするため（Issue #25） |
| 2026-10-09 | 範囲を `10-nextjs.md` からスキル 2 つ（`nextjs-feature-scaffold`、`spec-writing`）に広げ、`paths` に `proxy.ts` を足し、重複を除く（`app/**` が 4 行目に既にある）ことを明記。AC を確定（AC-1 `src/` が無い、AC-2 `paths` の 5 つ、AC-3 本文、AC-4 実在）し、構成検査テストの追加と Issue のタイトル・本文の修正を 4.1 に追記。Non-goals に `CLAUDE.md` の説明と `harness.env` を変えないことを明記 | `/feature 16` の仕様確認で、同じ `src/` 表記が 3 ファイルに残っていることと、Next.js 16 で `middleware` が `proxy` に改名されたことが分かり、人間が決定 |
