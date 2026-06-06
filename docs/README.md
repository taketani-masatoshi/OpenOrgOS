# Steward OS — ドキュメント

人が読む・議論するための資料置き場です。数値の正（Source of Truth）は [`cursor/data/`](../cursor/data/) 配下の YAML です。

## 目次

| ファイル | 内容 |
|---------|------|
| [spec-v0.2.md](spec-v0.2.md) | システム仕様・MVP 機能一覧 |
| [plans/fy2026-pl.md](plans/fy2026-pl.md) | **FY2026 決算書（予想ベース・確定済）** |
| [plans/2026-yojitsu.md](plans/2026-yojitsu.md) | 2026年 予実計画（暦年・参照用） |
| [web-updates.md](web-updates.md) | Web サイト更新手順 |

## フォルダ構成（全体）

```
Steward/
├── docs/          ← 今ここ（人向けドキュメント）
├── cursor/        ← Cursor / CLI 用データ（YAML・スキーマ・レポート）
├── src/           ← CLI プログラム
└── tests/         ← テスト
```

## データとの対応

| 人向けドキュメント | 対応する YAML |
|------------------|--------------|
| [plans/fy2026-pl.md](plans/fy2026-pl.md) | `cursor/data/plans/yojitsu-fy2026.yaml` |
| [plans/2026-yojitsu.md](plans/2026-yojitsu.md) | `cursor/data/plans/yojitsu-2026.yaml` |
