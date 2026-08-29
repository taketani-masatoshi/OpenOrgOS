# Skill: iso_internal_audit_report（ISO 内部監査レポート）

## 目的

監査ログから経営向けレポートを出す。現状 · 問題点 · 課題 · 適合状況 · 改善提案。スナップショットの再計算ではなく、残したランを正本にする。

## 入力

- `data/compliance/iso-internal-audit.jsonl`

## 出力

- 標準出力の Markdown（任意で latest を再生成する場合は `iso audit run`）

## 使用 Agent

Internal Audit

## CLI

```bash
npm run orgos -- iso audit report
npm run orgos -- iso audit report --run-id IAR-...
npm run orgos -- skills run iso-internal-audit-report
```

## 禁止

- ログに無い適合判定を捏造する
- 証明書の発行
- L2 値の出力
