# Changelog

## [v0.1.0](https://github.com/na3shkw/x-save-notion-userscript/commits/v0.1.0) - 2026-05-06
### New Features 🎉
- X のポストをワンクリックで Notion データベースに保存するユーザースクリプトを追加
  - タイムライン・詳細画面への「保存」ボタン追加
  - テキスト・著者・日時・画像・引用ポストの保存対応
  - 画像の Notion アップロード（失敗時は外部 URL 参照にフォールバック）
  - 保存済みポストの重複チェック（✅ 表示）
  - ページ上のモーダルから設定変更可能
- Tampermonkey の自動更新に対応（`@updateURL` / `@downloadURL` を設定）
### Other Changes
- tagpr による自動リリースフローを追加（GitHub Actions）
- GitHub Releases へのユーザースクリプトアセット添付を追加
