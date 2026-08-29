# ADR 0046 — Analytics メトリクス Catalog SSOT

- **Status:** Accepted
- **Date:** 2026-08-24
- **Context:** 経営 KPI の集計は `dashboard` · `variance` · `headcount` · `controls gap` 等に分散していた。`data_analytics` Agent はカタログ上 active だが、専用 SoT と決定論 CLI が無く readiness 68 のままだった。BI モジュール新設は OrgOS の Agent + Skill + CLI パターンと合わない。

## Decision

1. **メトリクス定義正本**はテナント `data/analytics/metrics.yaml` のみ。FY 目標は `kpi-targets.yaml`。人間向けスナップショットは `docs/analytics/snapshots/`。
2. **id 空間**は `MET-[A-Z0-9-]+`。契約 `CTR-`、案件 `PRJ-`、許認可 `APP-` 等とは衝突させない。
3. **実測値はコピーしない。** 各 Agent の data/ を **Metric Resolver**（`src/lib/analytics/resolvers/`）が決定論的に読む。resolver は既存純関数（`computeDashboard` · `buildHeadcountView` 等）のアダプタに限定する。
4. **data_analytics** は `data/analytics/` · `docs/analytics/` と自分の agent-summaries のみ書込可。finance / hr / compliance 正データは改変禁止。
5. **Executive Steward** は `docs/reports/dashboard/` 要約正本。analytics は閾値超過の 1 行アラート注入のみ（dashboard 本文の複製禁止）。
6. **Chat 決定論**は ADR 0033 Fact Provider Registry と ADR 0035 Chat Command Router の両方で提供可。KPI 定番質問は pre-LLM 化する。
7. ディレクトリが無いテナントでは **optional**（validate スキップ）。`_template` と基準テナント `mal` には置く。
8. **前月比の基準線は `data/analytics/snapshot-history.yaml`** に記録された実測値のみ。推定値・手入力を書かない。記録は `orgos analytics snapshot` だけが行い、既存月の上書きと、`--as-of` と異なる月への遡及記録は `--force` を要求する。
9. **高コスト指標は要求経路で計算しない。** `computeDataHealth` と `computeOs99Score`（maturity 込み）はテナント全体を走査し mal で各 25 秒超かかる。Node は単一スレッドのため、これを BFF が同期実行すると Steward Chat 全体が停止する。したがって:
   - CLI · pipeline = `expensive: "live"`（毎回実測）
   - HTTP · Chat = `expensive: "cached"`（プロセス内 TTL キャッシュのみ参照し、未計算なら当月スナップショットの記録値へフォールバック。無ければ「未計算」と表示し数値を捏造しない）
   - TTL は `ORGOS_ANALYTICS_CACHE_TTL_MS`（既定 300000）
10. **Resolver は「無い」を 0 に丸めない。** 値が取れないときは `null` + notes を返す。件数系 resolver は対象行をそのまま数える（フィルタ条件を後付けしない）。

## Consequences

- `orgos validate` が metrics / targets スキーマ、重複 id、予約 prefix 衝突、`snapshot-history.yaml` のスキーマ・重複月・未知 metric id を検査する。
- metrics カタログがあるのに `data_analytics` が operational roster に無いテナントは validate 警告になる（readiness が黙って下がるのを防ぐ）。
- `orgos analytics kpi|quality|metrics|snapshot` と Skill `runtime: cli` が KPI の単一 CLI 入口になる。
- Steward Chat は `/chat/v1/analytics/dashboard` で canvas-view 互換 JSON を返す（P3）。payload 全体に L2 パターンガードを通す。
- コンソールの鮮度はスナップショット運用に依存する。月次 `orgos analytics snapshot` を回さないと高コスト指標は「未計算」のままになる。
- 外部 BI 連携は本 ADR の非対象。

## Related

- [data-analytics-quality-uplift-plan.md](../org-os/data-analytics-quality-uplift-plan.md)
- [0033-deterministic-fact-provider-registry.md](0033-deterministic-fact-provider-registry.md)
- [0035-chat-command-router.md](0035-chat-command-router.md)
- `schemas/analytics/` · `src/lib/analytics/`
