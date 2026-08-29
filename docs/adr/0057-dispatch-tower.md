# ADR 0057 — Dispatch Tower（司令塔）

- **Status:** Accepted
- **Date:** 2026-08-24

## Context

CEO / 承認者が Steward Chat で「頼んで」と言う入口に、Slack 宿題と Asana 型カードが混在していた。資金繰りなど **今の事実** は提出日なしで即表示すべきだが、キーワードだけで `escalate` / `orchestrate` に落ちると再び「表を作って」宿題になる。

既存の Fact Provider（ADR 0033）· Chat Command Router（ADR 0035）· AIA queue（ADR 0040）· escalate Work Order はあるが、**kind を先に決めてから** 実行・割当する司令塔がなかった。

## Decision

Application 層に **Dispatch Tower** を載せる。

1. **work_kind**（決定論レジストリ `steward/core/dispatch-tower/registry.yaml`）
   - `fact_live` — 正本あり。Fact / Command read / 資金繰りを **今実行**。Work Order・期日禁止。
   - `fact_gap` — 正本の穴。穴埋め行為の期日カード（`blocked_on`）。
   - `human_act` — 電話・現地など人のみの期日カード。
   - `aia_draft` — AIA 草案 → 人間承認。
   - `judgment` — Wire・稟議。`ceo` / `approver` のみ。
   - `unknown` — 確認カード。自動 IMP しない。

2. **在庫ビュー** — AIA roster×catalog、AIA queue 集計、人間（employees ⋈ org-chart ⋈ human-capacity）と未完了 WO 負荷。

3. **handoff 拡張** — `work_kind` · `assignee_employee_id` · `assignee_operator_id` · `due_date` · `blocked_on`。`fact_live` に `due_date` は validate で拒否。

4. **人間スペック** — L1 能力タグのみ。カタログ `steward/core/org/human-capability-catalog.yaml`、テナント `data/org/human-capacity.yaml`。

5. **Chat** — `handleTowerChatMessage` を orchestrate より前。`fact_live` は WO を作らない。それ以外は `TowerActionCard` → `POST /chat/v1/tower/assign`。

Integration Agent が catalog 上の所有者。実行は CLI / Chat の同一コマンド。

## Consequences

- 資金繰り依頼は tower 経路で `fact_live`、orchestrate には落ちない
- 人間割当は handoff の assignee フィールド。escalate の `to_agent` だけに依存しない
- `integration-brief` Skill は tower inventory + 未完了カードの L1 要約を含む

## Related

- [0033](0033-deterministic-fact-provider-registry.md) — Fact Provider
- [0035](0035-chat-command-router.md) — Command Router
- [0040](0040-aia-parallel-runtime.md) — AIA parallel runtime
- [docs/org-os/dispatch-tower.md](../org-os/dispatch-tower.md)
