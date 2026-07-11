# ADR 0003: 憲章とコード準拠ロードマップ

**状態:** Accepted  
**日付:** 2026-07-11  
**決定者:** OpenOrgOS コアメンテナ

---

## Context

Engineering Constitution（[engineering/](../../steward/rules/engineering/00-このフォルダについて.md)）と索引（[openorgos-engineering-constitution.md](../../steward/rules/openorgos-engineering-constitution.md)）は整備済み。  
一方、参照実装 `src/` は **憲章の写しではない** — Layer 分離 · Event First · Catalog/Roster の適用度に差がある。

全コードを一度に書き換えるのは非現実的。段階的準拠の **優先順位** を固定する。

## Decision

### フェーズ A — ガードレール（2026-07 · 実装済み）

| 項目 | 手段 |
|------|------|
| 正本 / ミラー | `steward/rules/engineering/` → `.cursor/rules/` |
| 鮮度 | `validatePolicyMirrors()` · `orgos validate` · `npm run generated:check` |
| セキュリティ二重正本回避 | `07-security` は operator-policy 参照 · glob 適用 |
| PR DoD | [.github/pull_request_template.md](../../.github/pull_request_template.md) |

### フェーズ B — 新規コード（即時適用）

新規 · 改修 PR は次を **必須**:

1. §7 CLI Standard Path — ビジネスロジックは `src/lib/` · CLI から呼ぶ
2. §1.2 Catalog/Roster — 定義と runtime 状態を同一ファイルに混在させない
3. §8 Testing — Domain テスト可能 · 該当 tier の `npm test` script
4. §11 DoD — lint · ドキュメント · sync-policy（ルール変更時）

### フェーズ C — 既存ドメイン（優先順）

| 優先 | ドメイン | 憲章 | 目標 |
|------|---------|------|------|
| P0 | Wire / protocol | §1.3–1.5 · 08-event-sourcing | delivery ledger パターンを標準化 |
| P1 | Agent catalog / roster | §1.2 | catalog/roster 完全分離 · validate 強化 |
| P2 | Tenant business data | §1.1 SSOT | `data/` 正本 · 派生は CLI 生成のみ |
| P3 | Layer refactor | §3 | `commands/` → application · domain · repository 段階分割 |

各 P0/P1 完了時に ADR または `docs/spec/` 更新。

### フェーズ D — 計測（将来）

- `framework-assessment.md` に憲章準拠次元を追加
- Event-sourced ドメイン一覧を `08-event-sourcing.md` に維持

## Consequences

### 正

- 「憲章があるが従われない」状態を **新規変更から阻止**
- 既存コードは優先度付きで段階移行

### 負

- フェーズ C 完了まで **文書 > 実装** のギャップは残る
- Layer 全面リファクタは大規模 · 別 Epic

## 関連

- [0001-adopt-engineering-constitution.md](0001-adopt-engineering-constitution.md)
- [0002-engineering-rules-split.md](0002-engineering-rules-split.md)
- [framework-assessment.md](../framework-assessment.md)
