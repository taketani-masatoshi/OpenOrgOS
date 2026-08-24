# ADR 0053: Module Readiness Score（公式 7 軸）

**Status:** Accepted  
**Date:** 2026-08-24

## Context

ビジネスモジュールの完成度は Canvas 内の私的 7 軸ルーブリックで算出されており、`seed ファイル 8 本以上` や `mal で有効` を満点条件に含む水増しが可能だった。組織 Agent は `orgos agent readiness` が正本だが、モジュール側に同等の CLI が無かった。

## Decision

1. **`src/lib/module-readiness-score.ts`** を正本ルーブリックとする。
2. **`orgos modules readiness [--tenant] [--module] [--json] [--min]`** でテナント有効モジュールまたは全カタログを採点する。
3. **7 軸（合計 100）**
   - 定義 15 — manifest · agent.md · catalog id
   - 契約 15 — `checkModuleCatalogOnly`（宣言 seed の実在。ファイル数カウント禁止）
   - CLI 20 — `module-cli` 登録 · `cli_commands` 宣言と実サブコマンド一致
   - Skill 10 — モジュール co-located skill registry
   - テスト 15 — 専用 Vitest（ファイル名または `@catalog-ids`）
   - tier 10 — `readiness.yaml`（production_ready=10 · activation_ready=7 · skeleton=4）
   - 稼働 15 — 有効テナントが 1 つ以上（`--tenant` 指定時は当該テナントの enabled）
4. mal 100 点引き上げは **mal roster / modules.yaml 有効分のみ** を対象とし、全 43 モジュールの一括 100 化は行わない。

## Consequences

- `cli_commands` 未宣言モジュールは CLI 軸で減点され、実態が可視化される。
- Canvas のモジュール表は本 CLI 出力に同期する。
- Agent readiness（`agent-readiness.ts`）とは独立。同一 id（customer_success · investor_relations）の混同に注意。

## Related

- [0050](0050-customer-success-deterministic-stack.md) — customer_success 決定論スタック
- [0048](0048-investor-relations-ssot.md) — investor_relations SSOT
- `orgos agent readiness` — 組織 Agent 完成度（別カタログ）
