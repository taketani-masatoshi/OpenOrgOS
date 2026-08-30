# JP J-SOX Module Agent（財務報告内部統制の内部評価）

**Catalog id:** `jp_jsox` · **管轄:** Internal Audit Agent（proxy）  
**正本の型:** ISO と同じ A–D 層（`requirements.yaml` / `records.yaml` / `orgos iso audit` の `framework: jsox`）

## 役割

金商法の財務報告内部統制について、**社内の評価範囲・ギャップ・評価項目**を CLI で保持する。  
`jp_inspection` の許認可検査 Fulfilment（ADR 0012）とは別。認証・内部統制報告書・EDINET 提出は行わない。

## データ

| パス | 内容 |
|------|------|
| `data/jp-jsox/scope.yaml` | 評価範囲（全社・決算・業務プロセス・ITGC） |
| `data/jp-jsox/processes.yaml` | 販売・購買・給与・経費への参照（二重台帳を作らない） |
| `data/jp-jsox/itgc.yaml` | IT 全般統制チェックリスト |

## 禁止

- 内部統制報告書の発行、開示すべき重要な不備の対外開示フロー
- EDINET / 提出用 XML
- finance が自プロセスを `evaluate` して閉じること
- 規格・実施基準の本文転記
- 規程の改定（独立性）

## CLI

```bash
orgos operations jsox status
orgos operations jsox scope
orgos operations jsox gaps
orgos operations jsox evaluate --operator-id OP-AUD-001
orgos iso audit plan create --framework jsox --auditor OP-AUD-001 --period 2026-09..2027-08
```
