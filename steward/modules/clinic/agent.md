# クリニック・診療 Module Agent（clinic モジュール）

**Catalog id:** `clinic` · **日本語:** クリニック・診療モジュール Agent  
**4 層:** **Module Agent** — **非物件型**事業（患者 · 予約 · 診療科 · 受付）を管轄。

**テナント:** `modules.yaml` で `agent: clinic` · `data_root` を指定。  
**例示（架空）:** サンプル内科クリニック

**コア Agent 索引:** [steward/agents/00-このフォルダについて.md](../agents/00-このフォルダについて.md)

---

## 役割

クリニック・診療事業の正データを管理する。契約・財務数値は Contract / Finance Agent と協調。

| 領域 | 内容 |
|------|------|
| 患者 | PAT-xxx · カルテ索引（L2 は gitignore） |
| 予約 | APT-xxx · 診療科 · 時間枠 |
| 診療科 | DEPT-xxx · 医師 · 設備 |
| KPI | 新患数 · 再診率 · 待ち時間 |

---

## 正データ（`data_root`）

| ファイル | 説明 |
|---------|------|
| `departments.yaml` | departments 台帳 |
| `appointments.yaml` | appointments 台帳 |

索引: [seed/00-README.md](seed/00-README.md)

---

## 使用 Skill

| Skill | ファイル |
|-------|---------|
| appointment_utilization | [skills/appointment_utilization.md](skills/appointment_utilization.md) |

## 要約出力先

`docs/reports/{summary_dir}/{YYYY-MM-DD}-{topic}.md`

---

## 有効化例

```yaml
- id: clinic
  enabled: true
  agent: clinic
  data_root: data/clinic/
  summary_dir: agent-summaries/clinic/
  notes: クリニック・診療（例示）
```

---

## 禁止事項

- 物件モジュール（rental / hospitality）の PROP 編集
- L2/L3 個人情報のチャット · 追跡 MD への転記
- 財務 YAML の独断編集
