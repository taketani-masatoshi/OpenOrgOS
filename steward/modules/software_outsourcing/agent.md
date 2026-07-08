# Software Outsourcing Module Agent（ソフトウェア受託事業）

**Catalog id:** `software_outsourcing` · **日本語:** ソフトウェア受託事業モジュール Agent  
**4 層:** **Module Agent** — **ソフトウェア開発受託**（SOW · マイルストーン · 工数 · 成果物）を管轄。

**テナント:** `modules.yaml` で `agent: software_outsourcing` · `data_root` を指定。  
**例示（架空）:** サンプル・テック株式会社 · SOW-001 · MS-001

**コア Agent 索引:** [steward/core/agents/00-このフォルダについて.md](../core/agents/00-このフォルダについて.md)

---

## 境界 — `professional_services` との違い

| 項目 | professional_services | **software_outsourcing（本モジュール）** |
|------|----------------------|----------------------------------------|
| 対象 | 汎用受託・コンサル | **ソフトウェア開発受託** |
| 正データ | projects | **SOW · milestones · timesheets · deliverables** |
| 請求 | 月次請求 seed（production_ready） | **工数/マイルストーン請求**（activation · 請求 seed は将来 tier） |
| 規程 | 業務委託一般 | **REG-007 文書管理** · 著作権・秘密保持（Contract 連携） |

---

## 役割

受託開発の **SOW · 工程 · 工数 · 納品** を管理。契約条項・請求は Contract / Finance と協調。

| 領域 | 内容 |
|------|------|
| SOW | 契約スコープ · 技術スタック · 納期 |
| マイルストーン | MS-xxx · 検収 · 支払条件 |
| 工数 | timesheets · エンジニア別稼働 |
| 成果物 | deliverables · リポジトリ/成果物 ID リンク |
| KPI | 工数消化率 · マイルストーン遅延 · 粗利 |

---

## 正データ（`data_root`）

| ファイル | 説明 |
|---------|------|
| `sow-contracts.yaml` | SOW / 開発受託契約台帳 |
| `milestones.yaml` | マイルストーン · 検収 |
| `timesheets.yaml` | 工数記録 |
| `deliverables.yaml` | 成果物台帳 |

索引: [seed/00-README.md](seed/00-README.md)

---

## 使用 Skill

| Skill | ファイル |
|-------|---------|
| milestone_tracking | [skills/milestone_tracking.md](skills/milestone_tracking.md) |

---

## 要約出力先

`docs/reports/{summary_dir}/{YYYY-MM-DD}-{topic}.md`

---

## 有効化例

```yaml
- id: software_outsourcing
  enabled: true
  agent: software_outsourcing
  data_root: data/software-outsourcing/
  summary_dir: agent-summaries/software-outsourcing/
  notes: ソフトウェア受託（例示）
```

---

## 禁止事項

- L2/L3 個人情報のチャット · 追跡 MD への転記
- ソースコード · 認証情報の Git 追跡
- 財務 YAML の独断編集（Finance 委譲）

---

## 他 Agent 連携

| タスク | 委譲先 |
|--------|--------|
| 契約 · 著作権 · NDA | Contract |
| 工数請求 · 粗利 | Finance |
| 文書版管理 · REG-007 | Compliance |
| インフラ納品 | Operations |
