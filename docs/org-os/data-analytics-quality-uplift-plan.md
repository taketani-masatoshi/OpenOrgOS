# データ分析 品質引き上げ計画

**日付:** 2026-08-24  
**対象 Agent:** `data_analytics`（Data & Analytics · 報告先 executive_steward）  
**基準テナント:** `mal`  
**現状:** `orgos agent readiness` **68/100**（カタログ骨格 · テナント未活性化 · CLI 0）  
**目標:** 運用可能 **95+**（必須コアと同帯）かつ CEO が KPI スコアカードと分析画面で経営指標を見られる状態

**非対象:** 外部 BI（Looker / Metabase 等）連携 · 業種モジュール新設 · `data/**` 正データの改変 · Excel エクスポート

---

## 0. なぜ上げるか

mal では finance / hr / compliance / operations の集計が `dashboard` · `variance` · `headcount` · `controls gap` 等に **分散** している。`data_analytics` はカタログ上 P1 active だが、専用 SoT · 決定論 CLI · pulse 要約が無く readiness 68 のまま。

Data & Analytics の価値は BI ツール代替ではなく、次を決定論的に出すことにある。

- 会社として追う KPI の **定義と目標** が一箇所にある
- 実測値は各 Agent の SoT から **resolver** で解決（コピーしない）
- 目標 vs 実績 vs 閾値で RAG が出る
- Executive Steward の dashboard 要約を **補完** する深掘りとデータ品質監視

---

## 1. 現状ギャップ（68 点の内訳）

| 軸 | 配点 | 現状 | 原因 |
|----|:----:|:----:|------|
| 定義 | 15 | 12 | `registry.yaml` に access.read/write 未宣言 |
| Skill/CLI | 20 | 14 | Skill 2 本とも `runtime: agent` · CLI 0 |
| データ SoT | 15 | 8 | mal に `data/analytics/` が無い（template の README のみ） |
| routing | 10 | 10 | `data-analytics` route はある（skill 未紐付け） |
| 要約 | 15 | 9 | pulse 未実行 |
| 証拠 | 10 | 5 | roster 未投入 |
| テナント | 15 | 10 | template のみ · mal パスなし |

Skill 正本 `analytics_metrics_review` / `analytics_data_quality` は見出しだけの stub。

---

## 2. 境界（混在させない）

```
CEO（判断 · 承認）
  └─ Executive Steward（dashboard / agent-summaries 要約のみ）
        └─ Data & Analytics（メトリクス定義 · 目標 · 深掘り · 品質監視）
              ├─ 読取 → finance / hr / compliance 等の SoT（resolver）
              ├─ 書込 → data/analytics/ · docs/analytics/ のみ
              └─ リンク → docs/reports/dashboard/（複製しない）
```

| 層 | 正本 | Data & Analytics の扱い |
|----|------|------------------------|
| **メトリクス定義** | `data/analytics/metrics.yaml` | **唯一の定義 SoT** |
| **FY 目標** | `data/analytics/kpi-targets.yaml` | 目標値のみ。実測値は置かない |
| **実測値** | 各 Agent の data/ | resolver で読取。コピー禁止 |
| **経営要約** | `docs/reports/dashboard/` | Executive Steward 正本。1 行アラート注入のみ |
| **物件分析** | `orgos analyze property` | 別コマンド空間。混在しない |

**やってよい:** KPI 定義提案、スコアカード生成、データ品質レポート、CEO 向け叙述（CLI 結果添付）。  
**やってはいけない:** finance/hr 正データ改変、L2 実測値の YAML 転記、最終判断の単独実行。

P0 でこの境界を **ADR 0046** として固定する。

---

## 3. ゴールと DoD

| ゴール | 達成イメージ | 計測 |
|--------|-------------|------|
| 正本がある | mal に metrics + targets があり validate が通る | `orgos validate` |
| 決定論で見える | LLM なしで KPI スコアカード / 品質が出る | `orgos analytics kpi` · `quality` |
| 週次で使える | pulse が実データから要約を書く | `agent-summaries/data-analytics/` |
| コア並み | readiness 95+ | `orgos agent readiness --agent data_analytics` |
| 画面で見える | Steward Chat 予実サブナビ「分析」 | `/` + `?analytics=1` |

