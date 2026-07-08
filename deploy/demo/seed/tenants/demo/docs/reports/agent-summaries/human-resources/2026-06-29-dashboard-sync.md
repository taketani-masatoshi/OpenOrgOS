# human_resources Agent 要約 2026-06-29

## 結論

- **完成度:** 93%（readiness 自動評価）
- **担当パス:** 2 件（下表）
- ギャップ: データSoT: tenant 1/2 · template 2/2

## Primary パス

| パス | 状態 |
|------|------|
| `data/hr/` | OK |
| `docs/company/hr/` | missing |

## 推奨 CLI

```bash
orgos agent pulse --agent human_resources
orgos agent readiness --agent human_resources
orgos route match --text "（human_resources 担当）"
```

## 根拠

- [human_resources_agent.md](../../../steward/core/agents/human_resources_agent.md)
- [agent-capability-manifest.yaml](../../../steward/core/agents/agent-capability-manifest.yaml)

*生成: orgos agent pulse · 2026-06-28T22:18:33.380Z*