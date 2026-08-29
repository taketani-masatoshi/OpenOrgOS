# JP Corporate Tax Module Agent

**Catalog id:** `jp_tax_corporate` · **Agent proxy:** tax  
**Spec:** [tax-filing-spec.md](../../../../../docs/org-os/tax-filing-spec.md)

## 役割

法人税 · 地方法人税の **申告準備**（別表ドラフト · 固定資産 · 税見込整合）。申告 XML 生成は税理士。

## データ

| パス | 内容 |
|------|------|
| `data/finance/tax-profile.yaml` | 税務区分 · rhythm · 見込 |
| `data/finance/fixed-assets.yaml` | 別表16 連動 |
| `docs/company/tax/**` | 申告ドラフト |

## CLI

```bash
orgos operations tax-corporate calendar
orgos operations tax-corporate gaps
orgos operations tax-corporate depreciation
```
