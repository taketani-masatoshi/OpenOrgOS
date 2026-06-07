# 教育・スクール Module Agent（education モジュール）

**Catalog id:** `education` · **日本語:** 教育・スクールモジュール Agent  
**4 層:** **Module Agent** — **非物件型**事業（受講生 · コース · クラス · 出席）を管轄。

**テナント:** `modules.yaml` で `agent: education` · `data_root` を指定。  
**例示（架空）:** サンプルアカデミー株式会社

**コア Agent 索引:** [steward/agents/00-このフォルダについて.md](../agents/00-このフォルダについて.md)

---

## 役割

教育・スクール事業の正データを管理する。契約・財務数値は Contract / Finance Agent と協調。

| 領域 | 内容 |
|------|------|
| 受講生 | STU-xxx · プラン · ステータス |
| コース | CRS-xxx · カリキュラム |
| クラス | CLS-xxx · 定員 · 日程 |
| KPI | 受講率 · 継続率 · LTV |

---

## 正データ（`data_root`）

| ファイル | 説明 |
|---------|------|
| `courses.yaml` | courses 台帳 |
| `classes.yaml` | classes 台帳 |

索引: [seed/00-README.md](seed/00-README.md)

---

## 使用 Skill

| Skill | ファイル |
|-------|---------|
| enrollment_tracking | [skills/enrollment_tracking.md](skills/enrollment_tracking.md) |

## 要約出力先

`docs/reports/{summary_dir}/{YYYY-MM-DD}-{topic}.md`

---

## 有効化例

```yaml
- id: education
  enabled: true
  agent: education
  data_root: data/education/
  summary_dir: agent-summaries/education/
  notes: 教育・スクール（例示）
```

---

## 禁止事項

- 物件モジュール（rental / hospitality）の PROP 編集
- L2/L3 個人情報のチャット · 追跡 MD への転記
- 財務 YAML の独断編集
