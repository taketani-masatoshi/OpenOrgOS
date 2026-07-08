# corporate_development Agent 要約 2026-06-29

## 結論

- **完成度:** 88%（readiness 自動評価）
- **担当パス:** 2 件（下表）
- ギャップ: データSoT: tenant 0/2 · template 2/2
- ギャップ: テナント: tenant 0/2 · template OK

## Primary パス

| パス | 状態 |
|------|------|
| `data/corp-dev/` | missing |
| `docs/corp-dev/` | missing |

## 推奨 CLI

```bash
orgos agent pulse --agent corporate_development
orgos agent readiness --agent corporate_development
orgos route match --text "（corporate_development 担当）"
```

## 根拠

- [corporate_development_agent.md](../../../steward/core/agents/corporate_development_agent.md)
- [agent-capability-manifest.yaml](../../../steward/core/agents/agent-capability-manifest.yaml)

*生成: orgos agent pulse · 2026-06-28T22:18:33.559Z*