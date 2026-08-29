# Skill: jp_medical_device_ledgers

## 目的

医療機器関連台帳（出荷 · 製造ロット · 苦情 · 有害事象 · 教育訓練 · 文書管理 · CAPA · 変更 · PMS · 当局照会）の索引・件数・型付き追加・クローズ・期限スキャン。

## CLI

```bash
npm run orgos -- operations medical-device ledger list
npm run orgos -- operations medical-device ledger status
npm run orgos -- operations medical-device ledger add --type training --fields '{"topic":"QMS","held_on":"2026-08-01","attendee_refs":["OP-001"]}'
npm run orgos -- operations medical-device deadlines
npm run orgos -- operations medical-device obligations --role mah
npm run orgos -- operations medical-device capa list --open
npm run orgos -- operations medical-device capa schedule-effectiveness --id CAPA-... --on 2026-09-15
npm run orgos -- operations medical-device capa record-effectiveness --id CAPA-... --result effective
npm run orgos -- operations medical-device capa close --id CAPA-...
npm run orgos -- operations medical-device ae-mark-filed --id AE-... --on 2026-08-01
npm run orgos -- operations medical-device complaint-promote-ae --id CMP-...
npm run orgos -- operations medical-device inquiry close --id INQ-...
npm run orgos -- operations medical-device change list --open
npm run orgos -- operations medical-device inquiry list --open
npm run orgos -- operations medical-device inquiry set-response --id INQ-... --path docs/...
npm run orgos -- operations medical-device pms list
npm run orgos -- operations medical-device audit list
```

## CAPA 有効性

1. `capa open` → `open`
2. `capa schedule-effectiveness --on YYYY-MM-DD` → `effectiveness_check`
3. `capa record-effectiveness --result effective|ineffective` → `in_progress` / `open`
4. `capa close`（有効性スケジュール済みなら `effective` 必須。`root_cause`+`action` 必須。デモは `--force`）
5. `ledger close --type capa` も同一ゲート

## GVP 提出

- `gvp escalate --propose-approval` = 提出**承認**（`medical_device.gvp_report`）
- `ae-mark-filed --on` = 提出**事実**（`report_filed_on` · deadlines から除外）

## データ正本

`data/medical-device/ledgers/*.yaml` · 監査 `data/medical-device/audit.jsonl`（gitignore）
