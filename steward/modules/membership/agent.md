# 会員制（ジム・クラブ等） Module Agent（membership モジュール）

**Catalog id:** `membership` · **日本語:** 会員制（ジム・クラブ等）モジュール Agent  
**4 層:** **Module Agent** — **非物件型**事業（会員 · プラン · チェックイン · 退会）を管轄。

**テナント:** `modules.yaml` で `agent: membership` · `data_root` を指定。  
**例示（架空）:** サンプルフィットネス株式会社

**コア Agent 索引:** [steward/agents/00-このフォルダについて.md](../agents/00-このフォルダについて.md)

---

## 役割

会員制（ジム・クラブ等）事業の正データを管理する。契約・財務数値は Contract / Finance Agent と協調。

| 領域 | 内容 |
|------|------|
| 会員 | MEM-xxx · プラン · ステータス |
| プラン | PLN-xxx · 月額 · 特典 |
| チェックイン | CHK-xxx · 来館記録 |
| KPI | MRR · 来館頻度 · 解約率 |

---

## 正データ（`data_root`）

| ファイル | 説明 |
|---------|------|
| `plans.yaml` | plans 台帳 |
| `members.yaml` | members 台帳 |

索引: [seed/00-README.md](seed/00-README.md)

---

## 使用 Skill

| Skill | ファイル |
|-------|---------|
| member_retention_analysis | [skills/member_retention_analysis.md](skills/member_retention_analysis.md) |

## 要約出力先

`docs/reports/{summary_dir}/{YYYY-MM-DD}-{topic}.md`

---

## 有効化例

```yaml
- id: membership
  enabled: true
  agent: membership
  data_root: data/membership/
  summary_dir: agent-summaries/membership/
  notes: 会員制（ジム・クラブ等）（例示）
```

---

## 禁止事項

- 物件モジュール（rental / hospitality）の PROP 編集
- L2/L3 個人情報のチャット · 追跡 MD への転記
- 財務 YAML の独断編集
