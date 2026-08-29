# ADR 0058: OrgOS Ledger 製品層（マネージド単一テナント）

**Status:** Accepted  
**Date:** 2026-08-25

## Context

- OpenOrgOS **Core** は組織間プロトコルであり SaaS 製品ではない（`docs/org-os/openorgos-core-philosophy.md`）。
- Steward 参照実装の GL・監査・Operator Console は **帳簿モジュール**として 90 点帯に到達した。
- 法人向けに **他社へ販売**するには、Core と分離した **製品層（Product Layer）** が必要。
- 日本法人向け販売では **電子帳簿保存法** が必須。e-Tax / 法定申告 XML は **別モジュール**（ADR 0052 ロードマップ）とする。

## Decision

1. **SKU 名:** `OrgOS Ledger` — 法人向けマネージド単一テナント会計。
2. **ホスティング:** 顧客 1 社 = `tenants/{id}` workspace + 専用コンテナ（共有マルチテナントは P3 以降）。
3. **正本:** 既存 YAML GL（`journal-entries.yaml`）を維持。製品層はプロビジョン・課金・UI シェル・コンプライアンス API を追加する。
4. **電子帳簿:** 製品必須機能。検索 API · 訂正削除履歴（逆仕訳）· 監査 trail · `orgos validate` ゲート。
5. **e-Tax:** `jp_tax_corporate` / Phase 5 モジュール。Ledger SKU の同梱必須条件にしない。
6. **文書正本:** `docs/product/`（販売 Runbook · セキュリティ · 価格 · 法務ドラフト）。

## Consequences

### Positive

- Core philosophy と矛盾せず、Implementation として販売可能。
- 既存 `operator-production.md` · Ledger API · `test:finance` を再利用。
- 電子帳簿を早期に製品ゲートに載せ、法人セールスのブロッカーを除去。

### Negative / Deferred

- Stripe 課金・セルフサインアップは P1。
- 共有コントロールプレーンは P3。
- タイムスタンプ局・スキャナ保存の外部連携は P2 以降（優良要件）。

## Related

- [docs/product/README.md](../product/README.md)
- [ADR 0041](0041-gl-native-ledger.md) · [ADR 0054](0054-period-lock-reverse-only.md)
- [ADR 0052](0052-tax-filing-phase5-deferred.md)（e-Tax defer）
