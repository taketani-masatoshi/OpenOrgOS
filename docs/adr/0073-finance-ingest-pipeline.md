# ADR 0073: Finance drop-folder ingest pipeline

## Status

Accepted · 2026-09-15 · Hardened 2026-09-16

## Context

Sole-prop and ledger demos needed a clear place to drop bank / card / Suica / PayPay / Amazon / sales / receipt inputs and turn them into journal entries, then PL/BS and tax drafts. PDF text extraction was intentionally out of scope (no new dependencies; `pdfkit` remains generate-only). Existing pieces: `docs/io/inbox` + `document-io.yaml`, bank CSV import (`jp_bank_corporate`), and `appendJournalEntry`.

Corporate modules (`jp_tax_corporate`, `jp_bank_corporate`, `jp_financial_audit`, …) must not invent a second inbox layout. Folder structure should be Core-standard for both entity forms.

## Decision

1. Extend inbox categories: `bank`, `card`, `transit`, `wallet`, `marketplace`, `sales` (plus existing `receipts`, `contracts`).
2. Add core CLI `orgos ingest {status|scaffold|scan|parse|classify|review|post}` with staging at `data/finance/ingest-staging.yaml` and rules at `data/finance/ingest-rules.yaml`.
3. Accept CSV/TSV/MD/TXT/JSON only; `.pdf` fails parse with guidance to convert externally. CSV bytes use UTF-8 with Shift_JIS fallback (`decodeBankCsvBytes`).
4. Journal post requires explicit `--write` and uses `source.kind: ingest` with row fingerprint for idempotency. Fingerprint is content-based (no file path); optional `reference` disambiguates.
5. Reuse shared CSV parser under `src/lib/finance/ingest/csv.ts` for bank import and ingest adapters.
6. Contracts are registered/reviewed but not auto-journaled.
7. **Module standard (shared scaffold):**
   - Template SSOT: `steward/platform/finance/ingest-inbox/` (category READMEs). Sync to `_template` via `scripts/sync-finance-ingest-inbox.ts`.
   - `ensureFinanceIngestInboxScaffold()` from `tenant scaffold-docs`, Ledger provision, `orgos ingest scaffold|scan`, and `modules activate` for finance-related modules. **`ingest status` is read-only** (no scaffold side effect).
   - Do **not** duplicate inbox trees in each module `seed/`.
8. **Entity branching:** sole proprietorship may post `business_pct < 100` to owner-draw `3210` and redirect asset-band outflows to `sole-prop-blue expense-intake`. Corporate entities reject `business_pct ≠ 100` and redirect asset-band to fixed-asset / accounting review notes (no sole-prop CLI).
9. **CoA preflight + atomic post:** unknown accounts or period-lock failures abort the whole batch (no journals written). Mid-append failures after successful preflight remain rare partials.
10. **Bank path:** `orgos ingest post` for `source_kind=bank` writes journals **and** upserts `bank-statements.yaml` (`source_file_fingerprint` + `ingest_batch_id`). `jp bank statement import` remains statements-only; validate warns on dual coverage of the same file.
11. **Classification:** broad `source_kind`-only rules require `allow_broad: true`. Default examples use `contains` anchors (no card/bank catch-all → 5280).
12. **Inbox lifecycle:** when all batch rows are terminal (`posted`/`skipped`, or contracts `needs_review`), mark matching `document-io` inbox item `done`.
13. **Occurred_at:** `dateToJournalOccurredAt` = calendar date at 12:00 JST (`T03:00:00.000Z`).
14. **Product surface:** CLI + `orgos validate` ingest integrity + read-only `GET /chat/v1/finance/ingest` (counts / needs_review ids · no amounts/payees). No write UI.
15. **Demo:** tracked example at `tenants/klab/docs/io/examples/` — copy into `inbox/card/` before ingest (raw inbox CSV stays gitignored).

## Consequences

- Humans own PDF→CSV/MD conversion and classification rule maintenance.
- After post, sole-prop uses `sole-prop-blue books|kessan|handoff`; corporate uses tax-corporate / bank / financial-audit CLIs on the same journal SSOT.
- Overview: `steward/platform/finance/00-README.md` · `steward/rules/tenant-document-zones.md`.
