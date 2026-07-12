# ADR 0007: 非イベント領域の境界（State SSOT）

**状態:** Accepted  
**日付:** 2026-07-12  
**決定者:** OpenOrgOS コアメンテナ

---

## Context

Event First を全業務 YAML に適用すると規模過大になる。軸 4（Event First）のスコアを汚さないため、**必須領域**と **State SSOT 領域**を分ける。

## Decision

### Event First 必須

- `src/lib/protocol/**`
- company-events chain
- routing queue · delivery ledger · wire/witness pending lifecycle

### State SSOT（イベント化しない）

| 領域 | 正本 | 方針 |
|------|------|------|
| Scheduling cases | `data/executive/scheduling-*.yaml` | 状態ファイル · 監査フィールド推奨 |
| Modules / roster activation | `modules.yaml` · `agents.yaml` | Catalog/Roster 分離を維持 |
| 業務モジュール seed | `steward/modules/**/seed` · テナント `data/` | validate で整合 |
| Ops / plans / finance 台帳 | 各 YAML | CLI 集計 · 必要なら別 Epic でイベント化 |

新規機能が Protocol / 組織間 wire / 会社イベントに触れる場合のみ Event First 必須。

## Consequences

### 正

- Protocol 準拠と業務速度を両立
- assessment 軸 4 の評価範囲が明確

### 負

- State 領域の履歴監査は弱い（必要なら company-events または audit-log へ明示リンク）

## 関連

- [0005](0005-event-first-standard-patterns.md)
- [0003](0003-constitution-code-compliance-roadmap.md)
