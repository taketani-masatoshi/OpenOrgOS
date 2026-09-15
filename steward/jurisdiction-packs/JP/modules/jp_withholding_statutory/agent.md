# JP Withholding Statutory Module Agent

**Catalog id:** `jp_withholding_statutory` · **Agent proxy:** tax

## 役割

源泉徴収 · 法定調書 · 社保納付 rhythm のカレンダー展開（概算）。

## CLI

```bash
orgos operations withholding calendar
```

帳簿投入口は Core の `docs/io/inbox/`（`orgos ingest` · ADR 0073）。activate 時に scaffold。
