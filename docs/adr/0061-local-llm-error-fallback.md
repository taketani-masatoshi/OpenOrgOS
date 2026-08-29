# ADR 0061: Local LLM ERROR Fallback

**Status:** Accepted  
**Date:** 2026-08-26

## Context

ローカル LLM worker（Ollama 等）は、クラウドモデルより grounding が弱く、拒否エッセイ・プレースホルダ・「未確認」混在の応答が増える。Steward Chat の Grounding rule #5 は cloud 向けに **未確認** を許容するが、ローカルでは機械可読な失敗シグナルが必要。

ADR 0060 は **データ変更** を plan/apply で封じる。本 ADR は **読取 Q&A 応答** の失敗形式を統一する。

## Decision

1. **SSOT:** `src/lib/operator-runtime/local-llm-error-fallback.ts`
2. **条件:** worker `tier === "local"` かつ `ORGOS_LOCAL_LLM_ERROR_FALLBACK !== "0"`
3. **プロンプト:** system に mandatory block を追記 — Grounding #5（未確認）を **上書き**
4. **出力:** 必要情報欠落時は **`ERROR: <理由>` 1行のみ**（理由は日本語可）
5. **enforce:** 未確認・プレースホルダ・長文拒否は runtime が `ERROR: 必要な情報が不足しています` に矯正
6. **structured pass:** `ERROR:` 確定時は `operator_response` 2nd pass を **スキップ**
7. **Fact refusal guard:** 意図的 `ERROR:` は post-LLM 委譲対象外
8. **メール解釈:** JSON 不可時は ERROR 行を許容し、捏造 JSON を返さない（`undefined` → 既存 fallback）
9. **適用経路:** `tool-loop` 経由の全 ask（Chat · dispatch · MCP · CLI）+ mail 解釈

## Consequences

- ローカル LLM の失敗が UI / テレメトリ（`local_error`）で識別可能
- クラウド worker 挙動は不変
- Agent MD 55 件への個別追記は不要（runtime 注入 + `steward/rules/local-llm-error-fallback.md`）

## Related

- [0060-local-llm-change-gates.md](0060-local-llm-change-gates.md)
- [0033-deterministic-fact-provider-registry.md](0033-deterministic-fact-provider-registry.md)
- [0034-llm-worker-pool-routing.md](0034-llm-worker-pool-routing.md)
- [local-llm-error-fallback.md](../../steward/rules/local-llm-error-fallback.md)
