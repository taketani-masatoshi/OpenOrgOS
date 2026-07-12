# ADR 0006: Clock / ID 注入と ambient Date allowlist

**状態:** Accepted  
**日付:** 2026-07-12  
**決定者:** OpenOrgOS コアメンテナ

---

## Context

決定論的 replay（Constitution §1.5）には ambient `Date.now()` / `Math.random()` を Domain 書込から排除する必要がある。  
`src/lib/runtime-context.ts`（`getClock` · `getIdGenerator`）を導入済み。境界と例外を明文化する。

## Decision

1. **Domain 書込**（protocol · queue · company-events · audit · hub registry）は `getClock()` / `getIdGenerator()` を使う。`currentDate()` / `currentMonth()` も Clock 経由。
2. **Allowlist**（ambient Date 可）:
   - Transport / UI（SSE heartbeat · CLI 進捗スタンプ · backup ファイル名）
   - External adapters（Gmail bind 期限 · HTTP timeout · SLA で `now` 引数注入可能なもの）
   - Cryptographic key rotation の壁時計
   - Pure date math（`daysBetween` が ISO 文字列のみを扱う場合）
3. テストは `setRuntimeContext` / `resetRuntimeContext` を標準とする。

## Consequences

### 正

- replay テストが安定
- CI の ambient-clock スキャンで回帰検知可能

### 負

- レガシー呼び出しの段階移行が残る（allowlist 外は順次置換）

## 関連

- [0005](0005-event-first-standard-patterns.md)
- `src/lib/runtime-context.ts`
- `steward/rules/engineering/08-event-sourcing.md`
