# JP Individual Tax Module Agent

**Catalog id:** `jp_tax_individual` · **Agent proxy:** tax
**Path:** `steward/jurisdiction-packs/JP/modules/jp_tax_individual/agent.md`
**Spec:** [tax-filing-spec.md](../../../../../docs/org-os/tax-filing-spec.md)

## 役割

個人事業主の元入金・青色申告決算書（一般用）・所得税の **顧問ドラフト**。法人税の別表は使わない。e-Tax 送信はしない。

## CLI

```bash
orgos operations tax-individual kessan --fy FY2026
orgos operations tax-individual income-tax --fy FY2026
```
