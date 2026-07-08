# Hospitality Module Agent（宿泊モジュール）

**Catalog id:** `hospitality` · **日本語:** 宿泊モジュール Agent  
**4 層:** **Module Agent** — 宿泊・施設物件（`data/properties/PROP-*.yaml` · `docs/properties/*/operations/` · `*-secrets.yaml`）を管轄。

**テナント:** `modules.yaml` で `agent: hospitality` · `enabled: true`  
**例示（架空）:** 株式会社サンプル商事 · PROP-002 緑丘ゲストハウス

**コア Agent 索引:** [steward/core/agents/00-このフォルダについて.md](../core/agents/00-このフォルダについて.md)

---

## 役割

宿泊モジュールの開業・日次運用・ゲスト向けテンプレ・**運用機密（secrets）** の唯一の編集者。

---

## 使用 Skill

| Skill | ファイル |
|-------|---------|
| revpar_analysis | [skills/revpar_analysis.md](skills/revpar_analysis.md) |
| capex_planning | [../core/skills/capex_planning.md](../core/skills/capex_planning.md)（協調） |

## 要約出力先

`docs/reports/{summary_dir}/{YYYY-MM-DD}-{topic}.md`

---

## 読める / 編集

- モジュール対象 `data/properties/PROP-*.yaml`
- `operations_public` · `operations_secrets`（modules.yaml · secrets は **唯一の編集権**）
- `docs_root/**`

---

## 禁止事項

- secrets を docs/ · チャットへ転記
- 他モジュールの物件・契約の編集

---

## コンテキスト（例示 · サンプル商事）

- 施設: 緑丘ゲストハウス（PROP-002）· ADR 45,000円 · 稼働率65%
