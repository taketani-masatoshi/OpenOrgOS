# ADR 0052: Tax Filing Phase 5 — e-Tax · Return XML · Lodging Ledger

**Status:** Accepted · **Date:** 2026-08-24 · **Updated:** 2026-09-21

## Context

税務モジュール 100 点化（Phase 0–4）完了後、`orgos tax readiness` は **申告準備基盤** の深度を測る。  
以下 3 件は **意図的に分母外**（ADR 0051 · `tax-filing-spec.md`）だが、第9期申告（2027-03-31）に向けたロードマップとして順序を固定する。

「OrgOS は e-Tax を実装しない」は **提出クライアントを作らない** という意味である。提出用データの出力と、公開仕様へのフォーマット準拠までを捨てる意味ではない。

## Decision

Phase 5 を **3 サブフェーズ** で defer し、トリガー条件を明文化する。

| サブ | 内容 | トリガー | 担当 |
|------|------|----------|------|
| **5a** | 会計 SoT 完成（試算表 · 仕訳 · 月次整合） | Phase 3 完了 · 税理士 B/S 確定 | Accounting |
| **5b** | 提出用データ出力（申告書 XML / 別表ドラフト · 公開仕様へのフォーマット寄せ） | **実装済（handoff ドラフト）** — `writeCorporateTaxXmlDraft` · 別表四/五相当の Completeness。公式スキーマ準拠は継続 | Dev + 税理士 |
| **5c** | e-Tax / eLTAX 本番提出（認証 · 署名 · 送信） | 5b + 代表/税理士署名 | 人間のみ |
| **5d** | 宿泊税 `obligation_rhythms` `from_ledger` | **実装済** — `lodgingTaxFromLedger` が `data/operations/lodging-tax.yaml` assessments を読む | Dev |

### 境界 — e-Tax を「実装しない」の意味

OrgOS は **e-Tax / eLTAX そのもの** を実装しない。提出の実行主体は税理士 / 代表。handoff は常に `submission: "not-for-etax"` を付ける。

| する（5b） | しない（5c） |
|------|------|
| e-Tax / eLTAX に提出するデータの出力（XML · 別表 · 添付パック） | e-Tax / eLTAX クライアント、ポータル、ログイン |
| 国税庁等が公開する提出データ仕様・API スキーマがある場合、**そのフォーマットに合わせる** | 電子証明書 · 電子署名 · 本番送信 API の呼び出し |
| 税理士が e-Tax クライアントへ取り込むファイルの生成 | OrgOS から税務署へ直接申告する経路 |

フォーマット準拠は「提出可能データの準備」であり、「提出の実行」ではない。送信エンドポイントを叩くことは、公式 API であっても 5c であり実装しない。

現行 `writeCorporateTaxXmlDraft` は OrgOS 内部ドラフト（`OrgOSCorporateTaxDraft`）である。公開仕様への寄せは 5b の継続作業であり、5c への進出ではない。

**OrgOS は 5c の実行を実装しない** — 提出は税理士ワークフロー外注。

## Lodging tax ledger（5d）

`tax-profile.obligation_rhythms` の `mode: from_ledger` は `data/operations/lodging-tax.yaml` の assessments（期間合計）を読む。氏名は出さない。

## Consequences

- `tax readiness` 100% は **5a 以前** で達成可能（ギャップ deferred · 機械 warning 解消）。
- 5b 以降は新指標 `tax filing export readiness`（将来 ADR）を検討 — 本 ADR では定義しない。
- mal `modules.yaml` JP tax 4 件有効化（Phase 4）は 5b の前提データ整備とは独立。
- 「e-Tax を実装しない」と書いてある箇所は、本境界（5c 禁止 · 5b 出力可）を指す。XML 出力まで捨てると読んではならない。

## Related

- ADR [0051-jp-tax-skills-cli-only.md](./0051-jp-tax-skills-cli-only.md) — Phase 2 完了（mal module 有効化）
- [tax-filing-spec.md](../org-os/tax-filing-spec.md)
