# ADR 0066 — ISO 内部監査は単一 Agent が control-map を読む

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** OpenOrgOS maintainers

## Context

ISO パックはテンプレと一部の control-map まであった。内部監査 Agent はカタログ上の定義とスコープ Skill のみで、検査・監査ログ・経営レポートの環が無かった。規格ごとに監査 Agent を増やす案は、独立性と保守を壊す。

ISO 公式本文をランタイムが都度「理解」すると、文書化情報の版と再現性が消える。

## Decision

1. **機械可読の正本は `steward/standards/iso/catalog.yaml` + 各 `control-map.yaml`。** 公式規格書の全文はリポジトリに置かない。
2. **監査 Agent は `internal_audit` のみ。** 有効 ISO を順に読む。9001 / 27001 用の監査 Agent は作らない。現場 Agent（quality_assurance · security 等）は 1 線のまま。
3. **ランは append-only**（`data/compliance/iso-internal-audit.jsonl`）。経営レポートはログの投影であり、その場の再解釈ではない。
4. 検査は決定論（成熟度 · 証拠パス · 規程有効）。LLM は説明下書きに限る。証明書は出さない。
5. Compliance の `iso_control_review` は 2 線のスナップショットとして残す。3 線の実施は `iso audit run`。

## Consequences

### Positive

- 運用の副産物として L3 材料（監査実施記録）が残る
- 規格追加は catalog + control-map であり、Agent 増殖ではない

### Negative / risks

- HLS マップは Annex SL 共通条項まで。全文適合の主張はしない
- ログは gitignore。テナント workspace の耐久性に依存する

## Related

- [0024-core-governance-principles-iso-37000.md](0024-core-governance-principles-iso-37000.md)
- `orgos iso audit run` · `steward/core/agents/internal_audit_agent.md`
