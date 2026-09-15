# 財務アサーション ワークペーパー — 2026年（暦年）

テナント: Sole Prop Blue Return Fixture（_fixture-sole-prop）
期間: 2026-01-01 〜 2026-12-31

- 外部会計監査人の意見・保証ではない（ADR 0069）。内部ワークペーパー。
- J-SOX / ISO 内部監査と混同しないこと。
- warning: 2026 年の period-locks が 0 件 — 締めロック未実施の可能性
- warning: [presentation_total_jump_journals_unchanged] 仕訳ハッシュ不変なのに資産合計が変化（baseline -40000 → -50000）。表示再分類の疑い

## アサーション

| アサーション | 手続概要 | 結果欄（人間） |
|--------------|----------|----------------|
| 実在性 Existence | 試算表残高と補助元帳・証憑の突合 | |
| 網羅性 Completeness | 期間仕訳件数・締めロック | |
| 評価 Valuation | 資産評価・減価償却（別紙） | |
| 期間帰属 Cut-off | 期末前後の仕訳カットオフ | |
| 表示 Presentation | 主要科目 · 表示健全性（error 0 / warning 1） | |

## 機械サマリ

- CoA 科目数: 17
- 試算表行数: 3
- 試算貸借一致: はい
- 期間内仕訳件数: 2
- 期間内 period-locks 件数: 0

## 署名

| 役割 | 氏名 | 日付 |
|------|------|------|
| 実施者 | | |
| レビュー | | |

テンプレ原本: `steward/standards/audit/financial/templates/`

ISO 内部監査との境界: 本 WP は財務アサーション（ADR 0069 financial）。ISO 記録検査は `orgos iso records check`。