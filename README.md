# Redirect & Scheme Switcher (Chrome Extension)

リダイレクトとスキーム変換を1つにした Chrome 拡張です。正規表現で柔軟に制御でき、GUI と JSON のインポート/エクスポートに対応。

## 機能

- 正規表現でURLをマッチし、regexSubstitution ($1 などの後方参照)で置換してリダイレクト
- ルールのON/OFF、順序変更、説明メモ
- GUI で編集 + JSON でのインポート/エクスポート
- オプションページで動作テスト

## 仕組み

Manifest V3 の `declarativeNetRequest` の動的ルールを使用します。各ルールは `regexFilter` と `regexSubstitution` を使ったリダイレクトとして適用されます。非HTTPスキーム（obsidian:// など）は service worker 側で遷移します。

注意: `regexFilter` は RE2 ベースです。JavaScript の正規表現と完全には一致しないため、先読みなど一部の高度な機能は使えません。

## インストール (開発者モード)

1. Chrome で 拡張機能 > デベロッパーモードを有効化
2. 「パッケージ化されていない拡張機能を読み込む」でこのフォルダを選択
3. オプションページからルールを設定

## ルール形式 (JSON)

```json
[
  {
    "id": "r_xxxxxx",
    "enabled": true,
    "description": "example リダイレクト",
    "match": "^https://example\\.com/(.*)$",
    "target": "https://new.example.com/$1"
  }
]
```

- match: RE2互換の正規表現
- target: `regexSubstitution` として使われます。指定が無い場合は `rewrite` を使用します。

## トラブルシュート

- 期待通りに動かない場合は、まずオプションページのテストで置換結果を確認してください。
- 無効な正規表現は自動的にスキップされます。
- 複数ルールがマッチする場合、上にあるルールが優先されます。

## ライセンス

MIT
