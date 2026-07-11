# ADR 0001: Engineering Constitution の採用

**状態:** Accepted  
**日付:** 2026-07-11  
**決定者:** OpenOrgOS コアメンテナ

---

## Context

OpenOrgOS は数十年規模で保守されるインフラとして設計されている。既存ドキュメントは次のように **レイヤーが分離** されていた。

- **運用:** `steward/rules/operator-policy.md` — AI 境界 · データ分類
- **OS 思想:** `steward/rules/steward_os_principles.md` — 4 層 · Data 原則
- **開発手順:** `steward/rules/tool-neutral-development.md` — CLI 正本 · Skill runtime

一方、**SSOT · Event First · Catalog/Roster 分離 · レイヤードアーキテクチャ · Definition of Done** など、コード品質と長期保守に関する横断原則は単一正本がなかった。AI コーディング支援の増加に伴い、実装提案時の共通基準が必要になった。

## Decision

1. **OpenOrgOS Engineering Constitution v1.0** を採用する。索引: `steward/rules/openorgos-engineering-constitution.md` · 分割正本: `steward/rules/engineering/00–09`.
2. 憲章本文は **英語**（全リポジトリ · 全言語向け）。索引に **日本語の OrgOS マッピング** を付す。
3. ADR 運用を `docs/adr/` で開始する（本 ADR が初回）。
4. `AGENTS.md` および開発チェックリストから本憲章を参照する。
5. 2026-07-11 追記: [ADR 0002](0002-engineering-rules-split.md) に従い `steward/rules/engineering/` 10 ファイル分割を実装。

## Consequences

### 正

- 人間 · AI 双方が参照できる **エンジニアリング憲章**（索引 + `engineering/` 分割正本）が確立される
- Catalog/Roster（`agent-catalog` / `agent-roster`）等の既存方向性と明示的に整合する
- ADR により今後の major 判断を追跡可能にする

### 負 · 保留

- 既存 `src/` 全体が憲章に完全準拠しているわけではない — 段階的リファクタが必要
- Event First は Wire delivery ledger 等で部分実装 — 全ドメインへの拡大は別 ADR で判断
- 憲章 §11 Definition of Done — [.github/pull_request_template.md](../../.github/pull_request_template.md) にチェックリスト反映（2026-07-11）

## 関連

- [openorgos-engineering-constitution.md](../../steward/rules/openorgos-engineering-constitution.md)
- [tool-neutral-development.md](../../steward/rules/tool-neutral-development.md)
- [framework-assessment.md](../framework-assessment.md)
