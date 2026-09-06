# ADR 0072 — Console static CLI tabs + static-top live-scroll

- **Status:** Accepted (amended)
- **Date:** 2026-09-06
- **Context:** Operator Console の税務・契約・顧客タブはライブ JSON 中心で、経営ホーム（ADR 0065）のような CLI→MD 一次面が無かった。分析は既に `orgos analytics snapshot` がある（ADR 0046）。一次面追加後もライブ面を `<details>` 折りたたみに閉じると、スクロール到達までは読み取らないが UI 上は隠れているだけだった。

## Decision

1. **税務** — `orgos tax digest [--period weekly|monthly] [--write]` が `docs/reports/tax/{weekly|monthly}-…` を書く（旧 `tax-digest-YYYY-MM-DD.md` は後方互換で読む）。`GET /chat/v1/tax/digest`（および readiness/handoff）に `static_report` + `static_reports`（weekly/monthly）。
2. **契約** — `orgos contracts digest [--period …] [--write]` → `docs/reports/contracts/`。`GET /chat/v1/contracts/status` に静的スロット。
3. **営業 CRM** — `orgos sales digest [--period …] --write` → `docs/reports/sales/`。`GET /chat/v1/customers/crm-dashboard` に静的スロット。
4. **帳簿 / 予算 / 組織** — 同型の `orgos {ledger|budget|org} digest --period weekly|monthly --write` → `docs/reports/{ledger,budget,org}/`。
5. **Allowlist** — `readAgentSummaryBody` が `docs/reports/{tax,contracts,sales,analytics,ledger,budget,org}/` と `docs/analytics/snapshots/`（flat）を許可。executive-notes 等は拒否のまま。
6. **Static-top + live-scroll（Scope A）** — 対象ページ（経営・帳簿・税・予実/財布・契約・顧客・組織図）は **上段** に週次/月次 MD（`StaticDigestHeader` + `StaticReportPanel`）、**下段** に `LiveSection`（IntersectionObserver・一度だけ取得）。ライブ面の `<details>` 折りたたみは外す。除外: 承認・Wire・チャット・取引・実行（runs）。
7. **経営ホーム API 分割** — `GET /chat/v1/executive/home` は `static_reports` + 軽量メタ。`GET /chat/v1/executive/home/live` が attention / gaps / work / KPI / variance。

## Consequences

- 空スロットは `generate_hint` で CLI を案内する（経営タブと同型）。
- ダイジェスト書込は `requireCliReportWrite`（`agent:report`）。
- ライブ取得はスクロール到達まで遅延し、初回のみ（`once`）。
- `pipeline run weekly` / `monthly` が Scope A 6面の静的ダイジェストを書く（soft-fail; attest 失敗が exit を支配）。本番 cron は `agent:report` / operator 認証が必要。

## Related

- [0046-analytics-metric-catalog-ssot.md](0046-analytics-metric-catalog-ssot.md)
- [0065-executive-home-console.md](0065-executive-home-console.md)
- [0052-tax-filing-phase5-deferred.md](0052-tax-filing-phase5-deferred.md)（税務提出境界）
