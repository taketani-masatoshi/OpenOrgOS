# Architecture Decision Records (ADR)

OpenOrgOS の **主要なアーキテクチャ判断** を記録する。正本は本ディレクトリ。

**憲章:** [steward/rules/openorgos-engineering-constitution.md](../../steward/rules/openorgos-engineering-constitution.md) §9

## 形式

| 項目 | 内容 |
|------|------|
| **番号** | `NNNN-kebab-title.md`（4 桁ゼロ埋め · 昇順） |
| **状態** | Proposed · Accepted · Deprecated · Superseded |
| **必須セクション** | Context · Decision · Consequences |

## 一覧

| ADR | タイトル | 状態 |
|-----|---------|------|
| [0001](0001-adopt-engineering-constitution.md) | Engineering Constitution の採用 | Accepted |
| [0002](0002-engineering-rules-split.md) | Engineering Rules の分割構成 | Accepted |
| [0003](0003-constitution-code-compliance-roadmap.md) | 憲章とコード準拠ロードマップ | Accepted |
| [0004](0004-gmail-deferred-opt-in-gate.md) | Gmail / tenant-mail deferred · opt-in 本番ゲート | Accepted |

## 新規 ADR

1. 次の番号で `docs/adr/NNNN-title.md` を作成
2. 本 README の一覧表を更新
3. 関連する `steward/rules/` または `docs/spec/` からリンク
