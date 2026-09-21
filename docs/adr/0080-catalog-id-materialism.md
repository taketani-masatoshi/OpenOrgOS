# ADR 0080 — カタログ id は実体のあるものだけ置く

- **Status:** Accepted
- **Date:** 2026-09-21
- **Deciders:** OrgOS maintainers

## Context

`CORE_BUSINESS_MODULE_IDS`（`schemas/modules/core-ids.ts`）は 30 件だが、実体のあるモジュールは 25 件しかない。`listCoreCatalogModuleIds()` は `agent.md` の存在を条件にするため、残り 5 件はカタログに載らず、テナントが `modules.yaml` で有効化することもできない。

2026-09-21 時点の実測:

| id | 実体 | ほかに存在するもの |
|----|------|--------------------|
| `pdf_esign` | manifest なし · `agent.md` なし | `schemas/pdf-esign.ts` · `src/lib/pdf-esign/` · module `cli/register.ts`（`src/lib/module-cli.ts` が import 済み）· docs 3 本 · [0014](0014-pdf-esign-national-eid.md) |
| `org_pdf_sign` | ディレクトリなし | `schemas/org-pdf-sign.ts` のみ（lib · CLI なし） |
| `document_attestation` | ディレクトリなし | `schemas/document-attestation.ts` · `src/lib/protocol/registry.ts` に `steward.document_attestation` として登録済み |
| `iso_cms` | ディレクトリなし | `steward/standards/iso/catalog.yaml` |
| `receipt_qr` | ディレクトリなし | `src/lib/receipt-qr.ts` · `src/commands/receipt.ts` · `tests/receipt-qr.test.ts` ＋ベクタ fixture · `docs/org-os/receipt-qr-spec.md` · [0032](0032-amount-free-receipt-wire-claim.md) |

5 件のいずれも、どのテナントの `modules.yaml` でも有効化されていない。

`pdf_esign` `org_pdf_sign` `document_attestation` は実質「PDF 署名・証明」という 1 ドメインを 3 つの id で指している。関心事の正本は 1 つという原則に反する。

## Decision

1. **`pdf_esign` を実体化する。** `module.manifest.yaml` と `agent.md` を追加し、カタログに載せる。schema · lib · module CLI は既にあるため、追加は 2 ファイル。PDF 署名・証明ドメインの正本はこの id とする。
2. **`org_pdf_sign` を `CORE_BUSINESS_MODULE_IDS` から外す。** schema だけで lib も CLI もない。`schemas/org-pdf-sign.ts` は型として残し、正本は `pdf_esign` に寄せる。
3. **`document_attestation` に business module id を置かない。** 正本は protocol 面（`src/lib/protocol/registry.ts` の `steward.document_attestation`）。`agent.md` を作ると家が 2 つになる。
4. **`iso_cms` を外す。** ISO の正本は `steward/standards/iso/catalog.yaml` と既存の ISO 面（[0066](0066-iso-internal-audit-control-maps.md) · [0067](0067-iso-common-core-and-roadmap.md) · [0068](0068-iso-conformity-depth.md)）。
5. **`receipt_qr` を外す。** 実装はコア面として完成している。将来の物理コード面（署名コードの発行・スキャン台帳）を作る場合は、`src/lib/receipt-qr.ts` の署名機構を再利用する新しい面として設計し、この id を復活させない。
6. **id を外すときは同時に整理する。** `schemas/modules/core-ids.ts` · `src/lib/modules.ts` の `MODULE_TO_CLASSIFICATION_AGENT` · `steward/modules/readiness.yaml` を一度に直し、テナント `modules.yaml` で未使用であることを確認してから外す。
7. **今後、実体のない id を `CORE_BUSINESS_MODULE_IDS` に先置きしない。** 予約したい場合は ADR に書く。型は実装の予告ではなく、現在ある面の一覧とする。

## Consequences

- カタログ id 30 件は 26 件になる（25 ＋ 実体化する `pdf_esign`）。`orgos modules check --all` の対象と一致する。
- `moduleAgentId` の enum から 4 件消えるため、参照箇所（`MODULE_TO_CLASSIFICATION_AGENT`）の型エラーで漏れを検出できる。
- テナント側の影響はない。5 件はどこでも有効化されていない。
- PDF 署名・証明の議論が 1 つの id に集まる。

## Related

- [0079](0079-module-ai-permission-declaration.md) — AI 権限の宣言
- [0014](0014-pdf-esign-national-eid.md) — PDF e-sign と国民 eID
- [0032](0032-amount-free-receipt-wire-claim.md) — 金額を載せない receipt Wire claim
