# medical_device_regulatory Agent 要約 2026-06-29

## 結論

- **完成度:** 88%（readiness 自動評価）
- **担当パス:** 3 件（下表）
- ギャップ: データSoT: tenant 0/3 · template 3/3
- ギャップ: テナント: tenant 0/3 · template OK

## Primary パス

| パス | 状態 |
|------|------|
| `data/medical-device/` | missing |
| `docs/medical-device/` | missing |
| `docs/quality/` | missing |

## 推奨 CLI

```bash
orgos agent pulse --agent medical_device_regulatory
orgos agent readiness --agent medical_device_regulatory
orgos route match --text "（medical_device_regulatory 担当）"
```

## 根拠

- [medical_device_regulatory_agent.md](../../../steward/core/agents/medical_device_regulatory_agent.md)
- [agent-capability-manifest.yaml](../../../steward/core/agents/agent-capability-manifest.yaml)

*生成: orgos agent pulse · 2026-06-28T22:18:33.567Z*