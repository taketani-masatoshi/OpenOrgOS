# ドキュメント（人が読むゾーン）

**経営・契約・決算・印刷用 PDF は、すべてここ。**

数値の正データ（YAML）は [`cursor/data/`](../cursor/data/) にあり、Cursor が更新します。

---

## クイックリンク

| 見たいもの | ファイル |
|-----------|---------|
| FY2026 決算書 | [plans/fy2026-pl.md](plans/fy2026-pl.md) |
| **経営ダッシュボード** | `npm run steward -- dashboard` → [reports/dashboard/](reports/dashboard/) |
| KPI 定義・月次トレンド | [plans/executive-dashboard-guide.md](plans/executive-dashboard-guide.md) |
| キャッシュフロー詳細 | [plans/cashflow-detail.md](plans/cashflow-detail.md) |
| 法人書類（議事録等） | [corporate/](corporate/) |
| 決算・総会・税務予定 | [corporate/fy2026-meeting-schedule.md](corporate/fy2026-meeting-schedule.md) |
| 社内規程 | [corporate/regulations/](corporate/regulations/) |
| ISO / マネジメント | [iso/](iso/) · [現状評価](iso/steward-assessment.md) |
| 決算・事業報告 PDF | [outbox/corporate/](outbox/corporate/) |
| **受信トレイ（Input）** | [inbox/](inbox/) |
| **出力トレイ（Output）** | [outbox/](outbox/) |
| 契約書 | [contracts/](contracts/) |
| 契約一覧表 | [data/契約管理表.csv](data/契約管理表.csv) |
| **業務台帳・名簿** | [operations/](operations/) · [亀沢運用ガイド](operations/lodging/daily-operations-guide.md) |

---

## フォルダ構成

```
docs/
├── inbox/             受信トレイ（スキャン・申請書）
├── outbox/            出力トレイ（印刷・提出 PDF）
├── plans/             決算書・予実（MD）
├── corporate/         法人書類（MD）
├── contracts/         契約書
├── operations/        業務台帳・宿泊者名簿・プライバシー
├── data/              計画・台帳 CSV
└── reports/           CLI 自動生成 MD
```

---

## 正データとの対応

| 人（docs/） | 正データ（cursor/data/） |
|------------|-------------------------|
| [plans/fy2026-pl.md](plans/fy2026-pl.md) | `plans/yojitsu-fy2026.yaml` |
| [corporate/](corporate/) | 複数 YAML |
| [corporate/pdf/](corporate/pdf/) | 同上から CLI 生成（→ [outbox/corporate/](outbox/corporate/)） |
| [inbox/](inbox/) · [outbox/](outbox/) | `cursor/data/document-io.yaml` |

---

## 更新ルール

1. 数値変更 → `cursor/data/` YAML → `npm run validate`
2. CSV・MD を同期
3. `npm run steward -- report ...` で PDF 再生成
4. 試行中は `cursor/scratch/` → 確定後 `docs/` へ

全体地図: [ルート README](../README.md)
