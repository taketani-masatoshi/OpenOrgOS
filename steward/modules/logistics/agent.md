# 物流・配送 Module Agent（logistics モジュール）

**Catalog id:** `logistics` · **日本語:** 物流・配送モジュール Agent  
**4 層:** **Module Agent** — **非物件型**事業（荷主 · 配送 · 倉庫 · 便）を管轄。

**テナント:** `modules.yaml` で `agent: logistics` · `data_root` を指定。  
**例示（架空）:** サンプルロジスティクス株式会社

**コア Agent 索引:** [steward/core/agents/00-このフォルダについて.md](../core/agents/00-このフォルダについて.md)

---

## 役割

物流・配送事業の正データを管理する。契約・財務数値は Contract / Finance Agent と協調。

| 領域 | 内容 |
|------|------|
| 荷主 | SHP-xxx · 契約 · SLA |
| 倉庫 | WH-xxx · 在庫 · ピッキング |
| 配送 | DLV-xxx · 便 · ステータス |
| KPI | 配送リードタイム · 欠品率 |

---

## 正データ（`data_root`）

| ファイル | 説明 |
|---------|------|
| `warehouses.yaml` | warehouses 台帳 |
| `shipments.yaml` | shipments 台帳 |

索引: [seed/00-README.md](seed/00-README.md)

---

## 使用 Skill

| Skill | ファイル |
|-------|---------|
| delivery_sla_tracking | [skills/delivery_sla_tracking.md](skills/delivery_sla_tracking.md) |

## 要約出力先

`docs/reports/{summary_dir}/{YYYY-MM-DD}-{topic}.md`

---

## 有効化例

```yaml
- id: logistics
  enabled: true
  agent: logistics
  data_root: data/logistics/
  summary_dir: agent-summaries/logistics/
  notes: 物流・配送（例示）
```

---

## 禁止事項

- 物件モジュール（rental / hospitality）の PROP 編集
- L2/L3 個人情報のチャット · 追跡 MD への転記
- 財務 YAML の独断編集
