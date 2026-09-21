# ADR 0052: Tax Filing Phase 5 — e-Tax · Return XML · Lodging Ledger

**Status:** Accepted · **Date:** 2026-08-24 · **Updated:** 2026-09-21

## Context

税務モジュール 100 点化（Phase 0–4）完了後、`orgos tax readiness` は **申告準備基盤** の深度を測る。  
以下 3 件は **意図的に分母外**（ADR 0051 · `tax-filing-spec.md`）だが、第9期申告（2027-03-31）に向けたロードマップとして順序を固定する。

「OrgOS は e-Tax を実装しない」は **e-Tax ポータルそのものを自前実装しない** という意味である。内部の決算・税務申告書を正本に、e-Tax 形式 / API 連携形式まで整備し、ユーザ承認後に外部送信することは製品範囲である。

## Decision

Phase 5 を **3 サブフェーズ** で defer し、トリガー条件を明文化する。

| サブ | 内容 | トリガー | 担当 |
|------|------|----------|------|
| **5a** | 会計 SoT 完成（試算表 · 仕訳 · 月次整合） | Phase 3 完了 · 税理士 B/S 確定 | Accounting |
| **5b** | 提出用データ出力（内部決算・申告書を正本に、e-Tax / API 形式へ寄せる） | **実装済（handoff ドラフト）** — `writeCorporateTaxXmlDraft` · 別表四/五相当の Completeness。公式スキーマ準拠は継続 | Dev + 税理士 |
| **5c** | e-Tax / eLTAX 外部送信（ユーザ承認後） | 5b + HumanApprovalContext（代表 / 承認者） | 人間承認 + OrgOS 送信経路 |
| **5d** | 宿泊税 `obligation_rhythms` `from_ledger` | **実装済** — `lodgingTaxFromLedger` が `data/operations/lodging-tax.yaml` assessments を読む | Dev |

### 境界 — e-Tax を「実装しない」の意味

OrgOS は **e-Tax / eLTAX ポータルそのもの**（独自のログイン画面 · 証明書ストアの再実装）を作らない。提出データの正本は内部の決算・税務申告書である。送信はユーザ承認をゲートにする（ADR 0038 HumanApprovalContext）。LLM / MCP は承認を実行しない。

| する | しない |
|------|------|
| 内部の決算・税務申告書を参照した提出用データの出力（XML · 別表 · 添付パック） | 内部正本と無関係な申告データの invent |
| 公開された提出データ仕様・API スキーマへのフォーマット準拠 | e-Tax / eLTAX ポータルの自前再実装 |
| ユーザ（代表 / 承認者）承認後の外部送信 | 承認を経ない自動送信 |
| 税理士が検算・取り込むファイルの生成 | LLM / MCP 名義での送信 |

現行 `writeCorporateTaxXmlDraft` は OrgOS 内部ドラフト（`OrgOSCorporateTaxDraft`、`submission: "not-for-etax"`）である。公開仕様への寄せは 5b の継続作業。承認後送信の実装は 5c であり、handoff が未承認のまま送信してはならない。

## Lodging tax ledger（5d）

`tax-profile.obligation_rhythms` の `mode: from_ledger` は `data/operations/lodging-tax.yaml` の assessments（期間合計）を読む。氏名は出さない。

## Consequences

- `tax readiness` 100% は **5a 以前** で達成可能（ギャップ deferred · 機械 warning 解消）。
- 5b 以降は新指標 `tax filing export readiness`（将来 ADR）を検討 — 本 ADR では定義しない。
- mal `modules.yaml` JP tax 4 件有効化（Phase 4）は 5b の前提データ整備とは独立。
- 製品 SKU は「提出を含まない」とは書かない。書くなら「内部正本 → 形式整備 → 承認後送信。自動送信はしない」。
- テナント YAML / 税務メモはモジュールを検証するためのフィクスチャである。境界の正本は `jp_tax_corporate` と `src/lib/tax/etax-filing-boundary.ts` であり、テナント文面で実装を歪めない。

## Related

- ADR [0051-jp-tax-skills-cli-only.md](./0051-jp-tax-skills-cli-only.md) — Phase 2 完了（mal module 有効化）
- ADR [0038-human-approval-context.md](./0038-human-approval-context.md) — 5c の承認ゲート
- [tax-filing-spec.md](../org-os/tax-filing-spec.md)
