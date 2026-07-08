# 記録データ（個人情報含む）

このフォルダの **記入済みファイル** は Git に含めません。

## 推奨構成（2026〜）

```
records/2026/
├── compliance/
│   ├── 宿泊者名簿-2026.csv
│   └── 外国人宿泊者届-2026.csv
├── operations/
│   ├── 日次運営記録-2026.csv
│   ├── 予約稼働台帳-2026.csv
│   ├── チェックイン確認-2026.csv
│   └── チェックアウト確認-2026.csv
├── housekeeping/
│   ├── 清掃記録-2026.csv
│   ├── 清掃発注引継-2026.csv
│   └── 消耗品在庫-2026.csv
├── maintenance/
│   ├── メンテナンス記録-2026.csv
│   ├── 設備故障報告-2026.csv
│   ├── 光熱メーター記録-2026.csv
│   └── 定期点検-2026-08.md
└── guest-service/
    └── クレーム記録-2026.csv
```

## 初回セットアップ

1. 上記フォルダを作成
2. [templates/](../templates/) から各 CSV をコピー
3. 月次でバックアップ（暗号化）

運用ガイド: [daily-operations-guide.md](../daily-operations-guide.md)
