# Skill: hr_dismissal_readiness

## 目的

解雇対象者が決まる前に、会社側の必要書類・人事手続きの参照がどこまで揃っているかを評価する。不足があれば置き場所のチェックリストを返す。解雇の実行・対象者の決定はしない。

## 使用 Agent

Human Resources Agent

## runtime

`cli` — LLM 不要。エージェントは結果の説明だけを行う。

## CLI

```bash
npm run orgos -- hr dismissal-readiness --ledger <file> --json
npm run orgos -- hr dismissal-readiness --ledger <file> --prepare --write --json
```

## 入力（会社単位）

- `work_rules_ref`
- `dismissal_ground_refs`（条文参照。本文なし）
- `notice_procedure`（`thirty_day_notice` | `notice_allowance`）
- `labor_condition_notice_template_ref`
- `guidance_process_ref`
- `fact_record_policy_ref`
- 任意: `probation_policy_ref`

対象者 ID・年齢・性別は含めない。

## 出力

- `score`（必須項目の充足率）
- `verdict`: `not_ready` | `documents_present`
- `missing` / `--prepare` 時の `checklist.actions`
- 注記: 書類が揃っても解雇できることの証明にはならない

## 禁止

- 解雇・懲戒の最終判断
- 解雇通知・予告手当計算の本文生成
- 対象者の選定
