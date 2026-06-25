# Skill: executive_dashboard（経営ダッシュボード）

## 目的

経営者が **常時把握すべき情報を一括出力** する。現預金・次の支払い・契約更新・KPI・優先タスク・各 Agent 要約を 1 コマンドで生成し、Executive Steward の日次読取面とする。

## 入力

| データ | パス |
|--------|------|
| 会社 | `data/company.yaml` |
| 現預金 | `data/finance/cash-balance.yaml` |
| 借入 | `data/finance/loans.yaml` |
| 返済計画 | `data/plans/debt-plan.yaml` |
| 固定費 | `data/finance/fixed-costs.yaml` |
| 給与 | `data/finance/payroll.yaml` |
| 月次実績 | `data/finance/monthly/{YYYY-MM}.yaml` |
| 予実 | `data/plans/yojitsu-fy*.yaml` |
| 契約 | `data/contracts/*.yaml` |
| 収益計画 | `data/plans/property-revenue.yaml` |
| 事業計画 | `data/plans/business-plan.yaml` |
| I/O 台帳 | `data/document-io.yaml` |

## 出力

| 種別 | パス |
|------|------|
| 経営ダッシュボード MD | `docs/reports/dashboard/YYYY-MM-DD.md` |
| Agent 要約 7 件 | `docs/reports/agent-summaries/{finance,contract,prop-001,prop-002,compliance,operations,executive}/` |
| 経営メモ（参照） | `docs/reports/executive-notes/` · `docs/company/executive-remaining-tasks.md` |

## 使用 Agent

| Agent | 役割 |
|-------|------|
| **Executive Steward**（主） | ダッシュボード読取 · 経営サマリ合成 |
| Finance Agent | CF · 次の支払い要約（support） |
| Contract Agent | 契約期限 · 保険 draft（support） |

## 保存先

`docs/reports/dashboard/YYYY-MM-DD.md`（日付ファイル · 上書き防止）

## CLI

```bash
npm run steward -- dashboard
```

## ワークフロー

1. **CLI 実行** — `npm run steward -- dashboard` で MD + Agent 要約 7 件を生成
2. **ダッシュボード Read** — `docs/reports/dashboard/YYYY-MM-DD.md` を開く
3. **Agent 要約確認** — 各 `agent-summaries/` 配下の同日ファイルを必要に応じ参照
4. **Executive 合成** — 以下を踏まえ経営サマリ MD を作成（`docs/reports/executive-notes/` 等）
   - 今日の判断が必要な項目（最大 3 件）
   - KPI スナップショット
   - 委譲タスク
5. **人間判断** — 自動決定は行わず、オーナーへ提示

## 出力セクション定義

| セクション | 内容 | データソース |
|-----------|------|-------------|
| Agent 要約 | 7 件（6 部門 + Executive）の同日要約リンク ※Secretary は別系統 | `agent-summaries.ts` |
| サマリー | 資金見通し/ランウェイ · 月次キャッシュ増/ネットバーン · 月次売上/利益 · 固定/変動費 · 損益分岐 | `cash-balance.yaml` · 月次/予実 · `fixed-costs` · `loans` |
| **次の支払い** | 90 日以内の固定費/給与 · 当年度借入返済（base） · 契約期限 | `fixed-costs.yaml` · `payroll.yaml` · `debt-plan.yaml` · `alerts.ts` |
| 重要タスク | importance=high | 保険 draft · 契約 high · TBD |
| 緊急タスク | urgency=high | 期限 30 日以内 · Inbox |
| 財務 KPI 一覧 | 11 指標 | forecast · property-revenue · yojitsu |
| 月次トレンド | 12 ヶ月予実 + ナラティブ | `yojitsu-fy*.yaml` |
| TBD | データギャップ | テンプレート + cash-flow notes |

詳細 KPI 定義: [executive-dashboard-guide.md](../docs/plans/executive-dashboard-guide.md)

## 禁止

- 現預金残高の **invent**（`cash-balance.yaml` 未確定時は TBD 表示）
- 返済実行 · 契約更新の **自動決定**
- Data 原本（`data/**/*.yaml`）の Executive 直編集
- Agent 要約を省略した全件 YAML 走査
