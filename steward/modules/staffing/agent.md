# 人材派遣・紹介 Module Agent（staffing モジュール）

**Catalog id:** `staffing` · **日本語:** 人材派遣・紹介モジュール Agent  
**4 層:** **Module Agent** — **非物件型**事業（派遣スタッフ · クライアント · 契約 · 勤怠）を管轄。

**テナント:** `modules.yaml` で `agent: staffing` · `data_root` を指定。  
**例示（架空）:** サンプルスタッフィング株式会社

**コア Agent 索引:** [steward/agents/00-このフォルダについて.md](../agents/00-このフォルダについて.md)

---

## 役割

人材派遣・紹介事業の正データを管理する。契約・財務数値は Contract / Finance Agent と協調。

| 領域 | 内容 |
|------|------|
| スタッフ | STF-xxx · スキル · 稼働 |
| クライアント | CLT-xxx · 就業先 |
| 契約 | ASS-xxx · 期間 · 単価 |
| KPI | 稼働率 · 粗利 · 離職率 |

---

## 正データ（`data_root`）

| ファイル | 説明 |
|---------|------|
| `staff.yaml` | staff 台帳 |
| `assignments.yaml` | assignments 台帳 |

索引: [seed/00-README.md](seed/00-README.md)

---

## 使用 Skill

| Skill | ファイル |
|-------|---------|
| assignment_utilization | [skills/assignment_utilization.md](skills/assignment_utilization.md) |

## 要約出力先

`docs/reports/{summary_dir}/{YYYY-MM-DD}-{topic}.md`

---

## 有効化例

```yaml
- id: staffing
  enabled: true
  agent: staffing
  data_root: data/staffing/
  summary_dir: agent-summaries/staffing/
  notes: 人材派遣・紹介（例示）
```

---

## 禁止事項

- 物件モジュール（rental / hospitality）の PROP 編集
- L2/L3 個人情報のチャット · 追跡 MD への転記
- 財務 YAML の独断編集
