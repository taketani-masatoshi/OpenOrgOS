# Step 7 — Cursor で実行すべき作業

**前提:** [06-file-manifest.md](06-file-manifest.md) · [04-dependencies.md](04-dependencies.md)

---

## 即時（今週）

### 1. P0 データ入力 → 計画の前提を確定

```bash
# 現預金入力後
npm run validate
npm run steward -- dashboard
npm run steward -- deps check --file cursor/data/finances/cash-balance.yaml
```

- `cash-balance.yaml` 確定 → **資金繰り計画** · **DSCR** · **月次経営レポート** が有効化
- CTR-013/014 executed 化 → **保険契約計画** · **物件リスク計画** 更新

### 2. Phase 1 MD 生成（Cursor Agent）

プロンプト: `@prompts/business_plan_decomposition_agent.md`

以下を **正データから自動起稿**（1 セッション 5–10 ファイル）:

- [ ] `docs/plans/risk-management-plan.md`
- [ ] `docs/plans/kpi-plan.md`
- [ ] `docs/plans/properties/PROP-001/risk-plan.md`
- [ ] `docs/plans/properties/PROP-002/risk-plan.md`
- [ ] `docs/plans/contracts/insurance-contract-plan.md`
- [ ] `docs/plans/finance/liquidity-crisis-plan.md`

### 3. 亀沢開業計画（2026-08）

- [ ] `docs/plans/hospitality/occupancy-plan.md` — 開業後 6 ヶ月の月次稼働目標
- [ ] `docs/plans/properties/PROP-002/hotel-operation-plan.md` — `pre-opening-checklist.md` リンク
- [ ] `dependency-graph.yaml` に hospitality 計画ノード追加

---

## 短期（2–4 週間）

### 4. 物件別計画インスタンス完成

```bash
npm run steward -- sync all
npm run steward -- properties
npm run steward -- finances
```

- PROP-001/002 各 11 ファイル（`06-file-manifest.md` 参照）
- 数値は YAML から転記、docs は人向け要約

### 5. 賃貸モジュール（番町）

- CTR-011 executed 後 → `lease-contract-plan.md` · `tenant-acquisition-plan.md` 確定
- `docs/operations/rental/bancho/` 運用 SOP 新設

### 6. 財務計画 MD 群

- `revenue-plan.yaml` → `finance/revenue-plan.md`
- `yojitsu-fy2026.yaml` → 予実連動の `variance/fy2026-variance.md`

---

## 中期（1–3 ヶ月）

### 7. レポート自動化

- `steward report` サブコマンド検討（契約期限 · 稼働率 · 資金繰り）
- `docs/plans/reports/*-spec.md` を CLI 出力仕様として実装

### 8. dependency-graph 拡張

- 84 計画タイプの主要ノードを `dependency-graph.yaml` に追加
- `npm run validate -- --deps` で計画 MD の鮮度警告

### 9. サービスセグメント計画

- 翻訳・DX の `revenue-plan.yaml` 行を 0 から具体化
- 中期計画のセグメント 3–5 を数値化

---

## Cursor ワークフロー（推奨）

| シーン | エージェント | コマンド/参照 |
|--------|-------------|--------------|
| 計画分解・起稿 | Business Plan Decomposition | `@prompts/business_plan_decomposition_agent.md` |
| 数値更新 | Finance | `@prompts/finance_agent.md` + `steward sync` |
| 契約 draft→executed | Contract + Operations | inbox 処理 |
| 番町運用 | Property Rental | `@prompts/property_rental_agent.md` |
| 亀沢運用 | Hospitality | `@prompts/hospitality_agent.md` |
| 経営判断 | Executive | `npm run steward -- dashboard` |

---

## 完了定義（分解エージェント）

- [ ] Phase 1 の 6 MD 作成
- [ ] 全 97 MD のうち **50%** 起稿（約 48 ファイル）
- [ ] `dependency-graph.yaml` に計画チェーン反映
- [ ] `npm run validate` パス
- [ ] Executive ダッシュボードに KPI 計画の目標値表示

---

## 関連

- [00-INDEX.md](00-INDEX.md)
- [docs/agent_architecture.md](../agent_architecture.md)
- [docs/corporate/executive-remaining-tasks.md](../corporate/executive-remaining-tasks.md)
