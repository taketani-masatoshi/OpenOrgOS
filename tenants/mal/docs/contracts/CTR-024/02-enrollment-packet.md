# 【法務デモ】CTR-024 加入手続キット

> **台帳:** [`CTR-024.yaml`](../../../data/contracts/CTR-024.yaml) · **草案:** [01-draft.md](01-draft.md)  
> **Owner:** Contract Agent · [DEMO-canvas-pack.md](../DEMO-canvas-pack.md)

## チェックリスト

- [ ] 物件図面・用途確認（PROP-001 · デモ）
- [ ] 見積依頼状送付
- [ ] 保険料・免責合意
- [ ] 証券 PDF を Zone C / 保管場所へ（実値は L2 · 本デモでは保管しない）
- [ ] 台帳 `executed` へ transition

完了後:

```bash
ORGOS_TENANT=mal orgos contracts transition --id CTR-024 --stage executed
ORGOS_TENANT=mal orgos canvas present --suite contract
```
