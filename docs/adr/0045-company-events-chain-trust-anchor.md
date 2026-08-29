# ADR 0045: Company Events Chain Trust Anchor

**Status:** Accepted  
**Date:** 2026-08-24  
**Context:** [company-events-requirements.md](../spec/company-events-requirements.md) · [records_audit_agent.md](../../steward/core/agents/records_audit_agent.md)

## Context

会社イベント台帳は append-only ハッシュチェーン（`company-events-chain.jsonl`）と週次 Ed25519 バッチ署名（`company-events-attestations.jsonl`）で真正性を担保する。`records_audit` Agent が監視する。

2026-08 監査で以下の弱点が判明した:

1. **Attestation 自己参照** — 検証がレコード内 `public_key` のみを信頼し、正本 `company-events-signing-meta.yaml` と未連動。`attestations.jsonl` を書ける者が全履歴を再署名可能。
2. **Payload 意味検証欠落** — チェーン link の `payload_digest` が台帳フィールド（title/kind/status）と照合されず、台帳改竄が検出されない。
3. **Write guard 隙間** — attestations / witness-pin / signing-meta が保護外。
4. **運用ギャップ** — pulse 鮮度未実装、定期 pipeline 未接続、テナント roster 未有効化。

OrgOS の監査哲学（Event First · Immutable · Deterministic）は [engineering/08-event-sourcing.md](../../steward/rules/engineering/08-event-sourcing.md) が正本。

## Decision

### 1. 内部トラストアンカー（v2 signing meta）

`company-events-signing-meta.yaml` を v2 形式とする:

```yaml
version: 2
purpose: company_events_attestation
active: { key_id, public_key, activated_at }
history: [{ key_id, public_key, activated_at, retired_at }]
```

- `key_id` = SPKI DER の SHA-256 先頭 16 hex
- Attestation 検証は **meta の active + history の公開鍵集合** のみを trusted とする
- 週次 attestation は `prev_attestation_id` で連鎖し、`verifyAttestationSequence` が tail 単調性 · links_since_prev · fork を検証
- 新規 attestation は `key_id` を含む（legacy は warn · `--strict-legacy` で error）
- 鍵ローテ: `orgos events chain rotate-key`（ceo + `events:write` + audit log `events_signing_key_rotate`）

### 2. 台帳クロスチェック強化

`crossCheckChainWithRegistry` で create/void/status link の `payload_digest` を台帳から再計算照合。内部整合に link_id · recorded_at 単調性 · genesis · corrupt JSONL 行検知を追加。

### 3. 移行と export

- `orgos events chain migrate` — registry v3 + signing-meta v2（`--dry-run` 可）
- `orgos events chain export --out <dir>` — 第三者検証 bundle（`verify-bundle.mjs` · L2 除外）

### 4. 運用

- `pipeline run weekly` → `events chain attest`
- `pipeline run monthly` → `events audit monthly`
- `agent pulse` が `pulse_checks.freshness` を消費（週次 ≤8日 · 月次 ≤35日）
- `records_audit` を operational roster に追加

### 5. 明示的に採用しないもの（将来）

- Witness Hub quorum による chain tail 相互証明
- RFC3161 外部 TSA アンカー

## Consequences

### Positive

- 内部者による attestation 全履歴再署名が検出可能
- 台帳フィールド改竄がチェーン verify で FAIL
- 第三者が bundle 単体で再検証可能
- records_audit の運用が pipeline / pulse と接続

### Negative / Limits

- 正本鍵ファイル（`data/.orgos/company-events-signing.pem`）の保護は依然テナント OS 依存 — 自己署名モデルの限界
- Legacy attestation（`key_id` なし）は移行完了まで warn
- Weekly/monthly pipeline は `events:write` 必須 — cron 実行時は operator 認証が必要

## Related

- FR-30–37: [company-events-requirements.md](../spec/company-events-requirements.md)
- Event sourcing: [engineering/08-event-sourcing.md](../../steward/rules/engineering/08-event-sourcing.md)
- Business vs compliance fulfilment: [0012-business-vs-compliance-fulfilment.md](0012-business-vs-compliance-fulfilment.md)
- Runbook: [records-audit-runbook.md](../org-os/records-audit-runbook.md)
