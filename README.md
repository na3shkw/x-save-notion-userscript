# X → Notion Saver

X (Twitter) のポストをワンクリックで Notion データベースに保存するユーザースクリプトです。

## 機能

- タイムライン・詳細画面の各ポストに「保存」ボタンを追加
- テキスト・著者・日時・画像・引用ポストを Notion に保存
- 画像は Notion にアップロード（失敗時は外部URL参照にフォールバック）
- 保存済みポストの重複チェック（✅ 表示）
- トークン等の設定をページ上のモーダルから変更可能

## インストール

1. ブラウザに [Tampermonkey](https://www.tampermonkey.net/) をインストール
2. [`src/x-save-notion.user.js`](src/x-save-notion.user.js) を開き、Tampermonkey でインストール
3. 後述の「初期設定」を行う

## 初期設定

### 1. Notion インテグレーションの作成

1. [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations) でインテグレーションを新規作成
2. 「内部インテグレーション」を選択し、作成後に表示される **Notion Token** (`secret_...`) を控える

### 2. Notion データベースの作成

後述の「データベーススキーマ」に従いデータベースを作成し、インテグレーションを接続する。

> データベースページ右上の「...」→「接続」→ 作成したインテグレーションを選択

### 3. スクリプトの設定

X を開くと設定モーダルが自動で表示されます。  
または `x.com` のコンソールで `notionSaverSettings()` を実行するとモーダルを開けます。

| 項目 | 値 |
|------|----|
| Notion Token | `secret_...` から始まるトークン |
| Database ID | データベースURLに含まれる32桁のID |

**Database ID の確認方法**  
データベースページのURLが `https://www.notion.so/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx?v=...` のとき、`?v=` より前の32文字が Database ID です。

## データベーススキーマ

スクリプトが書き込むプロパティは以下の通りです。Notion データベースに **同名・同型** のプロパティを作成してください。

| プロパティ名 | 型 | 内容 |
|-------------|-----|------|
| `Title` | タイトル | ポスト本文の先頭50文字 |
| `URL` | URL | ポストの URL (`https://x.com/...`) |
| `ID` | テキスト | ポストの数値ID（重複チェックに使用） |
| `Author` | テキスト | `表示名 (@ユーザー名)` 形式 |
| `Body` | テキスト | ポスト本文（最大2000文字） |
| `Images` | ファイル＆メディア | 添付画像 |
| `QuotedPost` | テキスト | 引用ポストの本文（引用がない場合は空） |
| `PostedAt` | 日付 | ポストの投稿日時（ISO 8601） |

> **注意**: プロパティ名は大文字・小文字を含め完全一致させてください。名前が違う場合は Notion API がエラーを返します。

## ボタンの状態

| 表示 | 意味 |
|------|------|
| `保存` | 未保存。クリックで保存開始 |
| `…` | 保存中 |
| `✅` | 保存済み |
| `✅⚠` | 保存済み（一部画像が外部URL参照。将来リンク切れの可能性あり） |
| `！` | エラー。3秒後に「保存」に戻る |

## 開発

```bash
npm install        # Biome（フォーマッター）をインストール
npm run format     # コードフォーマット（または保存時に自動実行）
```

推奨エディタ拡張: [Biome](https://marketplace.visualstudio.com/items?itemName=biomejs.biome)（`.vscode/extensions.json` に設定済み）

## ライセンス

ISC
