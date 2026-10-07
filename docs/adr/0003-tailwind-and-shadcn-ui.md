# 0003: CSS 手法とUIライブラリに Tailwind CSS v4 + shadcn/ui を採用する

- Status: Accepted
- 日付: 2026-10-07
- 決定者: 人間（プロジェクト担当者。Issue #2 の `/feature` 中に回答）

## 背景

仕様 `docs/specs/0002-setup-foundation.md` の未決事項として、コンポーネントライブラリと CSS 手法の選定があった。以降のタスク（検索フォーム・結果一覧・詳細ページなど）が同じ UI 基盤に載るため、最初に決める必要がある。Tailwind CSS v4 は Create Next App で導入済み。ディレクトリ構成は `src/` を使わずルート直下（`app/` `features/` `components/ui/` `lib/`）とする。

## 検討した選択肢

### 案A: Tailwind CSS のみ

- メリット: 依存が増えない。構成が最も単純。
- デメリット: フォーム・ボタン等の UI 部品とアクセシビリティ対応を自前で書く。

### 案B: Tailwind CSS + shadcn/ui

- メリット: 部品のコードをリポジトリ内に持つので改変しやすい。アクセシビリティに配慮した部品を使える。`components/ui/` と相性がよい。
- デメリット: 部品を追加するたびに依存（Radix 系、`class-variance-authority`、`lucide-react` 等）が増える。依存追加は人間の承認が必要。

### 案C: CSS Modules

- メリット: 追加依存なし。
- デメリット: Tailwind を外す設定変更が必要。部品の用意は自前。

## 決定

Tailwind CSS v4 + shadcn/ui を採用する（案B）。本タスク（0002）では shadcn/ui の初期化（`components.json` と `lib/utils.ts` の `cn`）までを行い、個別コンポーネントは必要になったタスクで追加する。

## 理由

- 人間が 2026-10-07 に案B を選択した。
- 検索フォーム・一覧・ページネーションなど、以降のタスクで UI 部品が複数必要になる見込みがある。
- shadcn/ui の最新の導入手順（Tailwind v4 / Next.js 16 での `components.json` の項目など）は、実施時に公式ドキュメントで確認する。現時点では未確認。

## 影響・トレードオフ

- 良くなること: 以降のタスクで UI 部品を一貫して追加できる。部品のコードを自分たちで管理できる。
- 悪くなること / 受け入れるリスク: 依存が段階的に増える。依存の追加は CLAUDE.md 5節に従い、その都度人間の承認を取る。
- 依存の導入方針: 本タスクでは `clsx` と `tailwind-merge` のみを、承認後に追加する（計画 T5）。`class-variance-authority`、`lucide-react`、`tw-animate-css` とテーマ用の CSS 変数は、最初のコンポーネントを追加するタスクで改めて承認を取る。`shadcn init` の CLI は、承認していない依存の追加と `app/globals.css` の書き換えを伴うため使わない。
- 追従が必要な更新: `docs/architecture.md`（技術スタック表と構成）、CLAUDE.md 2節のスタイリング欄と 6節のディレクトリ構成。
