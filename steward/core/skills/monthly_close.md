# Skill: monthly_close（月次決算）

**Path:** `steward/core/skills/monthly_close.md`
**Runtime:** `cli`

## 目的

指定月の総勘定元帳を締め、統一ゲートを満たしたときだけ期間ロックする。実績の正本は `journal-entries.yaml`（ADR 0053）。銀行明細は `bank-account.yaml` が `none` でなければ必須。月次 YAML がある月は突合不一致でロック不可、無い月だけ plan 未取込 warning。

## 入力

- `data/finance/journal-entries.yaml`
- `data/finance/opening-balances.yaml`
- `data/finance/chart-of-accounts.yaml`
- `data/finance/monthly/{YYYY-MM}.yaml`（月次損益の起票元。ファイルがある月は突合不一致でロック不可）
- `data/finance/fixed-assets.yaml`（減価償却がある月）
- `data/finance/payroll.yaml`（給与発生がある月）
- `data/finance/bank-account.yaml`（`none` / `active`）
- `data/finance/bank-statements.yaml`（`active` のとき必須・当月未消込ゼロ・GL 突合）

## 出力

- 追記された仕訳（減価償却・給与発生・月次損益・決算整理）
- `data/finance/period-locks.yaml`（ゲート通過時のみ lock）
- 任意で `docs/reports/agent-summaries/accounting/{YYYY-MM}-close.md`

## ロック条件

次がすべて error なし:

- 必要な自動仕訳が計上済み
- 月末日の試算表と貸借対照表が一致
- 補助元帳（1150 / 2110）が統制勘定と一致し、未割当残高がない
- 銀行明細ファイルがある場合、対象月行が1件以上あり未消込が 0（ファイルが無ければスキップ）
- 消費税集計が例外なく返り、課税事業者判定根拠と本則課税の控除方式に blocking がない。取引別インボイス状態・用途区分の不足は証跡警告として残す
- `orgos validate` のうち `data/finance/` の error が 0（warning と帳簿外の error はロック条件にしない）

月次 YAML の欠落・元帳との差異は warning とし、期間ロックは妨げない。ロック時には仕訳・銀行突合・試算表・ゲート結果の SHA-256 証跡を `period-locks.yaml` に保存する。

## 訂正

ロック済み月には起票しない。理由付き unlock → 同月の逆仕訳 → 再 close。

## 使用 Agent

Accounting Agent（Finance へ予実解釈を委譲）

## CLI

```bash
npm run orgos -- finances close --month YYYY-MM -o YYYY-MM-close.md
npm run orgos -- ledger trial-balance --as-of YYYY-MM-DD
npm run orgos -- ledger monthly-reconcile --month YYYY-MM
npm run validate
```

基準日は対象月の末日。`YYYY-MM-28` では月末仕訳が試算表から落ちる。

## 禁止

- 契約条項の変更
- 経営判断（投資優先度等）
- ロック中の直接訂正（逆仕訳以外の書換）
