# Step 5 — フォルダマッピング（steward-os/ → Steward リポジトリ）

論理フォルダ `steward-os/` を現行 Steward リポジトリへマッピング。**太字** が推奨保存先。

---

## 00_company/ — 会社情報

| 計画・文書 | 保存先 |
|-----------|--------|
| 会社概要 | **`data/company.yaml`** |
| 株主名簿 | **`docs/company/shareholder-register.md`** |
| 定款・登記 | `docs/company/` |
| 役員・組織 | `docs/company/` · `data/hr/employees.yaml` |

---

## 01_business_plan/ — 全社計画

| 計画 | 正データ（YAML） | 人向け（MD） |
|------|-----------------|-------------|
| 事業計画 | **`data/plans/business-plan.yaml`** | **`docs/plans/business-plan-decomposition/`** |
| 中期経営計画 | `data/plans/business-plan.yaml`（mid_term_goals） | **`docs/plans/mid-term-plan.md`** |
| 年度計画 | `revenue/expense/profit/investment-plan.yaml` | **`docs/plans/annual-plan-fy2026.md`** |
| 月次計画 | `data/finance/monthly/{YYYY-MM}.yaml` | **`docs/plans/monthly-plan-template.md`** |
| KPI 計画 | `business-plan.yaml`（kpi） | **`docs/plans/kpi-plan.md`** |
| 資金繰り | **`data/finance/cash-balance.yaml`** | **`docs/plans/cashflow-detail.md`** |
| 投資計画 | **`data/plans/investment-plan.yaml`** | `docs/exports/投資計画.csv` |
| 借入計画 | **`data/finance/loans.yaml`** | `docs/contracts/CTR-008/` · `CTR-009/` |
| 税務計画 | — | **`docs/company/tax/fy2026/`** |
| 契約管理計画 | `data/contracts/` | **`docs/plans/contract-management-plan.md`** |
| リスク管理計画 | — | **`docs/plans/risk-management-plan.md`** |

---

## 02_properties/ — 物件別計画

| 計画 | PROP-001 | PROP-002 |
|------|----------|----------|
| 正データ | **`data/properties/PROP-001.yaml`** | **`data/properties/PROP-002.yaml`** |
| 物件基本〜リスク 11 計画 | **`docs/plans/properties/PROP-001/`** | **`docs/plans/properties/PROP-002/`** |
| 運用ドキュメント | **`docs/properties/PROP-001-bancho/operations/`** | **`docs/properties/PROP-002-kamezawa/operations/`** |
| 機密 | — | `data/operations/kamezawa-secrets.yaml` |

---

## 03_finance/ — 財務計画

| 計画 | 正データ | 人向け |
|------|---------|--------|
| 売上・費用・損益 | **`data/plans/revenue-plan.yaml`** 等 | **`docs/plans/fy2026-pl.md`** · **`docs/exports/*.csv`** |
| 物件別損益 | **`data/plans/property-revenue.yaml`** | `docs/exports/物件別収益.csv` |
| 予実 | **`data/plans/yojitsu-fy2026.yaml`** | **`docs/plans/2026-yojitsu.md`** |
| CF・DSCR・税 | `finances/` · `plans/` | **`docs/plans/cashflow-detail.md`** · `docs/company/tax/` |

---

## 04_contracts/ — 契約計画

| 内容 | パス |
|------|------|
| 契約台帳（正） | **`data/contracts/CTR-*.yaml`** |
| 契約書 MD | **`docs/contracts/CTR-*/`** |
| 契約計画群 | **`docs/plans/contracts/`** |

---

## 05_rental/ — 不動産賃貸モジュール

| 計画 | パス |
|------|------|
| 賃貸 9 モジュール計画 | **`docs/plans/rental/`** |
| 番町運用 | **`docs/properties/PROP-001-bancho/operations/`** |
| エージェント | **`steward/agents/property_rental_agent.md`** |

---

## 06_hospitality/ — 旅館業モジュール

| 計画 | パス |
|------|------|
| 旅館 10 モジュール計画 | **`docs/plans/hospitality/`** |
| 亀沢運用 | **`docs/properties/PROP-002-kamezawa/operations/`** |
| 公開情報 | **`data/operations/kamezawa-public.yaml`** |
| エージェント | **`steward/agents/hospitality_agent.md`** |

---

## 07_compliance/ — 法令・許認可

| 計画 | パス |
|------|------|
| 規程 | **`docs/company/regulations/`** |
| 許認可・保険 | **`docs/company/licenses/`** |
| ISO・監査 | **`docs/compliance/iso/`** |
| 個情 | **`docs/compliance/privacy/`** |
| コンプライアンス計画 | **`docs/plans/compliance/`** |

---

## 08_operations/ — 外部委託・業務 I/O

| 計画 | パス |
|------|------|
| 外部委託 9 計画 | **`docs/plans/outsourcing/`** |
| inbox/outbox | **`docs/io/inbox/`** · **`docs/io/outbox/`** |
| 書類 I/O 台帳 | **`data/document-io.yaml`** |
| 経理テンプレ | **`docs/finance/accounting/`** |

---

## 09_reports/ — レポート

| レポート | パス |
|---------|------|
| 日次ダッシュボード | **`docs/reports/dashboard/`**（CLI 自動生成） |
| 計画レポート定義 | **`docs/plans/reports/`** |
| 手動レポート | **`docs/reports/`** |

---

## 10_decisions/ — 意思決定記録

| 内容 | パス |
|------|------|
| 取締役会議事録 | **`docs/company/`** |
| 計画差異・判断 | **`docs/plans/variance/`** |
| P0 残タスク | **`docs/company/executive-remaining-tasks.md`** |

---

## steward/agents/ — エージェント

| 内容 | パス |
|------|------|
| **8 Agent 定義** | **`steward/agents/*.md`** · [00-このフォルダについて.md](../../../steward/agents/00-このフォルダについて.md) |
| 事業計画分解 Orchestrator | **`steward/orchestrators/business_plan_decomposition.md`** |
| アーキテクチャ | **`steward/rules/agent_skill_architecture.md`** · **`docs/agent_architecture.md`** |

**レガシー:** `prompts/*.md` は deprecated スタブ。

---

## 99_archive/ — アーカイブ

| 内容 | パス |
|------|------|
| 旧版計画 | **`docs/plans/archive/`** · **`99_archive/`**（将来） |

---

## 移行方針

1. **既存パスを維持** — 大規模リネームは行わない
2. **新規計画 MD** は `docs/plans/{category}/` に追加
3. **数値の正** は引き続き `data/` YAML
4. **`steward sync all`** で YAML → `docs/exports/*.csv` 同期
