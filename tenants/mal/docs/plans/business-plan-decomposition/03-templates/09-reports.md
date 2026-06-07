# テンプレート — 9. レポート計画（8）

**保存先:** `docs/plans/reports/` · **出力:** `docs/reports/`

| # | 計画名 | 目的 | 生成 | 担当 | 頻度 |
|---|--------|------|------|------|------|
| 9.1 | 月次経営レポート | Executive 統合サマリ | CLI+MD | Executive | 月次 |
| 9.2 | 物件別レポート | PROP KPI 予実 | MD | Finance | 月次 |
| 9.3 | 契約期限レポート | CTR 更新アラート | CLI | Contract | 月次 |
| 9.4 | 修繕レポート | 修繕履歴・予算 | MD | Operations | 四半期 |
| 9.5 | 資金繰りレポート | CF・ランウェイ | MD | Finance | 月次 |
| 9.6 | 旅館稼働率レポート | 稼働·ADR·RevPAR | MD | Hospitality | 週次 |
| 9.7 | リスクレポート | リスク登録更新 | MD | Executive | 月次 |
| 9.8 | 年次計画差異 | 予算 vs 実績 | MD | Finance | 年次 |

---

## 9.1 月次経営レポート

| 項目 | 内容 |
|------|------|
| **目的** | 経営者向け 1 枚サマリ（KPI・P0・CF） |
| **管理対象** | 全社 |
| **必要な入力** | dashboard · yojitsu · alerts |
| **出力** | `docs/reports/dashboard/` · 月次 MD |
| **KPI** | レポート生成日 · 閲覧 |
| **関連フォルダ** | `docs/reports/dashboard/` |
| **担当** | Executive Steward |
| **更新頻度** | 月次（`npm run steward -- dashboard`） |
| **リスク** | 入力データ TBD |

---

## 9.6 旅館業稼働率レポート

| 項目 | 内容 |
|------|------|
| **目的** | 亀沢の稼働・ADR・RevPAR の週次モニタリング |
| **管理対象** | PROP-002 |
| **必要な入力** | OTA データ · `hotel.*` |
| **出力** | 週次 MD · ダッシュボード連携 |
| **KPI** | 稼働率 70% · RevPAR |
| **関連フォルダ** | `docs/reports/hospitality/` |
| **担当** | Hospitality · Finance |
| **更新頻度** | 週次 |
| **リスク** | 開業前データなし |

---

## 9.8 年次計画差異レポート

| 項目 | 内容 |
|------|------|
| **目的** | 年度予算と決算実績の差異分析と次年度反映 |
| **管理対象** | 全計画 |
| **必要な入力** | yojitsu · 決算書 |
| **出力** | 差異分析 MD · 改善アクション |
| **KPI** | 差異率 · 改善実施率 |
| **関連フォルダ** | `docs/plans/variance/fy2026-variance.md` |
| **担当** | Finance · Executive |
| **更新頻度** | 年次（決算後） |
| **リスク** | 予実未整備 |
