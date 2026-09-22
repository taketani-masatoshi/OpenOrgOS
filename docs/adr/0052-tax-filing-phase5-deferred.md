# ADR 0052: Tax Filing Phase 5 — e-Tax · Return XML · Lodging Ledger

**Status:** Accepted · **Date:** 2026-08-24 · **Updated:** 2026-09-22

## Context

税務モジュール 100 点化（Phase 0–4）完了後、`orgos tax readiness` は **申告準備基盤** の深度を測る。  
以下 3 件は **意図的に分母外**（ADR 0051 · `tax-filing-spec.md`）だが、第9期申告（2027-03-31）に向けたロードマップとして順序を固定する。

## Decision

Phase 5 を **3 サブフェーズ** で defer し、トリガー条件を明文化する。

| サブ | 内容 | トリガー | 担当 |
|------|------|----------|------|
| **5a** | 会計 SoT 完成（試算表 · 仕訳 · 月次整合） | Phase 3 完了 · 税理士 B/S 確定 | Accounting |
| **5b** | 申告書 XML / 別表ドラフト生成 | **実装済（handoff のみ）** — `writeCorporateTaxXmlDraft` · 別表四/五相当の Completeness。e-Tax 送信はしない | Dev + 税理士 |
| **5c** | e-Tax / eLTAX 本番提出 | 認証済みの人間が電子証明書で公式エンドポイントへ送る | 人間のみ |
| **5d** | 宿泊税 `obligation_rhythms` `from_ledger` | **実装済** — `lodgingTaxFromLedger` が `data/operations/lodging-tax.yaml` assessments を読む | Dev |

**5c の提出境界。** クライアントは公式エンドポイント以外へ向けず、ソケットは開かない。**法定の 5c は未充足のまま**（公式受付番号がディスク上に無い）。製品側の拒否・採点・人間記録口は実装済み。自動試験は使い捨て gitignore ツリーだけで行う。ダミー申告で法定充足にしない。

- LLM と MCP は送信しない。
- Agent は承認も送信もしない。
- 送れるのは認証済みの人間だけで、電子証明書を使う。
- クライアントは公式ホスト（`https://www.e-tax.nta.go.jp` · `https://www.eltax.lta.go.jp`）だけを許可する。ソケットは開かない。
- 秘密鍵は結果にもログにも書かない。
- 申告 XML はオペレータが公式サイトから取得した XSD のローカルパス（`xsdPath`）で `xmllint --schema` が通るときだけ次段へ進む。`tests/fixtures` 配下は拒否（`xsd_invalid`）。著作権上再配布できない公式 XSD はリポジトリに vendoring しない。
- 公式の受付番号が無い応答は成功にしない。受付番号の偽造・fixture 形の見本を gitignore パスへ書くことはしない。
- 点数は項目ごとに全部か 0（法人 e-Tax 2 · 法人 eLTAX 2 · 個人 e-Tax 4 · 個人 eLTAX 4）。gitignore された `records/finance/official-filing-receipt.yaml` に、実提出由来の数字形受付番号があるときだけ付く。tracked の見本は数えない。
- 人間が公式サイトで受け取った番号の保存は `orgos tax record-official-receipt --i-recorded-from-official-site`（`recordOfficialFilingReceipt`）のみ。現状の点数確認は `orgos tax filing-score`。

## Lodging tax ledger（5d）

`tax-profile.obligation_rhythms` の `mode: from_ledger` は `data/operations/lodging-tax.yaml` の assessments（期間合計）を読む。氏名は出さない。

## Consequences

- `tax readiness` 100% は **5a 以前** で達成可能（ギャップ deferred · 機械 warning 解消）。
- 5b 以降は新指標 `tax filing export readiness`（将来 ADR）を検討 — 本 ADR では定義しない。
- mal `modules.yaml` JP tax 4 件有効化（Phase 4）は 5b の前提データ整備とは独立。

## Related

- ADR [0051-jp-tax-skills-cli-only.md](./0051-jp-tax-skills-cli-only.md) — Phase 2 完了（mal module 有効化）
- [tax-filing-spec.md](../org-os/tax-filing-spec.md)
