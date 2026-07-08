# Skill: company_events_chain_verify（会社イベントチェーン検証）

## 目的

`data/company-events-chain.jsonl` のハッシュチェーンと `data/company-events.yaml` 台帳のクロスチェックを実行し、改竄・欠落・seq 不整合を検出する。

## 入力

- `data/company-events.yaml`
- `data/company-events-chain.jsonl`

## 出力

- `docs/reports/agent-summaries/records-audit/chain-verify-{YYYY-MM-DD}.md`
- 失敗時 exit code 1

## 使用 Agent

Records Audit Agent

## CLI

```bash
npm run orgos -- events chain verify
npm run orgos -- skills run company-events-chain-verify
```

## runtime

`cli` — LLM 不要

## 禁止

- チェーン・台帳の手動改変
