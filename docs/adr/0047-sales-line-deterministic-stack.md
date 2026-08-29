# ADR 0047: Sales Line Deterministic Stack

**Status:** Accepted  
**Date:** 2026-08-24

## Context

営業ライン（`sales_lead` / `sales_outbound` / `sales_inbound` / `customer_success`）は Agent 定義 · routing · Skill 登録までは存在したが、`schemas/sales.ts` が `src/` から未参照であり、`orgos validate` · CLI · Steward Chat fact provider · dashboard 統合が無かった。

finance / contract と同等の **決定論スタック** が必要。

## Decision

1. **SoT パス正規化**
   - `data/sales/pipeline.yaml` — 商談（sales_lead）
   - `data/sales/inbound/inquiries.yaml` — 問合せ（sales_inbound）
   - `data/sales/outbound/campaigns.yaml` — 施策（sales_outbound）
   - `data/customers/accounts.yaml` — 顧客（customer_success）

2. **決定論処理**
   - `src/lib/sales-pipeline-view.ts` · `src/lib/customer-success-view.ts`
   - `orgos sales summary|forecast|customers|pipeline-view`
   - `sales_pipeline_review` · `sales_forecast_prep` を `runtime: cli` へ昇格

3. **Chat / Today**
   - `operator_sales_pipeline` fact provider
   - Today コンテキストに営業 KPI 行を追加

4. **demo 除外**
   - `demo: true` 商談は既定集計除外（`--include-demo` で含める）

5. **L2 禁止**
   - 要約 · Chat 応答に `party.contact_email` / `contact_phone` を出力しない

6. **Operator Console UI（第1波 · 閲覧）**
   - 1段目 **顧客管理** タブ（`/customers/`）— `sales` または `customer_success` モジュール On のときのみ表示（sales Agent のみ On は短期猶予でタブ可 · モジュール取込を案内）
   - 2段目: アウトバウンド（施策 + 進行中商談）· インバウンド · アフターセールス · 解約・休眠（churn は health / `last_contact_on` / churn-events から派生 · 新 enum なし）
   - `GET /chat/v1/customers/{nav,outbound,inbound,after-sales,churn}` — `chat:read` · L2 落とし
   - 書き込みは CLI / Chat / `orgos change` のまま（第2波で UI）

## Consequences

- `orgos validate` が sales/customers YAML を検証
- mal テナント `sales_lead` readiness が 90% 以上を目標
- outbound 文案 Skill（`sales_outreach_draft` 等）は引き続き `runtime: agent`（対話必須）
- outbound リスト精査 Skill（`sales_outbound_list_review`）は `runtime: cli` へ昇格
- outbound 接触カバレッジは **active 施策のみ**合算（`aggregate_coverage_pct`）
- inbound トリアージ Skill（`sales_inbound_triage`）は `runtime: cli` へ昇格（ADR 0049）

## Related

- [schemas/sales.ts](../../schemas/sales.ts)
- [schemas/customer-success/index.ts](../../schemas/customer-success/index.ts)
- [steward/core/agents/sales_lead_agent.md](../../steward/core/agents/sales_lead_agent.md)
- ADR 0033 Deterministic Fact Provider Registry
