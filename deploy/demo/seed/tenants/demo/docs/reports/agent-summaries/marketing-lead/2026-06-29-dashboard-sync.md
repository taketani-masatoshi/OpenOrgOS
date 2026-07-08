# marketing_lead Agent 要約 2026-06-29

## 結論

- **完成度:** 88%（readiness 自動評価）
- **担当パス:** 2 件（下表）
- ギャップ: データSoT: tenant 0/2 · template 2/2
- ギャップ: テナント: tenant 0/2 · template OK

## Primary パス

| パス | 状態 |
|------|------|
| `data/marketing/` | missing |
| `docs/marketing/` | missing |

## 推奨 CLI

```bash
orgos agent pulse --agent marketing_lead
orgos agent readiness --agent marketing_lead
orgos route match --text "（marketing_lead 担当）"
```

## 根拠

- [marketing_lead_agent.md](../../../steward/core/agents/marketing_lead_agent.md)
- [agent-capability-manifest.yaml](../../../steward/core/agents/agent-capability-manifest.yaml)

*生成: orgos agent pulse · 2026-06-28T22:18:33.354Z*