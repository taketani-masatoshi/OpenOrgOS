# Investor Relations — OrgOS Spec

**Path:** `docs/org-os/investor-relations-spec.md`  
**ADR:** [0048-investor-relations-ssot.md](../adr/0048-investor-relations-ssot.md)  
**Agent:** [investor_relations_agent.md](../../steward/core/agents/investor_relations_agent.md)  
**Module:** [steward/modules/investor_relations/](../../steward/modules/investor_relations/)

---

## Scope

自社 IR（issuer view）: cap table · 投資家レジストリ · 開示カレンダー · IR 資料索引。  
**除外:** `venture_capital` モジュール（GP ファンド運用）。

---

## SSOT Layout

| Path | Schema | Owner |
|------|--------|-------|
| `data/investor-relations/cap-table.yaml` | `capTableFileSchema` | IR |
| `data/investor-relations/investor-registry.yaml` | `investorRegistryFileSchema` | IR |
| `data/investor-relations/disclosure-calendar.yaml` | `disclosureCalendarFileSchema` | IR |
| `data/investor-relations/ir-materials.yaml` | `irMaterialsFileSchema` | IR |
| `data/finance/capital-raise-cases.yaml` | `capitalRaiseCasesFileSchema` | Finance (IR Read) |
| `docs/company/shareholder-register.md` | — | Corporate Governance (IR Read) |

---

## CLI

```bash
orgos modules activate investor_relations
orgos operations ir show
orgos operations ir validate
orgos operations ir briefing [-o filename]
orgos operations ir cap-table-review
orgos operations ir disclosure-calendar [--days 90]
orgos finances capital-raise-crosscheck
orgos skills run ir_cap_table_review
orgos skills run ir_disclosure_calendar
```

---

## Skills

| id | runtime | 用途 |
|----|---------|------|
| `ir_cap_table_review` | cli | cap table 合計 · 重複検証 |
| `ir_disclosure_calendar` | cli | 開示予定一覧 |
| `ir_materials_prep` | agent | 資料下書き |
| `ir_shareholder_comm` | agent | 株主コミュニケーション下書き |

---

## Validation Rules

- `fully_diluted_pct` 合計 ≈ 100%（±0.5%）
- `holder_ref` + `security_type` 重複禁止
- `INV-*` / `DISC-*` / `IRM-*` id 形式
- L2 個人連絡先を tracked YAML に書かない

`collectIrIntegrityIssues()`（`src/lib/investor-relations/integrity.ts`）が上記を `orgos validate` に統合する。モジュール有効かつテナント YAML 不在は **error**、モジュール無効でデータのみ存在する場合は warning。

### データ読取境界

IR loader は **テナントの live YAML のみ**（`loadModuleDataFile(..., { source: "tenant-live" })`）を読む。`*.yaml.example` と module seed へはフォールバックしない。未セットアップ（live ファイルなし）は `coverage: unregistered` を返し、サンプル値が実データに見えることはない。

### Capital raise クロスチェック

`data/finance/capital-raise-cases.yaml` の `cap_table` と IR SSOT を突き合わせる（`capital-raise-crosscheck.ts`）。

| 検出 | stage | level |
|------|-------|-------|
| `holder_ref` が IR cap table に無い | `closed` | error |
| 同上 | `diligence` / `term_sheet` / `closing` | warning |
| `security_type` 不一致 | 上記全て | warning |
| `fully_diluted_pct` 差 > 0.5% | 上記全て | warning |
| 重複数値の合計差 > 0.5% | `closed` | error |
| 同上 | 上記以外 | warning |

出力先: `orgos validate` · `orgos operations ir validate` · `orgos operations ir cap-table-review` · `orgos finances capital-raise-crosscheck`（Finance 側）。Finance briefing の注記にも error 件数を載せる。

---

## Chat / Dashboard 統合

| 面 | 実装 | 内容 |
|----|------|------|
| Steward Chat 決定論回答 | `operator_ir_briefing` fact provider | cap table 行数 · 開示予定 · 資料件数（L1） |
| Today | `## IR KPI` セクション | 同上 + overdue 件数 |
| Dashboard KPI | `ir_disclosure` | 90 日以内の開示予定 |

いずれも `buildIrBriefingView()` を経由し、L2 連絡先値は出力しない。

---

## Activation

1. `orgos modules activate investor_relations` — seed を `data/investor-relations/` へ
2. `orgos operations ir validate`
3. `orgos modules sync-context` — `rules/active_context.md` に反映
4. Agent roster に `investor_relations` を有効化（P2 拡張）
