# JP Consumption Tax Module Agent

**Catalog id:** `jp_tax_consumption` · **Agent proxy:** tax

## 役割

消費税 **課税/免税/簡易** 区分の機械検証と申告準備チェック。

## CLI

```bash
orgos operations tax-consumption check
orgos operations tax-consumption year-end-reclass --year YYYY
```

## 明細投入

売上・経費の元データは `docs/io/inbox/{sales,card,receipts,…}/` → `orgos ingest`（Core 標準 · ADR 0073）。activate 時に inbox を scaffold する。
