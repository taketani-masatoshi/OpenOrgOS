# ADR 0065 — Operator Console 経営ホーム（Executive Home）

- **Status:** Accepted
- **Date:** 2026-08-28

## Context

Operator Console の `/` は帳簿ワークベンチだった。CEO の日次入口として設計されていた Today（`GET /chat/v1/today`）は API のみ残り、SPA から未配線だった。結果、朝の操縦席がなく、観察と一部実行が CLI / IDE に寄っていた。

権限境界（LLM 無承認 · PassKey · RBAC）は揃っている。欠けているのは「開いた瞬間に要対応・目標ギャップ・依頼進捗が見える」面である。

## Decision

1. **`/` は経営ホーム（Executive Home）** — **一次面は CLI が生成した静的 Markdown の週次・月次**（既定タブは週次 `docs/reports/executive-brief/weekly-brief-*.md` · 月次 `docs/reports/monthly/YYYY-MM.md` または `agent-summaries/records-audit/monthly-audit-*.md`）。日次 `docs/reports/dashboard/YYYY-MM-DD.md` は API `static_reports.daily` に残すが主タブには出さない。ライブ合成の要対応・ギャップ・依頼進捗は折りたたみ（「ライブ状況」）に残す。
2. **帳簿は `/?ledger=1`** — シェル1段目の「帳簿」タブ。ホーム default ではない。
3. **集約 API** — `GET /chat/v1/executive/home`（`chat:read`）。`static_reports` と Today · customers · analytics · orchestration board を compose するだけ。Today schema は肥大化させない。正本 YAML は増やさない（新規 OKR 層なし）。
4. **実行は Console** — 承認 · メール · 振込 · Tower 割当は Console / BFF。Cursor は実装 IDE のまま運用 UI にしない。
5. **L2 非開示** — 振込 UI は `bank_account_id` + 金額 + 相手名のみ。口座番号をチャット・画面に出さない。静的レポート読取は `docs/reports` の allowlist 配下のみ（`executive-notes/` 不可）。

## Consequences

- **生成パイプライン** — CLI（`orgos executive brief` · `orgos report monthly` · 任意で `orgos dashboard`）が MD を書き、WebUI 主タブは週次・月次のみ（`static_reports`）。空スロットは generate_hint で CLI を案内する。
- 既存 E2E / ナビ前提（`/` = 帳簿）を更新する。
- Analytics `kpi-targets` が空の指標は UI で「未設定」と明示する（目標を捏造しない）。
- Work Order の `assignee_kind`（employee / guest / ai / unassigned）は派生表示。handoff スキーマの必須化はしない。

## Related

- [0035](0035-chat-command-router.md) — Chat Command Router
- [0046](0046-analytics-metric-catalog-ssot.md) — Analytics KPI
- [0057](0057-dispatch-tower.md) — Dispatch Tower
- [docs/org-os/operator-layer-spec.md](../org-os/operator-layer-spec.md)