**完了条件（全部必須）**

- [ ] schema + CLI + Skill `runtime: cli`（最低 3）
- [ ] mal roster に `data_analytics` を追加
- [ ] mal `data/analytics/` に L1 メトリクス定義
- [ ] `_template` に同じ雛形
- [ ] Vitest（schema · CLI · mal fixture）
- [ ] `orgos operator export --agent data_analytics`
- [ ] Chat から `analytics kpi` 相当が `chat:read` で叩ける
- [ ] readiness **≥ 95**
- [ ] Steward Chat 分析ダッシュボード UI

---

## 4. データ契約（P0 で固定）

```
tenants/{id}/data/analytics/
  metrics.yaml          # 指標定義（id · resolver · direction · unit）
  kpi-targets.yaml      # FY 目標値（metric_id · target_value）
tenants/{id}/docs/analytics/
  snapshots/            # 月次スナップショット MD（CLI 生成）
  */                    # 人間向けメモ · 分析下書き
```

`metrics.yaml` の必須フィールド:

| フィールド | 意味 |
|-----------|------|
| `id` | `MET-[A-Z0-9-]+` |
| `title` | L1 指標名 |
| `category` | `finance` · `hr` · `compliance` · `quality` · `ops` |
| `resolver` | resolver id（例: `finance.dashboard.runway_months`） |
| `direction` | `higher_better` · `lower_better` · `neutral` |
| `unit` | `yen` · `count` · `percent` · `score` · `months` |
| `owner_agent` | 数値定義の担当 Agent id |

金額実測値・個人名・口座は置かない。実測は resolver が各 SoT から取得。

---

## 5. mal 初期メトリクス（L1 案）

| id | 趣旨 | resolver | owner |
|----|------|----------|-------|
| `MET-CASH-BALANCE` | 現預金残高 | finance.dashboard.cash_balance | finance |
| `MET-RUNWAY` | キャッシュランウェイ | finance.dashboard.runway_months | finance |
| `MET-MONTHLY-PROFIT` | 月次利益（近似） | finance.dashboard.monthly_profit | finance |
| `MET-REVENUE-VAR-PCT` | 売上予実差異率 | finance.variance.revenue_delta_pct | finance |
| `MET-HEADCOUNT` | 在籍人数 | hr.headcount.on_roster | human_resources |
| `MET-CONTROL-GAPS` | 統制ギャップ件数 | compliance.controls.gap_count | compliance |
| `MET-DATA-HEALTH` | データ健全性 | quality.data_health.overall | data_analytics |
| `MET-OS-SCORE` | OrgOS 総合スコア | os_score.composite | executive_steward |

---

## 6. Skill / CLI（HR `hr headcount` と同型）

| Skill | runtime | CLI | 権限 | 内容 |
|-------|---------|-----|------|------|
| `analytics_kpi_scorecard` | **cli** | `analytics kpi` | chat:read | 目標 vs 実績 RAG |
| `analytics_data_quality` | **cli** | `analytics quality` | chat:read | データ品質（computeDataHealth） |
| `analytics_metric_catalog` | **cli** | `analytics metrics` | chat:read | 定義一覧 + resolver 検証 |
| `analytics_metrics_review` | agent | — | — | CEO 向け叙述（CLI 結果添付） |

コマンド置き場: `src/commands/analytics.ts` · ドメイン: `src/lib/analytics/`。

---

## 7. フェーズ

### P0 — 境界と正本（目標: 87 点）

1. ADR 0046: メトリクス catalog SSOT · resolver 境界  
2. `schemas/analytics/` + validate 組み込み  
3. `_template` と mal に `data/analytics/` · `docs/analytics/`  
4. `registry.yaml` に access.read/write を宣言  
5. mal roster に `data_analytics` を追加  
6. classification-registry に `data/analytics/` を L1 で登録  

**出口:** validate 緑 · readiness おおよそ 87。

### P1 — 決定論 CLI（目標: 94 点）

1. `orgos analytics metrics|kpi|quality`  
2. Skill registry を `runtime: cli` に更新 · chat:read  
3. Fact provider `analytics_kpi`（任意 · P2）  
4. `tests/analytics-*.test.ts`  
5. Agent 定義 MD 更新 · export  

