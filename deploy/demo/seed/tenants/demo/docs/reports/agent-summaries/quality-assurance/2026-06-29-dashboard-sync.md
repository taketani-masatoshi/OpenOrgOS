# quality_assurance Agent 要約 2026-06-29

## 結論

- **完成度:** 88%（readiness 自動評価）
- **担当パス:** 3 件（下表）
- ギャップ: データSoT: tenant 0/3 · template 3/3
- ギャップ: テナント: tenant 0/3 · template OK

## Primary パス

| パス | 状態 |
|------|------|
| `data/quality/` | missing |
| `docs/quality/` | missing |
| `docs/compliance/iso/` | missing |

## 推奨 CLI

```bash
orgos agent pulse --agent quality_assurance
orgos agent readiness --agent quality_assurance
orgos route match --text "（quality_assurance 担当）"
```

## 根拠

- [quality_assurance_agent.md](../../../steward/core/agents/quality_assurance_agent.md)
- [agent-capability-manifest.yaml](../../../steward/core/agents/agent-capability-manifest.yaml)

*生成: orgos agent pulse · 2026-06-28T22:18:33.563Z*