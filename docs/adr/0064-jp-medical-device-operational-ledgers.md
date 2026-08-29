# ADR 0064: 医療機器薬事の運用台帳と文書カタログの分離

**状態:** Accepted  
**日付:** 2026-08-28  
**決定者:** OpenOrgOS コアメンテナ

---

## Context

`jp_medical_device` は QMS/GVP **文書カタログ**と MD ひな形ドラフトまでは揃っていたが、品目認証期限・変更管理・当局照会・CAPA・PMS・苦情分類・責任者承認・監査証跡といった **運用ワークフロー**は空台帳またはテンプレ文言のみだった。文書生成と案件ライフサイクルを同一 CLI に混在させると、業許可申請（ADR 0011）と同様にライフサイクル評価が曖昧になる。

## Decision

1. **文書カタログ（QMS/GVP）** は従来どおり `qms-catalog` / `gvp-catalog` + `draft`。`--write` 成功時に `document_control` 台帳へ版行を追加する。
2. **運用台帳** は型付き YAML（`complaint` · `adverse_event` · `training` · `document_control` · `change_control` · `capa` · `pms` · `authority_inquiry` · `distribution` · `manufacturing_batch`）。CLI: `ledger add|close` · `capa` · `change` · `inquiry` · `pms` · `deadlines`。CAPA は `schedule-effectiveness` → `record-effectiveness` → `close`（有効性確認済みまたは `--force`）。`ledger close --type capa|authority_inquiry` も同一ゲート。
3. **責任者承認** は新規承認基盤を作らず、既存 `org approval` の `subject_type` を使う:
   - `medical_device.doc_revision`（承認時に `effective_on` を確定）
   - `medical_device.capa_close`
   - `medical_device.change_implement`
   - `medical_device.gvp_report`（提出**承認**。提出**事実**は `ae mark-filed` の `report_filed_on`）  
   最終承認は人間のみ（HumanApprovalContext）。LLM / MCP は approve しない。 reject は `status_before_approval` を復元。
4. **監査証跡** は `data/medical-device/audit.jsonl`（gitignore · append-only · L1 のみ）。患者 PII を書かない。
5. **品目申請ドラフト** は社内チェックリスト MD のみ（`application draft`）。業許可申請は `jp_permit_application` / `jp_permit_registry` に残す（ADR 0011）。**行政・認証機関への自動提出は禁止**。
6. GVP 報告期限は定数 `GVP_REPORT_LEAD_DAYS`（death 7 / serious 15 / other 30）で決定論計算。提出事実は `report_filed_on` のみ記録（`ae mark-filed`）。
7. **`orgos validate`（integrity）** はモジュール有効時に業許可 `expires_on` · GVP/CAPA/照会 overdue · 未知 `device_id` をゲートする。

## Consequences

### Positive

- カタログ充足と案件期限が `validate` / Canvas / `deadlines` で分離して見える
- 承認は既存 CEO 受信箱に載る
- 業許可申請モジュールとの境界が維持される

### Negative / Trade-offs

- 台帳エントリは YAML 可変更新（Event First の厳密な不変イベントではない）。監査は jsonl で補完
- 法令日数は簡略定数 — 実運用では薬事担当が確認する

## Related

- [0011](0011-jp-permit-application-vs-registry.md) · [0012](0012-business-vs-compliance-fulfilment.md) · [0038](0038-human-approval-context.md) · [0060](0060-local-llm-change-gates.md)
- モジュール: `steward/jurisdiction-packs/JP/modules/jp_medical_device/`
- スキーマ: `schemas/jp-medical-device.ts`
