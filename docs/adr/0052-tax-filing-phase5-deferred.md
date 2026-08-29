# ADR 0052: Tax Filing Phase 5 — e-Tax · Return XML · Lodging Ledger

**Status:** Accepted · **Date:** 2026-08-24 · **Updated:** 2026-08-29

## Context

税務モジュール 100 点化（Phase 0–4）完了後、`orgos tax readiness` は **申告準備基盤** の深度を測る。  
以下 3 件は **意図的に分母外**（ADR 0051 · `tax-filing-spec.md`）だが、第9期申告（2027-03-31）に向けたロードマップとして順序を固定する。

## Decision

Phase 5 を **3 サブフェーズ** で defer し、トリガー条件を明文化する。

| サブ | 内容 | トリガー | 担当 |
|------|------|----------|------|
| **5a** | 会計 SoT 完成（試算表 · 仕訳 · 月次整合） | Phase 3 完了 · 税理士 B/S 確定 | Accounting |
| **5b** | 申告書 XML / 別表ドラフト生成 | **実装済（handoff のみ）** — `writeCorporateTaxXmlDraft` · 別表四/五相当の Completeness。e-Tax 送信はしない | Dev + 税理士 |
| **5c** | e-Tax / eLTAX 本番提出 | 5b + 代表/税理士署名 | 人間のみ |
| **5d** | 宿泊税 `obligation_rhythms` `from_ledger` | **実装済** — `lodgingTaxFromLedger` が `data/operations/lodging-tax.yaml` assessments を読む | Dev |

**OrgOS は 5c の実行を実装しない** — 提出は税理士ワークフロー外注。

## Lodging tax ledger（5d）

`tax-profile.obligation_rhythms` の `mode: from_ledger` は `data/operations/lodging-tax.yaml` の assessments（期間合計）を読む。氏名は出さない。

## Consequences

- `tax readiness` 100% は **5a 以前** で達成可能（ギャップ deferred · 機械 warning 解消）。
- 5b 以降は新指標 `tax filing export readiness`（将来 ADR）を検討 — 本 ADR では定義しない。
- mal `modules.yaml` JP tax 4 件有効化（Phase 4）は 5b の前提データ整備とは独立。

## Related

- ADR [0051-jp-tax-skills-cli-only.md](./0051-jp-tax-skills-cli-only.md) — Phase 2 完了（mal module 有効化）
- [tax-filing-spec.md](../org-os/tax-filing-spec.md)
