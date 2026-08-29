# Local LLM ERROR Fallback

**版:** 1.0 · **日付:** 2026-08-26  
**ADR:** [0061](../../docs/adr/0061-local-llm-error-fallback.md)  
**実装:** `src/lib/operator-runtime/local-llm-error-fallback.ts`

## 目的

ローカル LLM（Ollama 等 · worker `tier: local`）は、クラウドモデルより grounding が弱い。必要情報が prompt / tool 結果 / 添付に無いとき、拒否エッセイ・「未確認」・プレースホルダを出さず、**機械可読な1行失敗**に統一する。

## 規約

| 条件 | 出力 |
|------|------|
| 回答に必要な事実が context に **無い** | `ERROR: <理由>` **1行のみ**（日本語理由可） |
| 事実が grounded されている | 従来どおり短文 CEO 向け回答 |

例:

```
ERROR: Today context にバーンレートが含まれていない
```

## 適用範囲

- Steward Chat（executive_steward · secretary）
- Work Order dispatch（portable LLM）
- MCP `steward_ask` · CLI `orgos chat ask`
- Secretary メール解釈（JSON 不可時は ERROR 行 · 捏造 JSON 禁止）

**クラウド worker** では従来の Grounding rule #5（**未確認**）を維持。

## 無効化

```bash
export ORGOS_LOCAL_LLM_ERROR_FALLBACK=0
```

## 関連

- [operator-policy.md](operator-policy.md) §4.1b
- [0060-local-llm-change-gates.md](../../docs/adr/0060-local-llm-change-gates.md) — YAML 直書き禁止
- [0033-deterministic-fact-provider-registry.md](../../docs/adr/0033-deterministic-fact-provider-registry.md) — 決定論 pre-handler
