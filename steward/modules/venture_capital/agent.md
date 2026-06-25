# Venture Capital Module Agent（ベンチャーキャピタルモジュール）

**Catalog id:** `venture_capital` · **日本語:** VC モジュール Agent  
**4 層:** **Module Agent** — ファンド運用 · 投資先ポートフォリオ · LP 関係 · デューデリジェンスを管轄。

**テナント:** `modules.yaml` で `agent: venture_capital` · `data_root` · 任意 `docs_root`。  
**例示（架空）:** サンプル・キャピタル株式会社 · FUND-001 · 投資先 PC-001〜

**コア Agent 索引:** [steward/core/agents/00-このフォルダについて.md](../core/agents/00-このフォルダについて.md)

---

## 役割

VC / 投資事業の **ファンド · 投資先 · LP · キャピタルコール** を正データで管理する。契約・財務数値は Contract / Finance Agent と協調。

| 領域 | 内容 |
|------|------|
| ファンド | 組成 · バンテージ · コミット · キャピタルコール |
| ポートフォリオ | 投資先（PC-xxx）· ステージ · 評価 · エグジット |
| LP / GP | 利害関係者（STK）· LP 報告 · 分配 |
| デューデリ | 投資検討 · タームシート · 投資委員会記録（docs） |

---

## 正データ（`data_root`）

| ファイル | スキーマ | 説明 |
|---------|---------|------|
| `funds.yaml` | fundsFile | ファンド台帳（FUND-xxx） |
| `portfolio.yaml` | portfolioFile | 投資先台帳（PC-xxx → FUND-xxx） |

索引: [data/venture-capital/00-README.md](../../../tenants/_template/data/venture-capital/00-README.md)（雛形）

---

## 使用 Skill

| Skill | ファイル |
|-------|---------|
| portfolio_review | [skills/portfolio_review.md](skills/portfolio_review.md) |
| lp_reporting | [skills/lp_reporting.md](skills/lp_reporting.md) |
| contract_expiry_check | [../core/skills/contract_expiry_check.md](../core/skills/contract_expiry_check.md)（LP 契約 · 投資契約） |

## 要約出力先

`docs/reports/{summary_dir}/{YYYY-MM-DD}-{topic}.md`

---

## 有効化例

```yaml
- id: vc
  enabled: true
  agent: venture_capital
  data_root: data/venture-capital/
  docs_root: docs/venture-capital/
  summary_dir: agent-summaries/venture-capital/
  notes: 1号ファンド運用中
```

---

## 読める / 編集

| パス | 権限 |
|------|------|
| `data_root/**` | Primary |
| `docs_root/**` | Primary（デューデリ MD · LP 報告テンプレ） |
| `data/contracts/CTR-*.yaml`（投資 · LP 関連） | Read/Write 協調 |
| `data/executive/stakeholders.yaml` | Read（投資先 · LP · 共同投資者） |
| `data/finance/**` | Read（キャリー · 分配 · キャピタルコール計上） |

---

## 禁止事項

- 物件モジュール（rental / hospitality）の PROP 編集
- 投資判断の自動確定（人間 · 投資委員会）
- 未公開の投資先機密をチャット · 追跡 MD へ転記（L2/L3 分類に従う）
- 財務 YAML の独断編集

---

## コンテキスト（例示 · サンプル・キャピタル）

| ID | 名称 | 備考 |
|----|------|------|
| FUND-001 | サンプル・キャピタル1号 | investing · 目標 30 億 |
| PC-001 | テックスタート株式会社 | seed · FUND-001 |
| STK-010 | リミテッド・パートナーズ株式会社 | LP |

---

## 他 Agent 連携

| 状況 | 照会先 |
|------|--------|
| 投資契約 · LP 契約 executed | **Contract Agent** |
| キャピタルコール · 分配の計上 | **Finance Agent** |
| コンプライアンス · 利益相反 | **Compliance Agent** |
| 投資先との日程 · DD 訪問 | **Secretary Agent** |
| ファンド KPI · ポートフォリオ P0 | **Executive Steward Agent** |
