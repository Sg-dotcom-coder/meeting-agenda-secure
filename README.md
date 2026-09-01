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
- `AI_GATEWAY_API_KEY`（ローカル開発時。VercelではOIDCも利用可能）

ブラウザにはSupabaseのpublishable keyのみを使用します。secret keyやservice role keyを追加しないでください。

音声解析とGoogle Tasks連携を使う場合は、SupabaseでGoogle OAuthを有効化し、`meeting-audio-temp`というprivate Storage bucketを用意してください。bucketのポリシーは、認証ユーザーが自分のユーザーIDから始まるパスだけを追加・参照・削除できるように設定します。Google OAuthには `https://www.googleapis.com/auth/tasks` スコープを追加します。

AI議事録とワークスペースアシスタントのAPIは、公開URLからの無制限利用を防ぐためSupabaseの認証済みアクセストークンを必須にしています。

## 移行状況

- [x] 会議一覧と全体アジェンダ
- [x] アジェンダToDoとタスク管理の双方向連携
- [x] 会議の要約
- [x] タスク管理の基本編集・検索・絞り込み
- [x] 業務予定（日付・担当者別の自動保存、完成文コピー）
- [x] 日報（日付・担当者別の自動保存、完成文コピー）
- [x] Redmine文章（Textile形式の文章生成・コピー）
- [x] AI議事録（文字起こし貼り付け、要約・議題・ToDo抽出）
- [x] ワークスペースアシスタント（1,500文字、続きを生成）
- [x] AI議事録の認証付き音声アップロード（録音・音声ファイル、解析後に一時ファイル削除）
- [x] Google Tasks連携（任意のGoogle接続、登録済み表示）

全項目の移行とプレビュー確認が完了するまで、現行本番は切り替えません。
