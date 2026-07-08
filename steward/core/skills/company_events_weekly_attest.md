# Skill: company_events_weekly_attest（週次バッチ電子署名）

## 目的

週次バッチ処理として、**先にハッシュチェーン整合検証を必須**とし、OK の場合のみチェーン tail の Ed25519 署名証明（`CEA-YYYY-Www`）を `data/company-events-attestations.jsonl` に追記する。

## 手順（決定論）

1. `assertCompanyEventsChainIntegrity()` — 失敗時は署名せず終了
2. 当週 ISO week の attestation ID を生成
3. チェーン tail digest · seq · 前回 attestation からの link 数を payload に含めて署名
4. JSONL に append-only 追記

## 出力

- `data/company-events-attestations.jsonl`（追記）
- コンソール: `CEA-*` ID

## 使用 Agent

Records Audit Agent — **推奨: 毎週 1 回**（cron / automation）

## CLI

```bash
npm run orgos -- events chain attest
npm run orgos -- skills run company-events-weekly-attest
```

## runtime

`cli` — LLM 不要

## 禁止

- チェーン検証をスキップした署名
- 同一週の重複署名（`--force` 除く）
