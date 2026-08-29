# ADR 0050: Customer Success Deterministic Stack

**Status:** Accepted  
**Date:** 2026-08-24

## Context

カスタマーサクセス（`customer_success`）はコア Agent 定義 · routing · Skill 登録までは存在したが、Skill は `runtime: agent` のみで CLI 未実装、Today / Chat fact provider / Canvas 統合が無かった。`data/customers/accounts.yaml` の手入力 `health` enum のみで、オンボーディング · QBR · NPS · 解約イベントの SoT も無かった。

finance / sales / hospitality と同等の **決定論スタック** と、業務モジュール `customer_success` が必要。

## Decision

1. **SoT パス正規化**
   - `data/customers/accounts.yaml` — 顧客台帳（health 宣言 SSOT）
   - `data/customers/health-signals.yaml` — 利用 · サポート · センチメント
   - `data/customers/onboarding.yaml` — オンボーディング進捗
   - `data/customers/qbr.yaml` — QBR 記録（要約行のみ）
   - `data/customers/nps.yaml` — NPS スコア（コメントなし）
   - `data/customers/churn-events.yaml` — 解約関連イベント（append-only）
   - `docs/customers/` — 顧客向け運用メモ（Zone B）

2. **ヘルススコア**
   - `health` は人間の宣言 SSOT。`computeAccountHealth()` が rubric から 0–100 と `recommended` を算出
   - 乖離は `orgos validate` で WARNING（`--strict` で FAIL）
   - `churned` は算出しない（churn-event 駆動の終端状態）

3. **業務モジュール**
   - `steward/modules/customer_success/` — manifest · agent.md · health-rubric.yaml · seed · cli · skills
   - モジュール id = agent id = `customer_success`（investor_relations 前例）

4. **決定論処理**
   - `src/lib/customer-success/` — health-score · rubric loader
   - `src/lib/customer-success-view.ts` — 集計 · drift · NPS · QBR · onboarding
   - `orgos sales customers`（`--scores` · `--drift-only` · `--json`）
   - `orgos operations customer-success show|validate|health|onboarding|nps`
   - `cs_health_check` · `cs_renewal_risk` を `runtime: cli` へ昇格

5. **Chat / Today**
   - `operator_customer_success` fact provider
   - Today コンテキストに顧客 KPI 行を追加

6. **Canvas**
   - `suite: "sales"` · `view_id: "customers"`（enum 変更なし）

7. **demo 除外 · L1 制約**
   - `demo: true` 顧客は既定集計除外（`--include-demo` で含める）
   - Chat / 要約に顧客個人名 · 連絡先 · NPS コメント本文を出力しない

## Consequences

- `orgos validate` が customers YAML 群を検証
- mal テナントで `customer_success` モジュール有効化 · roster 登録
- `saas_subscription` の renewals CLI とは責務分離（CS は顧客ヘルス · 関係維持、SaaS は契約プラン MRR）

## Related

- [schemas/customer-success/](../../schemas/customer-success/index.ts)
- [steward/core/agents/customer_success_agent.md](../../steward/core/agents/customer_success_agent.md)
- [steward/modules/customer_success/](../../steward/modules/customer_success/module.manifest.yaml)
- ADR 0047 Sales Line Deterministic Stack
- ADR 0033 Deterministic Fact Provider Registry
