# ADR 0065 — Operator Console 経営ホーム（Executive Home）

- **Status:** Accepted
- **Date:** 2026-08-28

## Context

Operator Console の `/` は帳簿ワークベンチだった。CEO の日次入口として設計されていた Today（`GET /chat/v1/today`）は API のみ残り、SPA から未配線だった。結果、朝の操縦席がなく、観察と一部実行が CLI / IDE に寄っていた。

権限境界（LLM 無承認 · PassKey · RBAC）は揃っている。欠けているのは「開いた瞬間に要対応・目標ギャップ・依頼進捗が見える」面である。

## Decision

1. **`/` は経営ホーム（Executive Home）** — 要対応の顧客・経営目標とギャップ・部下/社外/AI への依頼進捗の3ブロック。
2. **帳簿は `/?ledger=1`** — シェル1段目の「帳簿」タブ。ホーム default ではない。
3. **集約 API** — `GET /chat/v1/executive/home`（`chat:read`）。既定は `docs/reports/dashboard/console-home.json`（`orgos dashboard` が週次・月次として書く）を返し、現預金だけ `cash-balance.yaml` の confirmed 合計で上書きする。`?live=1` は YAML からその場で compose（更新ボタン）。スナップショットが無いときは従来どおり live。Today schema は肥大化させない。正本 YAML は増やさない（新規 OKR 層なし）。分析画面も同じ（`console-analytics.json`）。
4. **実行は Console** — 承認 · メール · 振込 · Tower 割当は Console / BFF。Cursor は実装 IDE のまま運用 UI にしない。
5. **L2 非開示** — 振込 UI は `bank_account_id` + 金額 + 相手名のみ。口座番号をチャット・画面に出さない。

## Consequences

- 既存 E2E / ナビ前提（`/` = 帳簿）を更新する。
- HTTP GET はスナップショットを書かない（CLI `orgos dashboard` だけ書く）。
- `console-home.json` / `console-analytics.json` は gitignore のレポート。円合計を `writeTrackedFile` に通すと 7 桁が壊れて GET が live に落ちるので、`writeCanonicalFile` で書く。口座番号は載せない。
- Analytics `kpi-targets` が空の指標は UI で「未設定」と明示する（目標を捏造しない）。
- Work Order の `assignee_kind`（employee / guest / ai / unassigned）は派生表示。handoff スキーマの必須化はしない。

## Related

- [0035](0035-chat-command-router.md) — Chat Command Router
- [0046](0046-analytics-metric-catalog-ssot.md) — Analytics KPI
- [0057](0057-dispatch-tower.md) — Dispatch Tower
- [docs/org-os/operator-layer-spec.md](../org-os/operator-layer-spec.md)
