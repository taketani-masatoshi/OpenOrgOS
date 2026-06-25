# 実店舗小売 Module Agent（retail_store モジュール）

**Catalog id:** `retail_store` · **日本語:** 実店舗小売モジュール Agent  
**4 層:** **Module Agent** — **非物件型**事業（店舗 · SKU · POS · 在庫）を管轄。

**テナント:** `modules.yaml` で `agent: retail_store` · `data_root` を指定。  
**例示（架空）:** サンプルストア株式会社

**コア Agent 索引:** [steward/core/agents/00-このフォルダについて.md](../core/agents/00-このフォルダについて.md)

---

## 役割

実店舗小売事業の正データを管理する。契約・財務数値は Contract / Finance Agent と協調。

| 領域 | 内容 |
|------|------|
| 店舗 | STORE-xxx · 営業時間 · レジ |
| 商品 | SKU-xxx · 価格 · 原価 |
| POS | TXN-xxx · 売上 · 決済 |
| KPI | 坪効率 · 粗利率 · 在庫回転 |

---

## 正データ（`data_root`）

| ファイル | 説明 |
|---------|------|
| `stores.yaml` | stores 台帳 |
| `skus.yaml` | skus 台帳 |

索引: [seed/00-README.md](seed/00-README.md)

---

## 使用 Skill

| Skill | ファイル |
|-------|---------|
| pos_margin_analysis | [skills/pos_margin_analysis.md](skills/pos_margin_analysis.md) |

## 要約出力先

`docs/reports/{summary_dir}/{YYYY-MM-DD}-{topic}.md`

---

## 有効化例

```yaml
- id: retail_store
  enabled: true
  agent: retail_store
  data_root: data/retail-store/
  summary_dir: agent-summaries/retail-store/
  notes: 実店舗小売（例示）
```

---

## 禁止事項

- 物件モジュール（rental / hospitality）の PROP 編集
- L2/L3 個人情報のチャット · 追跡 MD への転記
- 財務 YAML の独断編集
