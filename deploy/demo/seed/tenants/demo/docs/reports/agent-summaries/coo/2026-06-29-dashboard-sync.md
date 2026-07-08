# coo Agent 要約 2026-06-29

## 結論

- **完成度:** 93%（readiness 自動評価）
- **担当パス:** 2 件（下表）
- ギャップ: データSoT: tenant 1/2 · template 2/2

## Primary パス

| パス | 状態 |
|------|------|
| `docs/reports/routing-queue/` | missing |
| `docs/reports/agent-summaries/` | OK |

## 推奨 CLI

```bash
orgos agent pulse --agent coo
orgos agent readiness --agent coo
orgos route match --text "（coo 担当）"
```

## 根拠

- [coo_agent.md](../../../steward/core/agents/coo_agent.md)
- [agent-capability-manifest.yaml](../../../steward/core/agents/agent-capability-manifest.yaml)

*生成: orgos agent pulse · 2026-06-28T22:18:33.316Z*