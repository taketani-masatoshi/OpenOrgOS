# 飲食店 Module Agent（restaurant モジュール）

**Catalog id:** `restaurant` · **日本語:** 飲食店モジュール Agent  
**4 層:** **Module Agent** — **非物件型**事業（レストラン・カフェ · テーブル · メニュー · 予約）を管轄。

**テナント:** `modules.yaml` で `agent: restaurant` · `data_root` を指定。  
**例示（架空）:** サンプル食堂株式会社

**コア Agent 索引:** [steward/core/agents/00-このフォルダについて.md](../core/agents/00-このフォルダについて.md)

---

## 役割

飲食店事業の正データを管理する。契約・財務数値は Contract / Finance Agent と協調。

| 領域 | 内容 |
|------|------|
| 店舗 | テーブル · 座席 · 営業時間 |
| メニュー | 品目 · 原価 · アレルゲン |
| 予約 | RES-xxx · 来店人数 · 特記事項 |
| KPI | 客単価 · 回転率 · 原価率 |

---

## 正データ（`data_root`）

| ファイル | 説明 |
|---------|------|
| `tables.yaml` | tables 台帳 |
| `menu.yaml` | menu 台帳 |

索引: [seed/00-README.md](seed/00-README.md)

---

## 使用 Skill

| Skill | ファイル |
|-------|---------|
| table_turnover_analysis | [skills/table_turnover_analysis.md](skills/table_turnover_analysis.md) |

## 要約出力先

`docs/reports/{summary_dir}/{YYYY-MM-DD}-{topic}.md`

---

## 有効化例

```yaml
- id: restaurant
  enabled: true
  agent: restaurant
  data_root: data/restaurant/
  summary_dir: agent-summaries/restaurant/
  notes: 飲食店（例示）
```

---

## 禁止事項

- 物件モジュール（rental / hospitality）の PROP 編集
- L2/L3 個人情報のチャット · 追跡 MD への転記
- 財務 YAML の独断編集
