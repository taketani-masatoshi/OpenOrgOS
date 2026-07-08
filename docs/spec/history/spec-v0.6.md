> **履歴アーカイブ — 正本は [docs/spec.md](../../spec.md)。** 本書は凍結コピー。

# Steward OS — Specification v0.6

> **正本:** OS-100 Epic · 製品 100/100 達成。v0.5 は [spec-v0.5.md](spec-v0.5.md)。

## v0.6 変更概要

| 領域 | 内容 |
|------|------|
| **OS-100 DoD** | [framework-assessment.md](framework-assessment.md) §9 |
| **Audit trail** | `steward audit log append|list` · append-only JSONL |
| **ISO gap CLI** | `steward compliance gap` |
| **Pipeline weekly** | `steward pipeline run weekly` |
| **Skill CLI ≥12** | dashboard · forecast · revpar · schedule · one-on-one |
| **production_ready ×5** | rental · hospitality · professional_services · saas_subscription · restaurant |

## OS-100 Definition of Done

| ID | 定義 | 確認 |
|----|------|------|
| OS-1 | spec-v0.6 · DoD 表 | 本ファイル |
| OS-2 | framework-assessment §9 = 100% | DoD 全 ✓ |
| OS-3 | framework-backlog Phase E–H [x] | `tests/framework-backlog.test.ts` |
| OS-4 | production_ready ≥ 5 | `modules check --all` |
| OS-5 | production_ready invoice seed | module manifest `required_seeds` |
| OS-6 | Skill cli ≥ 12/17 | `steward skills list` |
| OS-7 | audit log CLI | `steward audit log list` |
| OS-8 | ISO gap CLI | `steward compliance gap --tenant mal` |
| OS-9 | pipeline weekly | `steward pipeline run weekly` |
| OS-10 | ops p0 ブロッカー 0（acme 骨格 · mal assessment 反映） | `ops p0 --tenant acme` |

## Phase 2（スコープ外 → **v0.7 実装済**）

- ~~Cursor Task API 並列起動~~ → `steward agent dispatch`
- ~~webhook · 外部キュー DB~~ → JSONL queue + `steward webhook`
- ~~Agent 結果自動マージ~~ → `steward escalate merge`

## 関連

- [spec-v0.7.md](spec-v0.7.md)

- [framework-backlog.md](framework-backlog.md)
- [steward/core/routing/README.md](../steward/core/routing/README.md)
