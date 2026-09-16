# Skill: hr_onboard（入社 · L1 名簿追記）

## 目的

CEO の入社依頼を決定論的に処理する。

1. **plan（dry-run）** — 次 EMP-id · チェックリスト · 起票予定の担当
2. **apply（`--write` / チャット確認後）** — `data/hr/employees.yaml` へ L1 追記のみ + HR / Finance の実 Work Order

給与額 · 雇用契約本文 · 社保届 · マイナンバーは **自動適用しない**。

## 入力

- `--name`（必須 · L1 氏名）
- `--hired-date`（任意 · YYYY-MM-DD）
- `--write`（適用。省略時は plan のみ）

## 出力

- 確認文 / 受付 `IMP-…` · 実行状況 / 委譲と回答への案内
- JSON オプションあり

## 使用 Agent

Human Resources · Executive Steward（チャット確認カード経由）

## CLI

```bash
npm run orgos -- hr onboard --name 大谷
npm run orgos -- hr onboard --name 大谷 --hired-date 2026-09-01 --write
npm run orgos -- skills run hr-onboard --name 大谷 --write
```

## runtime

`cli` — LLM 不要。

## 禁止

- payroll.yaml の金額改定
- 契約 YAML の自動生成
- L2（口座 · 住所 · 個人電話 · マイナンバー）の出力
- チャットで「完了した」と述べること（残作業は Work Order）
