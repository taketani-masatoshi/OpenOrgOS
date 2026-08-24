# ADR 0044 — Work Order DAG orchestration

- **Status:** Accepted
- **Date:** 2026-08-24
- **Context:** Executive Steward は Work Order 起票と multi-agent parent/child 構造を持つが、依存順序・状態機械・retry・統合 observability が未接続だった。`runDispatch` は WO status を更新せず、`depends_on` も無かった。

## Context

- 既存: `escalate run` → IMP YAML · `agent dispatch run` → manifest · AIA admission（[ADR 0040](0040-aia-parallel-runtime.md)）。
- ギャップ: 子 WO は常に同時並列 · dispatch 後 status 固定 · 失敗 retry なし · CEO 向け run board なし。
- Executive Steward は正データを編集しない（[operator-policy](../../steward/rules/operator-policy.md)）。オーケストレーションは **routing-queue** と **executive-notes** のみ触る。

## Decision

1. **DAG は Handoff SSOT を拡張** — 新 ID 空間（`OP-*`）は作らない。子 IMP に `depends_on: string[]` を追加。wave は保存せず導出。

2. **状態機械** — `pending | waiting | dispatched | running | completed | failed | blocked`。遷移は `transitionWorkOrder()` に集約（YAML + queue event + audit）。

3. **責務分離**
   - **Orchestration** — 依存順序 · retry · cancel · trace_id
   - **AIA scheduler** — 同時実行枠 · workspace 隔離 · LLM backpressure（変更なし）

4. **CLI 正本** — `orgos orchestrate plan|run|status|retry|cancel`。`agent dispatch run` は従来どおり単一バッチ向け。

5. **後方互換** — `depends_on` / `dispatch` 無しの既存 YAML は読める。`escalate complete` は `pending → completed` を許可。

6. **Human approval** — orchestration は承認を代替しない（[ADR 0038](0038-human-approval-context.md)）。

## Consequences

- P0: 決定論 DAG + state machine + CLI + tests（本 ADR 実装）。
- P1 以降: LLM planner · critique ループ · Run Board UI（[steward-orchestration-uplift-plan.md](../org-os/steward-orchestration-uplift-plan.md)）。
- `orgos validate` は handoff schema 拡張を検証。
- Chat: Skill `orchestration_status`（read）で DAG 進捗を表示。

## Related

- [steward-orchestration-uplift-plan.md](../org-os/steward-orchestration-uplift-plan.md)
- [aia-parallel-runtime.md](../org-os/aia-parallel-runtime.md)
- [executive_steward_agent.md](../../steward/core/agents/executive_steward_agent.md)
