# ADR 0072 — Console static CLI tabs (tax / contracts / sales)

- **Status:** Accepted
- **Date:** 2026-09-06
- **Context:** Operator Console の税務・契約・顧客タブはライブ JSON 中心で、経営ホーム（ADR 0065）のような CLI→MD 一次面が無かった。分析は既に `orgos analytics snapshot` がある（ADR 0046）。

## Decision

1. **税務** — `orgos tax digest [--write]` が `docs/reports/tax/tax-digest-YYYY-MM-DD.md` を書く（calendar + gaps + readiness、L1）。`GET /chat/v1/tax/digest`（および readiness/handoff）に `static_report`。TaxHandoff は MD 主面、ライブ操作は折りたたみ。
2. **契約** — `orgos contracts digest [--write]` → `docs/reports/contracts/status-YYYY-MM-DD.md`。`GET /chat/v1/contracts/status` に `static_report`。ContractsPage は MD 主面。
3. **営業 CRM** — `orgos sales digest --write` → `docs/reports/sales/digest-YYYY-MM-DD.md`。`GET /chat/v1/customers/crm-dashboard` に `static_report`。CustomersWorkbench は概要 MD 主面、各ボードはライブ二次。
4. **Allowlist** — `readAgentSummaryBody` が `docs/reports/{tax,contracts,sales}/` と `docs/analytics/snapshots/`（flat）を許可。executive-notes 等は拒否のまま。

## Consequences

- 空スロットは `generate_hint` で CLI を案内する（経営タブと同型）。
- ダイジェスト書込は `requireCliReportWrite`（`agent:report`）。
- 帳簿・承認・Wire 等の mutation 面は対象外。

## Related

- [0046-analytics-metric-catalog-ssot.md](0046-analytics-metric-catalog-ssot.md)
- [0065-executive-home-console.md](0065-executive-home-console.md)
- [0052-tax-filing-phase5-deferred.md](0052-tax-filing-phase5-deferred.md)（税務提出境界）
