# ADR 0032 — Amount-free Wire claim for QR receipts

- **Status:** Accepted
- **Date:** 2026-07-27
- **Context:** QR-signed JP receipts carry amount and line items for local verification, but inter-org Wire must not become an invoice settlement channel by accident.

## Context

Organizations need a cryptographically verifiable receipt (適格請求書) that claimants can ingest into expense claims. If Wire envelopes included amounts or lines, peers could treat Wire as a payment instruction bus and leak L1 finance detail across trust boundaries.

## Decision

1. **QR / signed payload** may include amounts, tax totals, and lines (local verify + PDF).
2. **Wire event `steward.receipt.claim.requested`** MUST carry only:
   - `receipt_id`
   - `receipt_digest`
   - `claim_key` (one-time)
3. Issuer approval (`approveReceiptClaim`) replies amount-free as well.
4. Issuer UI may show local totals for human judgment; those values MUST NOT be placed on Wire envelopes.

## Consequences

- Claimant expense posting uses the **locally verified** signed payload / snapshot, not Wire amounts.
- Issuer `POST /wire/v1/receipts/claim` **rejects** inbound payloads that carry amount/line fields (`amount_fields_forbidden`) — defense in depth beyond “sender only builds amount-free objects”.
- Expense ingest may **best-effort** POST a Wire claim; failure is recorded in notes without blocking local claim creation.
- Optional `fetch_url` re-fetches the online signed body before verify when present.
- Issuer UI may show local totals for human judgment; those values MUST NOT be placed on Wire envelopes.
- Public verify portal (`receipt.oorgos.org`) operates on the fragment payload and is independent of Wire.

## Related

- [receipt-qr-spec.md](../org-os/receipt-qr-spec.md)
- [expense-claim-spec.md](../org-os/expense-claim-spec.md)
- `src/lib/receipt-qr.ts` · `apps/steward-chat/src/ReceiptClaimPage.tsx`
