# Skill: annual_close（年次決算）

**Path:** `steward/core/skills/annual_close.md`
**Runtime:** `cli`

## 目的

会計年度の総勘定元帳を締める。各月が月次決算ゲートを満たしてロック済みであること。通ったときだけ、期末日に損益を繰越利益剰余金へ振り替え、本番の `opening-balances.yaml` を翌期の開始残高へ切り替える。失敗したときは書き換えない。

提案ファイル `data/finance/opening-balances.FY####.yaml` は残してよい。試算表が読む正本は本番ファイルだけである。

## ロック条件

- 会社の決算月で決まる会計年度の、すべての月
- 各月の月次ゲート（`evaluateMonthlyCloseGates`）が通り、期間ロック済み
- 損益振替だけは、ロック済みの期末月へ追記してよい
- 不合格なら仕訳も本番の開始残高も書かない

法人税等の計上仕訳、申告、配当・利益準備金は条件にしない。

## CLI

```bash
npm run orgos -- finances close --fiscal-year FY2026 -o fy2026-annual-close.md
npm run orgos -- report kessan --fy FY2026 --basis gl
npm run orgos -- report jigyo --fy FY2026 --basis gl
npm run validate
```

## 禁止

- 失敗した締めでの期首ファイル上書き
- ロック中の通常仕訳
- 申告送信と利益処分の自動起票
