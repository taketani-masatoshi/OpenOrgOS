# ADR 0073: Finance drop-folder ingest pipeline

## Status

Accepted · 2026-09-15

## Context

Sole-prop and ledger demos needed a clear place to drop bank / card / Suica / PayPay / Amazon / sales / receipt inputs and turn them into journal entries, then PL/BS and tax drafts. PDF text extraction was intentionally out of scope (no new dependencies; `pdfkit` remains generate-only). Existing pieces: `docs/io/inbox` + `document-io.yaml`, bank CSV import (`jp_bank_corporate`), and `appendJournalEntry`.

Corporate modules (`jp_tax_corporate`, `jp_bank_corporate`, `jp_financial_audit`, …) must not invent a second inbox layout. Folder structure should be Core-standard for both entity forms.

## Decision

1. Extend inbox categories: `bank`, `card`, `transit`, `wallet`, `marketplace`, `sales` (plus existing `receipts`, `contracts`).
2. Add core CLI `orgos ingest {status|scaffold|scan|parse|classify|review|post}` with staging at `data/finance/ingest-staging.yaml` and rules at `data/finance/ingest-rules.yaml`.
3. Accept CSV/TSV/MD/TXT/JSON only; `.pdf` fails parse with guidance to convert externally.
4. Journal post requires explicit `--write` and uses `source.kind: ingest` with row fingerprint for idempotency.
5. Reuse shared CSV parser under `src/lib/finance/ingest/csv.ts` for bank import and ingest adapters.
6. Contracts are registered/reviewed but not auto-journaled.
7. **Module standard (shared scaffold):**
   - Template SSOT: `steward/platform/finance/ingest-inbox/` (category READMEs).
   - `ensureFinanceIngestInboxScaffold()` from `tenant scaffold-docs`, Ledger provision, `orgos ingest scaffold|status|scan`, and `modules activate` for finance-related modules (`jp_sole_proprietor_blue_return`, `jp_bank_corporate`, `jp_tax_corporate`, `jp_tax_consumption`, `jp_financial_audit`, `jp_invoice_qualified`, `jp_withholding_statutory`, `jp_payroll`).
   - Do **not** duplicate inbox trees in each module `seed/`.
   - Entity-specific outputs stay under Extension paths (`docs/finance/blue-return/`, `docs/company/tax/`, `docs/audit/financial/`, treasury, …).

## Consequences

- Humans own PDF→CSV/MD conversion and classification rule maintenance.
- Asset-band outflows (≥ threshold) redirect to sole-prop `expense-intake clarify` when that module is in play.
- After post, sole-prop uses `sole-prop-blue books|kessan|handoff`; corporate uses tax-corporate / bank / financial-audit CLIs on the same journal SSOT.
- Overview: `steward/platform/finance/00-README.md` · `steward/rules/tenant-document-zones.md`.
