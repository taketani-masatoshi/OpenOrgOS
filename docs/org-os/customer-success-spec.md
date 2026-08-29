# Customer Success — 仕様

**版:** 1.0 · **日付:** 2026-08-24  
**ADR:** [0050-customer-success-deterministic-stack.md](../adr/0050-customer-success-deterministic-stack.md)

---

## 1. スコープ

| レイヤ | 担当 | パス |
|--------|------|------|
| **コア Agent** | 顧客ヘルス · 更新期日 · L1 要約 | `steward/core/agents/customer_success_agent.md` |
| **業務モジュール** | オンボーディング · QBR · NPS · シグナル · 解約イベント | `steward/modules/customer_success/` |
| **SoT データ** | 全 YAML | `data/customers/` |
| **人向け docs** | 運用メモ · QBR 下書き | `docs/customers/` |

---

## 2. データモデル

すべて `version: 1` ラッパ。正本スキーマ: `schemas/customer-success/`。

| ファイル | ID 形式 | 用途 |
|----------|---------|------|
| `accounts.yaml` | `CUST-YYYY-NNN` | 顧客台帳 · `health` 宣言 SSOT |
| `health-signals.yaml` | `CSS-YYYY-NNN` | 利用指数 · チケット · センチメント |
| `onboarding.yaml` | `CSON-YYYY-NNN` | オンボーディング · マイルストーン |
| `qbr.yaml` | `QBR-YYYY-NNN` | QBR 予定 · 実施 · 次回 |
| `nps.yaml` | `NPS-YYYY-NNN` | NPS スコア 0–10（**コメント禁止**） |
| `churn-events.yaml` | `CSE-YYYY-NNN` | 解約関連イベント（**append-only**） |

### accounts.yaml 主要フィールド

- `lifecycle`: `prospect` | `customer`（CS ビューは `customer` のみ）
- `email_domains`: メール紐付け · 重複判定用（個人 webmail 不可）
- `health`: `healthy` | `at_risk` | `critical` | `churned`（`lifecycle: customer` 時必須）
- `health_declared_on`: drift 判定の基準日
- `renewal_date`, `last_contact_on`, `next_action`, `next_action_due`
- `mrr_band`, `mrr_man`（L1 帯のみ · 詳細は finance）
- `plan_id`（saas_subscription 連携 · 任意）
- `contract_ids`（`CTR-` 参照 · 任意）
- `demo`: 既定集計除外

---

## 3. ヘルススコア（決定論）

正本 rubric: `steward/modules/customer_success/health-rubric.yaml`

```
score = 100 - Σ(factor_penalties)
recommended = healthy | at_risk | critical  （churned は宣言のみ）
```

減点要因（rubric 重み）:

| 要因 | 入力 |
|------|------|
| contact_recency | `last_contact_on` |
| action_overdue | `next_action_due` |
| renewal_proximity | `renewal_date` |
| usage_index | 最新 `health-signals` |
| support_pressure | `open_tickets` · `escalations_90d` |
| nps_latest | 最新 `nps` |
| onboarding_delay | 未完了マイルストーン |

**drift:** `health` ≠ `recommended` かつ `health !== churned` → validate WARNING

---

## 4. CLI

```bash
# コア KPI（営業ライン経由 · 維持）
orgos sales customers [--days 90] [--scores] [--drift-only] [--json]

# モジュール運用
orgos operations customer-success show|validate|health|onboarding|nps

# Skill（runtime: cli）
orgos skills run cs_health_check
orgos skills run cs_renewal_risk
```

---

## 5. Chat / Today

- Fact provider: `operator_customer_success`
- Today: 顧客数 · at_risk+critical · 更新期日 · drift 件数（L1）

---

## 6. 禁止 · L1 制約

- 契約変更の単独確定（Contract へ）
- 顧客 PII · NPS コメントの Chat / tracked MD 出力
- `churn-events.yaml` の既存行改変（append-only）
- L2/L3 値の tracked ファイル転記

---

## 7. 関連 Agent

| 状況 | 委譲先 |
|------|--------|
| 新規商談 | sales_lead |
| 契約更新 · 条件変更 | contract |
| 問合せ · 障害 | customer_support |
| MRR · 請求 | finance |
