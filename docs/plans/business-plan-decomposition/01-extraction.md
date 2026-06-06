# Step 1 — 事業計画解析（抽出結果）

**ソース:** `cursor/data/plans/business-plan.yaml` · `company.yaml` · `properties/` · `finances/` · `contracts/` · `docs/plans/fy2026-pl.md`

---

## 会社の目的

| 項目 | 内容 |
|------|------|
| **ビジョン** | 外国人と日本人を繋ぎ、不動産オーナーの経営を言語・文化・DX の面から支援する。自社物件運営とサービス事業の両輪で持続可能な収益基盤を構築 |
| **法人目的（実態）** | 不動産オーナー向け翻訳・通訳、イベントスペース貸出、**旅館運営**、業務 DX 化支援、ソフトウェア開発。自社物件保有 |
| **中期目標（2026–2028）** | 亀沢旅館稼働率 70% 安定化 · 番町ハイム312 安定賃貸 · 翻訳定額化 · DX 付加価値収益拡大 |

---

## 事業領域

| セグメント | 説明 | 物件/根拠 |
|-----------|------|----------|
| **不動産賃貸** | 番町ハイム312、月額 10 万・満室想定 | PROP-001 |
| **旅館業（1棟貸し）** | 亀沢旅館、2026-08 開業、1 万円/人×5 名・稼働 70% | PROP-002 |
| **翻訳・通訳** | オーナーと入居外国人のコミュニケーション支援 | サービス（FY2026 未計上） |
| **DX・ソフトウェア** | 受託開発、SES、業務 DX 化 | サービス（FY2026 未計上） |
| **コンサル・PMO** | 新規事業・事業再生支援 | サービス（FY2026 未計上） |

**混在法人:** 株式会社 MAL は **賃貸物件 1 件 + 旅館 1 件 + B2B サービス** を同一法人で運営。本社は番町物件内（事務所家賃なし）。

---

## 収益源

| 収益源 | ドライバー | FY2026 計画 |
|--------|-----------|-------------|
| 番町賃料 | 月額 10 万 × 12 | 120 万円 |
| 亀沢宿泊 | 1 棟貸し × 稼働率 × ADR | 630 万円（8 月開業・6 ヶ月） |
| 翻訳・DX 等 | 月額・案件単価 | 0（未計上） |
| **合計** | | **750 万円** |

---

## 主要 KPI

| KPI | 目標 | 単位 | 根拠 |
|-----|------|------|------|
| 亀沢旅館 稼働率 | 70 | % | `business-plan.yaml` · `PROP-002.hotel.occupancy_rate` |
| 番町ハイム 空室率 | 0 | % | `PROP-001.rental.vacancy_rate` |
| FY2026 売上（物件中心） | 750 | 万円 | `revenue-plan.yaml` |
| FY2026 営業利益 | 417 | 万円 | `profit-plan.yaml` |
| FY2027 売上 | 1,380 | 万円 | 亀沢フル 12 ヶ月 |
| FY2028 売上 | 1,443 | 万円 | 亀沢 +5% 成長 |

**運用 KPI（下位計画で管理）:** RevPAR · NOI · DSCR · 契約更新率 · 空室日数 · OTA 手数料率 · 清掃コスト/泊

---

## 主要リスク

| リスク | 深刻度 | 現状 |
|--------|--------|------|
| **火災保険未加入** | 高 | CTR-013/014 draft — P0 対応中 |
| **亀沢開業遅延・低稼働** | 高 | 2026-08 開業想定、許認可・OTA 準備要 |
| **役員貸付 9,600 万（亀沢）** | 中 | 無利息・2040 期限、CF 依存返済 |
| **B/S・現預金未確定** | 高 | `cash-balance.yaml` TBD、税務 e-Tax ブロッカー |
| **借主・契約 TBD** | 中 | 番町賃貸借 CTR-011 draft |
| **OTA 手数料・清掃コスト変動** | 中 | 15.5% / 12,000 円/回 前提 |
| **サービス収益未計上** | 低 | 翻訳・DX が P/L に未反映 |
| **個情・旅館業法・消防** | 中 | Compliance 計画で管理 |

---

## 必要資金

| 用途 | 金額 | 調達 |
|------|------|------|
| 番町取得 | 1,660 万 | LOAN-001 役員貸付（無利息、2035 期限） |
| 亀沢取得 | 9,600 万（土地 7,000 + 上置き 2,600） | LOAN-002 役員貸付（無利息、2040 期限） |
| FY2026 投資 | 2,600 万 | `investment-plan.yaml`（亀沢 CAPEX） |
| FY2028 投資 | 500 万 | 計画値 |
| **運転資金** | TBD | 現預金・ランウェイ要入力 |

**返済方針:** 2028 年度以降 CF に応じ任意返済（番町）· 2030 年度以降段階返済（亀沢）

---

## 重要な前提条件

| 前提 | 内容 |
|------|------|
| **会計年度** | 2 月始まり 1 月決算（`fiscal_year_end_month: 1`） |
| **亀沢開業日** | 2026-08-01（`PROP-002.hotel.opened_date`） |
| **番町賃料** | 100,000 円/月・空室 0% |
| **亀沢料金体系** | ADR 50,000 円/泊（1 万/人×5 名）· 稼働 70% |
| **融資** | 銀行借入 0（全額役員貸付） |
| **管理形態** | 番町自社管理想定 · 亀沢清掃委託 CTR-012 draft |
| **Steward OS** | 正データ YAML · 人向け MD · 7 エージェント + 本分解エージェント |
| **税務** | FY2026 予想ベース確定、B/S 3 項目 TBD |

---

## 抽出に使用したファイル

```
cursor/data/plans/business-plan.yaml
cursor/data/plans/revenue-plan.yaml
cursor/data/plans/profit-plan.yaml
cursor/data/plans/expense-plan.yaml
cursor/data/plans/investment-plan.yaml
cursor/data/plans/property-revenue.yaml
cursor/data/company.yaml
cursor/data/properties/PROP-001.yaml
cursor/data/properties/PROP-002.yaml
cursor/data/finances/loans.yaml
cursor/data/finances/cash-balance.yaml
cursor/data/dependency-graph.yaml
docs/plans/fy2026-pl.md
docs/corporate/executive-remaining-tasks.md
```
