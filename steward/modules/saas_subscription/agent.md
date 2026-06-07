# SaaS Subscription Module Agent（SaaS サブスクリプションモジュール）

**Catalog id:** `saas_subscription` · **日本語:** SaaS サブスクモジュール Agent  
**4 層:** **Module Agent** — **非物件型**事業（SaaS · 定額課金 · MRR/ARR）を管轄。

**テナント:** `modules.yaml` で `agent: saas_subscription` · `data_root` を指定。  
**例示（架空）:** クラウドワークス株式会社 · プラン BASIC/PRO · 顧客 ACCT-xxx

**コア Agent 索引:** [steward/agents/00-このフォルダについて.md](../agents/00-このフォルダについて.md)

---

## 役割

SaaS 事業の **プラン · 顧客 · サブスクリプション · MRR** を正データで管理する。請求・収益認識は Finance Agent と協調。

| 領域 | 内容 |
|------|------|
| プラン | 料金ティア · 機能制限 · 試用期間 |
| 顧客 | アカウント（ACCT-xxx）· 契約ステータス |
| サブスク | 開始/更新/解約 · 請求サイクル |
| メトリクス | MRR · ARR · チャーン · LTV（要約） |

---

## 正データ（`data_root`）

| ファイル | 説明 |
|---------|------|
| `plans.yaml` | プラン定義（PLAN-xxx） |
| `subscriptions.yaml` | 顧客サブスク台帳（SUB-xxx → ACCT-xxx） |

索引: [seed/00-README.md](seed/00-README.md)

---

## 使用 Skill

| Skill | ファイル |
|-------|---------|
| mrr_analysis | [skills/mrr_analysis.md](skills/mrr_analysis.md) |

## 要約出力先

`docs/reports/{summary_dir}/{YYYY-MM-DD}-{topic}.md`
