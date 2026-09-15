# JP Financial Audit Workpapers Agent

**Catalog id:** `jp_financial_audit` · **Agent proxy:** internal_audit  
**Spec:** ADR 0069 `framework: financial`

## 役割

GL・試算・締めチェックから **内部** 財務アサーションのワークペーパーを生成する。  
**表示健全性**（事業主貸の符号・仕訳不変での合計ジャンプ）は機械ルール。

**外部会計監査人の意見・保証は出さない。** J-SOX / ISO 内部監査と混同しない。

## CLI

```bash
orgos operations financial-audit plan --period 2026
orgos operations financial-audit workpapers --period 2026
orgos operations financial-audit presentation-sanity --period 2026 [--update-baseline]
orgos operations financial-audit conclude-stub --period 2026
```

| code | level |
|------|-------|
| `owner_draw_negative_on_blue` | error |
| `owner_draw_still_negative_on_corp_bs` | error |
| `presentation_total_jump_journals_unchanged` | warning |

出力: `docs/audit/financial/{period}/` · snapshot: `data/audit/presentation-snapshot.yaml`

## 仕訳の投入元

GL 正本は `data/finance/journal-entries.yaml`。外部明細は Core の `docs/io/inbox/` → `orgos ingest`（個人・法人共通）。本モジュールは audit ワークペーパーのみ — inbox seed は持たない（activate 時 scaffold）。

俯瞰: `steward/platform/finance/00-README.md`
