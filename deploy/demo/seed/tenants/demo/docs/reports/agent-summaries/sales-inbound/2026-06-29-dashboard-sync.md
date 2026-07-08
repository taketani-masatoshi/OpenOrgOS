# sales_inbound Agent 要約 2026-06-29

## 結論

- **完成度:** 88%（readiness 自動評価）
- **担当パス:** 2 件（下表）
- ギャップ: データSoT: tenant 0/2 · template 2/2
- ギャップ: テナント: tenant 0/2 · template OK

## Primary パス

| パス | 状態 |
|------|------|
| `data/sales/inbound/` | missing |
| `docs/sales/inbound/` | missing |

## 推奨 CLI

```bash
orgos agent pulse --agent sales_inbound
orgos agent readiness --agent sales_inbound
orgos route match --text "（sales_inbound 担当）"
```

## 根拠

- [sales_inbound_agent.md](../../../steward/core/agents/sales_inbound_agent.md)
- [agent-capability-manifest.yaml](../../../steward/core/agents/agent-capability-manifest.yaml)

*生成: orgos agent pulse · 2026-06-28T22:18:33.346Z*