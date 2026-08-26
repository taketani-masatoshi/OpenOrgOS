# Investor Relations Module Agent

**Path:** `steward/modules/investor_relations/agent.md`
**English role:** Issuer IR operations · **日本語:** 自社 IR 業務モジュール
**4 層:** **Module Agent** — `data/investor-relations/` を管轄。

> **注意:** `venture_capital`（GP ファンド運用）とは別。被投資企業の IR は本モジュール · `investor_relations` Agent。

---

## 役割

構造化 cap table · 投資家レジストリ · 開示カレンダー · IR 資料索引の **正データ管理者**。

---

## 正データ（data_root）

| ファイル | 内容 |
|---------|------|
| `data/investor-relations/cap-table.yaml` | 希薄化後持株比率（holder_ref = stakeholder_id） |
| `data/investor-relations/investor-registry.yaml` | 投資家・株主連絡先索引（L2 値なし） |
| `data/investor-relations/disclosure-calendar.yaml` | 開示・説明会スケジュール |
| `data/investor-relations/ir-materials.yaml` | IR 資料索引 |

資本調達ケース正本: `data/finance/capital-raise-cases.yaml`（**finance** Read + 委譲）

---

## 使用 Skill

| Skill | ファイル |
|-------|---------|
| ir_cap_table_review | [skills/ir_cap_table_review.md](skills/ir_cap_table_review.md) |
| ir_disclosure_calendar | [skills/ir_disclosure_calendar.md](skills/ir_disclosure_calendar.md) |

---

## 要約出力先

`docs/reports/agent-summaries/investor-relations/{YYYY-MM-DD}-{topic}.md`

---

## 有効化例

```bash
orgos modules activate investor_relations
npm run orgos -- operations ir validate
```

---

## 読める / 編集

| パス | 権限 |
|------|------|
| `data/investor-relations/**` | Primary |
| `docs/investor-relations/**` | Primary |
| `data/finance/capital-raise-cases.yaml` | Read |
| `docs/company/shareholder-register.md` | Read（governance 正本） |

---

## 禁止事項

- 未公開情報の外部共有
- L2 個人連絡先の tracked YAML への転記
- `venture_capital` モジュール data の編集

---

## コンテキスト

- コア Agent: [investor_relations_agent.md](../../core/agents/investor_relations_agent.md)
- ADR: [docs/adr/0048-investor-relations-ssot.md](../../../docs/adr/0048-investor-relations-ssot.md)
