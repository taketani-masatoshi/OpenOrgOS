# Skill: iso_audit_brief（監査ブリーフィング）

要求事項の言い換え、事前検査ギャップ、記録の message から「何を見ればよいか」を出す。**判定しない。** ISO 本文は引用しない。

```bash
npm run orgos -- iso audit brief --plan IAP-001 --req REQ-21401-6.1-a
npm run orgos -- skills run iso-audit-brief
```

ローカル LLM は情報不足なら `ERROR:` 1行（ADR 0061）。verdict を書いてはならない。
