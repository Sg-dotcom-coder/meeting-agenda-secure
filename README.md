# Meeting Agenda Secure

会議アジェンダ、会議ToDo、業務タスクを一元管理するNext.jsアプリです。

## 開発

```bash
npm install
cp .env.example .env.local
npm run dev
```

## 確認コマンド

```bash
npm run typecheck
npm run build
```

## 環境変数

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

ブラウザにはSupabaseのpublishable keyのみを使用します。secret keyやservice role keyを追加しないでください。

## 移行状況

- [x] 会議一覧と全体アジェンダ
- [x] アジェンダToDoとタスク管理の連携
- [x] 会議の要約
- [x] タスク管理の基本編集・検索・絞り込み
- [ ] 業務予定
- [ ] 日報
- [ ] Redmine文章
- [ ] AI議事録・ワークスペースアシスタント
- [ ] Google Tasks連携

全項目の移行とプレビュー確認が完了するまで、現行本番は切り替えません。
