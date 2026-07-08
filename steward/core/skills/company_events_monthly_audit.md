# Skill: company_events_monthly_audit（月次監査 · 人間通知）

## 目的

月次監査として以下を一括実行し、人間（CEO / 監査責任者）へ通知する。

1. ハッシュチェーン整合検証
2. 当月の週次 attestation 件数・署名検証
3. 所見レポート MD 生成
4. webhook / OpenWebUI へ `company_events_monthly_audit` イベント送信

## 入力

- `data/company-events-chain.jsonl`
- `data/company-events-attestations.jsonl`
- `data/company-events.yaml`

## 出力

- `docs/reports/agent-summaries/records-audit/monthly-audit-{YYYY-MM}.md`
- 通知: `steward/platform/notifications/registry.yaml` の `company_events_monthly_audit`

## 使用 Agent

Records Audit Agent — **推奨: 毎月 1 回**

Agent（LLM）は本 Skill 実行後、レポートを読み Executive 向け要約を追記してもよい（任意 · `runtime: agent` 拡張）。

## CLI

```bash
npm run orgos -- events audit monthly
npm run orgos -- events audit monthly --month 2026-06
npm run orgos -- skills run company-events-monthly-audit
```

## runtime

`cli` — コア処理は LLM 不要

## 禁止

- 検証失敗を PASS として報告
- L2/L3 をレポートに転記
