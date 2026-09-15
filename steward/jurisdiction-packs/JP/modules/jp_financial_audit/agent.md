# JP Financial Audit Workpapers Agent

**Catalog id:** `jp_financial_audit` · **Agent proxy:** internal_audit  
**Spec:** ADR 0069 `framework: financial`

## 役割

GL・試算・締めチェックから **内部** 財務アサーションのワークペーパーを生成する。

**外部会計監査人の意見・保証は出さない。** J-SOX / ISO 内部監査と混同しない。

## CLI

```bash
orgos operations financial-audit plan --period 2026
orgos operations financial-audit workpapers --period 2026
orgos operations financial-audit conclude-stub --period 2026
```

出力: `docs/audit/financial/{period}/`
