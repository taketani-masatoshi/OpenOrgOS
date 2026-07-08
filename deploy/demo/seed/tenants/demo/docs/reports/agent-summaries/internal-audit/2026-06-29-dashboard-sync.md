# internal_audit Agent 要約 2026-06-29

## 結論

- **完成度:** 84%（readiness 自動評価）
- **担当パス:** 3 件（下表）
- ギャップ: データSoT: tenant 0/3 · template 3/3
- ギャップ: テナント: tenant 0/3 · template OK

## Primary パス

| パス | 状態 |
|------|------|
| `data/compliance/` | missing |
| `docs/audit/internal/` | missing |
| `docs/compliance/` | missing |

## 推奨 CLI

```bash
orgos agent pulse --agent internal_audit
orgos agent readiness --agent internal_audit
orgos route match --text "（internal_audit 担当）"
```

## 根拠

- [internal_audit_agent.md](../../../steward/core/agents/internal_audit_agent.md)
- [agent-capability-manifest.yaml](../../../steward/core/agents/agent-capability-manifest.yaml)

*生成: orgos agent pulse · 2026-06-28T22:18:33.534Z*