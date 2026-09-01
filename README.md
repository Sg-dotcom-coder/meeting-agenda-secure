# Meeting Agenda Secure

会議アジェンダアプリの継続運用リポジトリです。

## 現在の構成

元のソースコードが残っていなかったため、稼働中の固定デプロイを変更せずに利用し、必要な機能だけを追加する移行用構成になっています。

- 元の画面・機能・Supabaseデータをそのまま利用
- アジェンダ末尾に「会議の要約」を追加
- 要約は既存の `meetings.participant_notes` JSON内の `__meetingSummary.share` に保存
- データベースのテーブル構成変更なし

## ファイル

- `api/proxy.js`: 稼働中の固定デプロイからHTMLを取得して追加スクリプトを読み込む
- `public/summary-patch.js`: 会議要約欄の表示・読み込み・自動保存
- `vercel.json`: 元の静的ファイルとAPIへのルーティング

## 確認方法

Vercelでは最初にPreviewへデプロイし、会議切り替え、要約の保存・再読み込み、既存のタスク管理を確認してからProductionへ反映します。
