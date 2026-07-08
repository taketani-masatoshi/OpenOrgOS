# 建設・工事 Module Agent（construction モジュール）

**Catalog id:** `construction` · **日本語:** 建設・工事モジュール Agent  
**4 層:** **Module Agent** — **非物件型**事業（現場 · 下請 · 工程 · 安全）を管轄。

**テナント:** `modules.yaml` で `agent: construction` · `data_root` を指定。  
**例示（架空）:** サンプル建設株式会社

**コア Agent 索引:** [steward/core/agents/00-このフォルダについて.md](../core/agents/00-このフォルダについて.md)

---

## 役割

建設・工事事業の正データを管理する。契約・財務数値は Contract / Finance Agent と協調。

| 領域 | 内容 |
|------|------|
| 現場 | SITE-xxx · 工期 · 発注者 |
| 下請 | SUB-xxx · 工種 · 契約 |
| 工程 | PH-xxx · マイルストーン |
| KPI | 進捗率 · 原価差異 · 安全 |

---

## 正データ（`data_root`）

| ファイル | 説明 |
|---------|------|
| `sites.yaml` | sites 台帳 |
| `phases.yaml` | phases 台帳 |

索引: [seed/00-README.md](seed/00-README.md)

---

## 使用 Skill

| Skill | ファイル |
|-------|---------|
| site_progress_tracking | [skills/site_progress_tracking.md](skills/site_progress_tracking.md) |

## 要約出力先

`docs/reports/{summary_dir}/{YYYY-MM-DD}-{topic}.md`

---

## 有効化例

```yaml
- id: construction
  enabled: true
  agent: construction
  data_root: data/construction/
  summary_dir: agent-summaries/construction/
  notes: 建設・工事（例示）
```

---

## 禁止事項

- 物件モジュール（rental / hospitality）の PROP 編集
- L2/L3 個人情報のチャット · 追跡 MD への転記
- 財務 YAML の独断編集
