# ADR 0002: Engineering Rules の分割構成

**状態:** Accepted · **Implemented:** 2026-07-11  
**日付:** 2026-07-11  
**決定者:** OpenOrgOS コアメンテナ

---

## Context

[ADR 0001](0001-adopt-engineering-constitution.md) で Engineering Constitution を採用した。OpenOrgOS 規模に対し、Cursor / AI が **目的別ルール** を参照し、Wire · Event · 組織モデルを **独立進化** させる必要がある。

既存方針: `.cursor/rules/` は **ミラーのみ** — 正本は `steward/rules/`。

## Decision

### 正本構成（実装済み）

**正本** `steward/rules/engineering/` → **ミラー** `.cursor/rules/00-*.mdc` … `09-*.mdc`

| 正本 | Cursor | 適用 |
|------|--------|------|
| `00-engineering-constitution.md` | alwaysApply | Purpose · AI Rules · DoD |
| `01-architecture.md` | `src/**`, `schemas/**` | SSOT · layers · CLI |
| `02-typescript.md` | `**/*.{ts,tsx}` | Coding · TS |
| `03-python.md` | `**/*.py` | Python |
| `04-testing.md` | `**/*.{test,spec}.*` | Domain testing |
| `05-git.md` | 手動 | Git · PR |
| `06-documentation.md` | `docs/**`, `steward/**` | README · ADR |
| `07-security.md` | `src/**`, `data/**` | L0–L3 ポインタ（operator-policy 正本） |
| `08-event-sourcing.md` | protocol globs | Event First 等 |
| `09-openorgos-domain.md` | steward · schemas | 4-layer · Wire |

### 索引

[openorgos-engineering-constitution.md](../../steward/rules/openorgos-engineering-constitution.md) は **索引のみ**（全文は engineering/ に分割）。

### sync-policy · validate

- `syncEngineeringRules()` · `orgos operator sync-policy --emit engineering|all`
- `validatePolicyMirrors()` · `orgos validate`（ミラー鮮度 · `runIntegrityChecks` 経由）

各正本ファイル先頭に YAML frontmatter（`description` · `alwaysApply` · `globs`）。

## Consequences

### 正

- タスク別ルール参照 · 憲章の差分追跡が容易
- 正本ミラー分離を維持

### 負

- 10 ファイル + frontmatter 保守
- `07-security` は operator-policy 参照 — 内容変更時はリンク整合を確認

## 関連

- [engineering/ 索引](../../steward/rules/engineering/00-このフォルダについて.md)
- [tool-neutral-development.md](../../steward/rules/tool-neutral-development.md)
