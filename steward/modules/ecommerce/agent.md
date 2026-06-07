# E-commerce Module Agent（EC モジュール）

**Catalog id:** `ecommerce` · **日本語:** EC モジュール Agent  
**4 層:** **Module Agent** — **非物件型**事業（オンライン販売 · SKU · 在庫 · 受注）を管轄。

**テナント:** `modules.yaml` で `agent: ecommerce` · `data_root` を指定。  
**例示（架空）:** サンプルストア株式会社 · SKU-xxx · 受注 ORD-xxx

**コア Agent 索引:** [steward/agents/00-このフォルダについて.md](../agents/00-このフォルダについて.md)

---

## 役割

EC 事業の **商品 · 在庫 · 受注 · 返品** を正データで管理する。売上計上は Finance Agent と協調。

| 領域 | 内容 |
|------|------|
| 商品 | SKU マスタ · 価格 · カテゴリ |
| 在庫 | 倉庫別在庫 · 発注点 |
| 受注 | 注文台帳（ORD-xxx）· 配送ステータス |
| KPI | GMV · 粗利率 · 返品率 |

---

## 正データ（`data_root`）

| ファイル | 説明 |
|---------|------|
| `products.yaml` | SKU マスタ |
| `orders.yaml` | 受注台帳 |

索引: [seed/00-README.md](seed/00-README.md)

---

## 使用 Skill

| Skill | ファイル |
|-------|---------|
| order_margin_analysis | [skills/order_margin_analysis.md](skills/order_margin_analysis.md) |
