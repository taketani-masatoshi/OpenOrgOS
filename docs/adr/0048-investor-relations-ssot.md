# ADR 0048 — Investor Relations SSOT（自社 IR 視点）

- **Status:** Accepted
- **Date:** 2026-08-24
- **Context:** `investor_relations` Agent は registry · routing · Skill 登録のみで、Primary Folder が `data/ir/**` と manifest の `data/investor-relations/` で不整合。`schemas/finance/capital-raise-case.ts` は loader のみで lib/CLI/tests が無い。JP capability catalog では `planned` のまま。

## Decision

1. **自社 IR 正本**はテナント `data/investor-relations/` のみ。人間向け資料索引は `docs/investor-relations/`。
2. **業務モジュール** `steward/modules/investor_relations/` を新設（`module_contract.md` 準拠）。`venture_capital`（GP 視点）は別 product surface — 混同しない。
3. **id 空間:**
   - cap table 行: `holder_ref` = `stakeholder_id` または非個人ラベル（L2 個人名禁止）
   - 投資家レジストリ: `INV-[A-Z0-9-]+`
   - 開示カレンダー: `DISC-[A-Z0-9-]+`
   - IR 資料: `IRM-[A-Z0-9-]+`
   - 資本調達ケース: 既存 `CASE-FR-*`（`data/finance/capital-raise-cases.yaml` · finance SSOT）
4. **三角関係:**
   - **IR** — cap table 構造化 · 投資家レジストリ · 開示カレンダー · IR 資料索引 · 説明会下書き
   - **corporate_governance** — 株主名簿 MD · 株総/取締役会議事録 · REG-002/003（Read + 委譲）
   - **finance** — 数値正本 · `capital-raise-cases.yaml` · 決算数値（Read + 委譲）
   - **legal** — 開示合规 · 契約条項（Read + 委譲）
   - **venture_capital** — GP ファンド運用（被投資企業 IR とは別）
5. **決定論 CLI:** `orgos operations ir show|validate|briefing|cap-table-review|disclosure-calendar`
6. **Skill:** `ir_cap_table_review` · `ir_disclosure_calendar` を `runtime: cli`（module skillHandlers）。`ir_materials_prep` · `ir_shareholder_comm` は `runtime: agent`（対話必須）。
7. **L2/L3:** 口座番号 · 個人住所 · 未公開情報を tracked MD / Chat に出力しない。`holder_ref` は id リンクのみ。

## Consequences

- `orgos validate` / `operations ir validate` が cap table 合計・重複 holder · 開示期限を検査
- `investor_relations_agent.md` の Primary Folder を `investor-relations/` に統一
- JP catalog の `investor_relations` を `implemented` へ昇格
- テナント未投入時は optional（`_template` seed のみ）

## Related

- [investor-relations-spec.md](../org-os/investor-relations-spec.md)
- [0047-sales-line-deterministic-stack.md](0047-sales-line-deterministic-stack.md)
- [0043-pmo-portfolio-ssot.md](0043-pmo-portfolio-ssot.md)
- `schemas/investor-relations/` · `src/lib/investor-relations/` · `steward/modules/investor_relations/`
