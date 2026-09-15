# 2025年分 税務報告書パック

| 項目 | 内容 |
|------|------|
| 屋号 / 氏名 | KLab |
| 期間 | 2025-01-01 〜 2025-12-31 |
| 位置づけ | 税理士転記用ドラフト（提出・e-Tax 送信は人間） |

## 目次

- [サマリ](#サマリ)
- [書類一覧](#書類一覧)
- [留意事項](#留意事項)

## サマリ

| 項目 | 金額（円） |
|------|----------:|
| 売上（収入） | 327,273 |
| 経費計（事業分） | 71,080 |
| 所得（青色控除前） | 256,193 |
| 青色申告特別控除 | 256,193 |
| 事業所得（控除後） | 0 |
| 控除上限（cap） | 550,000 |
| 消費税（課税事業者（本則）） | 25,619（納付） |

## 書類一覧

| 区分 | 書類 | リンク |
|------|------|--------|
| 財務諸表 | 損益計算書 | [pl.md](./pl.md) |
| 財務諸表 | 貸借対照表 | [bs.md](./bs.md) |
| 所得税 | 青色申告決算書 | [aoiro-kessansho.md](../../blue-return/2025/aoiro-kessansho.md) |
| 所得税 | 確定申告書B | [kakutei-shinkoku-b.md](../../blue-return/2025/kakutei-shinkoku-b.md) |
| 所得税 | 青色特別控除ゲート | [deduction-gate.md](../../blue-return/2025/deduction-gate.md) |
| 所得税 | 税理士引き渡し | [handoff.md](../../blue-return/2025/handoff.md) |
| 帳簿 | 複式帳簿パック | [00-README.md](../../blue-return/2025/00-README.md) |
| 消費税 | 申告金額ドラフト | [consumption-tax-draft-return.md](../../tax/consumption/2025/consumption-tax-draft-return.md) |
| 源泉 | 支払調書ドラフト | [payment-slips-draft.md](../../tax/withholding/2025/payment-slips-draft.md) |

## 留意事項

- 空月・未ロック月は setup の acknowledge を前提とする（デモは年初仕訳が中心）
- 消費税の期末振替 JE が無い場合は仮受/仮払残高が残る
- e-Tax XML / 行政提出ファイルは生成しない

出典: [国税庁 No.2072](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2072.htm)
