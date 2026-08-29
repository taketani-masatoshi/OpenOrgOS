# Skill: iso_internal_audit_run（ISO 内部監査ラン）

## 目的

有効 ISO の **control-map** を読み、証拠パスと成熟度を決定論検査する。結果は append-only ログに残す。規格ごとの監査 Agent は作らない。

## 入力

- `standards.yaml` の有効 ISO
- `steward/standards/iso/catalog.yaml`
- `steward/standards/iso/ISO-XXXX/control-map.yaml`
- `data/compliance/controls.yaml`

## 出力

- `data/compliance/iso-internal-audit.jsonl`（追記）
- `docs/audit/internal/latest-iso-audit.md`
- `docs/reports/agent-summaries/internal-audit/iso-audit-*.md`

## 使用 Agent

Internal Audit

## CLI

```bash
npm run orgos -- iso audit run
npm run orgos -- iso audit run --iso ISO-9001 --dry-run
npm run orgos -- skills run iso-internal-audit-run
```

## 禁止

- ISO 公式本文の都度解釈で仕組みを組み替える
- 監査対象の自己承認
- Compliance 規程本文の改定
- L2 値のログ・レポートへの転記
