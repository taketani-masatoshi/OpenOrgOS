# ADR 0051: JP Tax Module Skills — CLI-Only Dispatch

**Status:** Accepted · **Date:** 2026-08-24

## Context

JP 税務モジュール 4 件（`jp_tax_corporate` · `jp_tax_consumption` · `jp_invoice_qualified` · `jp_withholding_statutory`）に 5 skill を module `skills/registry.yaml` + `skillHandlers` で配線した。

Steward Chat の command router は **module 未有効テナントでも** skill を一覧できる設計（`operator-commands/resolve.ts`）。JP tax module を mal の `modules.yaml` に登録していない状態で `chat.enabled: true` にすると、UI から invoke 可能だが tenant module gate で失敗する UX になる。

## Decision

1. **JP tax skill 5 件は `chat.enabled` を付けない** — 実行経路は `orgos skills run` · `orgos operations *` · `orgos tax *` のみ。
2. **実務深度指標**は `orgos agent readiness --agent tax`（構造）と **`orgos tax readiness`**（7 軸 · 申告準備深度）を分離する。
3. **インボイス skill 2 件**は `runTaxConsumptionCheck` の薄いラッパーにせず、`assessInvoiceRegistration` / `assessQualifiedInvoiceIssuance` を正本とする。

## Consequences

- Chat からの tax skill invoke は ~~Phase 2（module テナント有効化 + route テスト）まで defer~~ **mal `modules.yaml` 4 モジュール有効化済（2026-08-24）**。Chat `chat.enabled` は未付与。
- `agent-readiness` の tax 95% は registry 行数ベースのまま — **過大評価しない**ため `tax readiness` を併記する。
- 申告書 XML · e-Tax 提出は引き続きスコープ外（`tax-filing-spec.md`）。

## Related

- [tax-filing-spec.md](../org-os/tax-filing-spec.md)
- ADR [0046-tax-obligation-rhythm-engine.md](./0046-tax-obligation-rhythm-engine.md)
