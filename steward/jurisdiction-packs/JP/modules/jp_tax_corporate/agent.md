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
| `data/finance/journal-entries.yaml` | 複式仕訳正本（投入は `orgos ingest`） |
| `docs/io/inbox/{bank,card,…}/` | 明細・証憑投入（個人・法人共通 · ADR 0073） |
| `docs/company/tax/**` | 申告ドラフト |

## 明細投入（帳簿インプット）

投入口は個人青色と同じ Core 標準。モジュール seed に inbox を重複しない。

```bash
orgos ingest scaffold
orgos ingest scan --write
orgos ingest parse --source bank --write
orgos ingest classify --write
orgos ingest post --batch <id> --write
```

俯瞰: `steward/platform/finance/00-README.md`

## CLI

```bash
orgos operations tax-corporate calendar
orgos operations tax-corporate gaps
orgos operations tax-corporate depreciation
```
