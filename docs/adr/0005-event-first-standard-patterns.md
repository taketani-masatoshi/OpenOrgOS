# ADR 0005: Event First 標準パターン（Protocol · company-events）

**状態:** Accepted  
**日付:** 2026-07-12  
**決定者:** OpenOrgOS コアメンテナ

---

## Context

Engineering Constitution §1.3–1.5 / `08-event-sourcing.md` は Event First を要求する。  
参照実装では queue · delivery · wire/witness pending · company-events が段階的に append-only 化した。パターンを固定し、新規 Protocol 機能の逸脱を防ぐ。

## Decision

次を **標準パターン** とする:

| ドメイン | SSOT | 派生 | 書込順 |
|---------|------|------|--------|
| Routing queue | `docs/.../queue/events.jsonl` | reduce → 現在状態 | append status · in-place 禁止 |
| Wire delivery | `delivery-attempts.jsonl` | YAML snapshot optional | Repository.append |
| Wire / witness pending | active YAML + `*-pending-lifecycle.jsonl` | — | archive で lifecycle 追記 |
| Company events | `company-events-chain.jsonl`（payload 付き） | yaml · MD frontmatter | append → materialize |

**MD narrative:** company-events の本文は初回作成のみ。以降は frontmatter patch のみ。

## Consequences

### 正

- 新規 Protocol PR は表のパターンに合わせればレビュー容易
- replay / materialize で監査可能

### 負

- 業務 YAML（scheduling · modules 等）は本 ADR の対象外 → [0007](0007-non-event-domain-boundary.md)

## 関連

- [0003](0003-constitution-code-compliance-roadmap.md)
- [0006](0006-clock-id-injection-allowlist.md)
- `steward/rules/engineering/08-event-sourcing.md`
