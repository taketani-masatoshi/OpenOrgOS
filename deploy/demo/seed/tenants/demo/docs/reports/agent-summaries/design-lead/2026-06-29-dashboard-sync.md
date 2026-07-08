# design_lead Agent 要約 2026-06-29

## 結論

- **完成度:** 88%（readiness 自動評価）
- **担当パス:** 1 件（下表）
- ギャップ: データSoT: tenant 0/1 · template 1/1
- ギャップ: テナント: tenant 0/1 · template OK

## Primary パス

| パス | 状態 |
|------|------|
| `docs/design/` | missing |

## 推奨 CLI

```bash
orgos agent pulse --agent design_lead
orgos agent readiness --agent design_lead
orgos route match --text "（design_lead 担当）"
```

## 根拠

- [design_lead_agent.md](../../../steward/core/agents/design_lead_agent.md)
- [agent-capability-manifest.yaml](../../../steward/core/agents/agent-capability-manifest.yaml)

*生成: orgos agent pulse · 2026-06-28T22:18:33.329Z*