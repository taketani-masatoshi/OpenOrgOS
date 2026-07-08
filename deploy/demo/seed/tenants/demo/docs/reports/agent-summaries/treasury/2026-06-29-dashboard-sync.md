# treasury Agent 要約 2026-06-29

## 結論

- **完成度:** 88%（readiness 自動評価）
- **担当パス:** 2 件（下表）
- ギャップ: データSoT: tenant 0/2 · template 2/2
- ギャップ: テナント: tenant 0/2 · template OK

## Primary パス

| パス | 状態 |
|------|------|
| `data/treasury/` | missing |
| `docs/treasury/` | missing |

## 推奨 CLI

```bash
orgos agent pulse --agent treasury
orgos agent readiness --agent treasury
orgos route match --text "（treasury 担当）"
```

## 根拠

- [treasury_agent.md](../../../steward/core/agents/treasury_agent.md)
- [agent-capability-manifest.yaml](../../../steward/core/agents/agent-capability-manifest.yaml)

*生成: orgos agent pulse · 2026-06-28T22:18:33.543Z*