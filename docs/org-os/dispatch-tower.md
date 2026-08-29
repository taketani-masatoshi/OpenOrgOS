# Dispatch Tower（司令塔）

CEO / 承認者が Steward Chat で依頼する入口。Slack 連携・Asana 互換 UI は作らない。カード面は **人間の行為と期日** と AIA 草案のみ。

## work_kind

| kind | 意味 | 期日 | Work Order |
|------|------|------|------------|
| `fact_live` | 今の事実（資金繰り・KPI・Today） | なし | 作らない |
| `fact_gap` | 正本の穴埋め | あり | 人へ |
| `human_act` | 電話・現地・押印 | あり | 人へ |
| `aia_draft` | AIA 下書き | 任意 | AIA へ |
| `judgment` | Wire・稟議 | — | 承認キュー |
| `unknown` | 未分類 | — | 確認のみ |

分類は `src/lib/dispatch-tower/classify.ts` · レジストリ `steward/core/dispatch-tower/registry.yaml`。

## 在庫

- **AIA 種類** — roster ON × catalog（`incomplete` / roster 外は not dispatchable）
- **稼働** — `hydrateAiaQueueState()` 集計（件数・待ちのみ。プロンプト本文なし）
- **人間** — employees ⋈ org-chart ⋈ operators ⋈ `human-capacity.yaml`

## CLI / HTTP

```bash
orgos tower classify --text "13週資金繰りを生成"
orgos tower inventory --json
orgos tower assign --plan-id <tower-plan-id> --confirmed
```

- `GET /chat/v1/tower/inventory`（`chat:read`）
- `POST /chat/v1/tower/assign`（`chat:ask` · 確認後）

## 人間能力タグ

正本カタログ: `steward/core/org/human-capability-catalog.yaml`

テナント割当: `data/org/human-capacity.yaml`（`employee_id` · 任意 `operator_id` → tags）

住所・給与・個情は載せない。

## Steward Chat UI

予実サブナビに **司令塔**（`/?tower=1`）。在庫読取 + `TowerActionCard`（Chat 返信の `tower_plan`）。

## Related

- [ADR 0057](../adr/0057-dispatch-tower.md)
- [integration-agent.md](integration-agent.md)