**出口:** LLM なしで KPI スコアカードが出る · Skill/CLI 20/20。

### P2 — 横断と要約（目標: 100 点）

1. resolver 拡張（finance / hr / compliance / quality / os-score）  
2. 月次スナップショット `docs/analytics/snapshots/{YYYY-MM}.md`  
3. pulse 実行  
4. dashboard / daily への analytics アラート 1 行  
5. Fact Provider `analytics_kpi`  

**出口:** pulse 要約あり · 要約 15/15。

### P3 — Steward Chat UI

1. canvas-view builder + BFF `/chat/v1/analytics/dashboard`  
2. 予実サブナビ「分析」+ `AnalyticsDashboardPage.tsx`  
3. CSS bar 可視化（DistributionBar パターン）  

---

## 8. 点数の見通し

| 時点 | 定義 | Skill | SoT | route | 要約 | 証拠 | tenant | **計** |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 今 | 12 | 14 | 8 | 10 | 9 | 5 | 10 | **68** |
| P0 完了 | 15 | 14 | 15 | 10 | 9 | 9 | 15 | **87** |
| P1 完了 | 15 | 20 | 15 | 10 | 9 | 10 | 15 | **94** |
| P2 完了 | 15 | 20 | 15 | 10 | 15 | 10 | 15 | **100** |

---

## 9. 実装順（ファイル）

| 順 | パス | 内容 |
|----|------|------|
| 1 | `docs/adr/0046-analytics-metric-catalog-ssot.md` | 境界 |
| 2 | `schemas/analytics/metric-catalog.ts` | Zod |
| 3 | `src/lib/analytics/*.ts` | 純関数 · resolver · view |
| 4 | `src/commands/analytics.ts` | CLI |
| 5 | `steward/core/skills/analytics_*.md` + `registry.yaml` | Skill |
| 6 | `steward/core/agents/data_analytics_agent.md` | 役割更新 |
| 7 | `tenants/_template/data/analytics/` | 雛形 |
| 8 | `tenants/mal/data/analytics/` | L1 実データ |
| 9 | `tests/analytics-*.test.ts` | 契約 |
| 10 | P3: canvas-view · BFF · UI | 分析画面 |

---

## 10. リスク

| リスク | 回避 |
|--------|------|
| dashboard と二重実装 | resolver は既存純関数のアダプタのみ |
| Executive と衝突 | Executive は要約読取 · analytics は定義 + 深掘り |
| L2 混入 | payload 全体に L2 パターンガード（スキーマに実測値フィールドも置かない） |
| analyze property と混同 | `analytics` コマンド空間を分離 |
| resolver が「無い」を 0 と報告 | 値が取れなければ `null` + notes。件数系は対象行をそのまま数える |
| 高コスト計算で BFF が停止 | HTTP は `expensive: "cached"`。未計算なら当月スナップショットへフォールバック |
| 前月比の基準線が推定値になる | `snapshot-history.yaml` は `orgos analytics snapshot` の実測記録のみ。上書き・遡及は `--force` |
| roster から agent が落ちて readiness が黙って下がる | metrics カタログがあるのに roster 未登録なら validate 警告 |

---

## 10.1 実装後に判明した設計上の制約

| 項目 | 実測 | 対応 |
|------|------|------|
| `computeDataHealth()` | mal で約 27 秒 | 要求経路では計算せずスナップショット値を使う |
| `computeOs99Score()`（maturity 込み） | 約 26 秒 | 同上 |
| `buildAnalyticsDashboardPayload()` 冷間 | 約 68 秒 | cached モードで約 2 秒 |
| その他 resolver（dashboard · gaps · headcount · variance） | 合計 1 秒台 | 常時ライブ |

高コスト指標をコンソールで最新化するには月次 `orgos analytics snapshot` の実行が前提になる。実行していないテナントでは当該指標が「未計算」と表示される（0 や推定値では埋めない）。

---

## 11. 関連

- ADR [0046](../adr/0046-analytics-metric-catalog-ssot.md) · [0033](../adr/0033-deterministic-fact-provider-registry.md)
- 参照実装: [hr_headcount.md](../../steward/core/skills/hr_headcount.md)
- PMO 同型計画: [pmo-quality-uplift-plan.md](pmo-quality-uplift-plan.md)
