# Steward OS — 事業計画分解（マスター索引）

**版:** 2026-06-07 · **対象:** 株式会社MAL（不動産賃貸 + 旅館業 + サービス事業）  
**正データ:** `data/plans/business-plan.yaml` · **エージェント:** [steward/core/orchestrators/business_plan_decomposition.md](../../../steward/core/orchestrators/business_plan_decomposition.md)

---

## 読み方

| ファイル | 内容 |
|---------|------|
| [01-extraction.md](01-extraction.md) | Step 1 — 事業計画からの抽出 |
| [02-sub-plans-catalog.md](02-sub-plans-catalog.md) | Step 2 — 下位計画一覧と目的 |
| [03-templates/](03-templates/) | Step 3 — 各計画テンプレート（9カテゴリ） |
| [04-dependencies.md](04-dependencies.md) | Step 4 — 計画間依存関係 |
| [05-folder-mapping.md](05-folder-mapping.md) | Step 5 — steward-os/ フォルダマッピング |
| [06-file-manifest.md](06-file-manifest.md) | Step 6 — 作成すべき Markdown 一覧 |
| [07-next-actions.md](07-next-actions.md) | Step 7 — Cursor で実行すべき作業 |

---

## 現行リポジトリとの対応

本設計の **論理フォルダ**（`steward-os/00_company/` 等）は、現行 Steward リポジトリでは以下に **分散配置** 済み。新規大規模移行は不要 — マニフェストのパスを正とし、段階的にファイルを追加する。

| 論理 | 現行 Steward |
|------|-------------|
| `00_company/` | `data/company.yaml` · `docs/company/` |
| `01_business_plan/` | `data/plans/` · `docs/plans/` |
| `02_properties/` | `data/properties/` · `docs/properties/PROP-001-bancho/operations/` · `docs/properties/PROP-002-kamezawa/operations/` |
| `03_finance/` | `data/finance/` · `docs/plans/` · `docs/exports/` |
| `04_contracts/` | `data/contracts/` · `docs/contracts/` |
| `05_rental/` | `PROP-001` 関連 · Property Rental Agent |
| `06_hospitality/` | `PROP-002` · `docs/properties/PROP-002-kamezawa/operations/` |
| `07_compliance/` | `docs/company/regulations/` · `licenses/` · `docs/compliance/iso/` |
| `08_operations/` | `docs/io/inbox/` · `docs/io/outbox/` · `docs/finance/accounting/` |
| `09_reports/` | `docs/reports/` |
| `10_decisions/` | `docs/company/`（議事録）· `docs/plans/`（差異分析） |
| `11_prompts/` | `prompts/` · `.cursor/rules/` |

---

## 物件スコープ

| ID | 名称 | 事業 | 計画インスタンス |
|----|------|------|-----------------|
| PROP-001 | 番町ハイム312 | 賃貸 | `02_properties/PROP-001/` 配下 11 計画 |
| PROP-002 | 亀沢旅館 | 旅館（1棟貸し） | `02_properties/PROP-002/` 配下 11 計画 |

---

## エージェント担当マトリクス（概要）

| エージェント | 主担当計画 |
|-------------|-----------|
| **Executive Steward** | 中期経営・年度・KPI・投資・売却判断・年次差異 |
| **Secretary** | 社長タスク・予定・会食・1-on-1・社外連絡（経営数値は扱わない） |
| **Finance** | 財務全般・資金繰り・借入返済・DSCR・税務 |
| **Contract** | 契約計画全般・更新管理 |
| **Property Rental** | 賃貸モジュール・PROP-001 物件計画 |
| **Hospitality** | 旅館モジュール・PROP-002 物件計画 |
| **Compliance** | 法令・許認可・保険・個情 |
| **Operations** | 外部委託・レポート I/O・月次運用 |

---

## クイック参照 — 依存チェーン（要約）

```
事業計画 (business-plan.yaml)
  → 中期経営計画 / 年度計画
    → 物件別収益計画 (property-revenue.yaml)
      → 売上・費用・損益計画 (revenue/expense/profit-plan.yaml)
        → 物件別損益 / 全社損益
          → キャッシュフロー / 資金繰り
            → 借入返済 / DSCR / 投資計画
              → 契約計画 / 外部委託計画
                → 月次・物件別レポート
```

詳細: [04-dependencies.md](04-dependencies.md)
