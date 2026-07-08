# OrgOS Agent Portability Assessment

**Overall:** 95% · **Target (all ≥90%):** ✓ met

| 観点 | スコア |
|------|-------:|
| 定義のポータビリティ | 97% |
| 実行の自動化 | 96% |
| 用語・UX の中立性 | 96% |
| Anthropic ネイティブ API | 92% |

## 根拠

- Agent export INDEX あり
- tool-neutral-development.md 正本あり
- コア Agent 6 件
- runtime.yaml shell profiles
- dispatch portable fallback (LLM / shell / manifest)
- Work Order プロンプトに Agent 本文 embedded
- Skill runtime agent: 79
- Skill runtime cli: 34
- cursor-only → agent 正規化（load 時）
- Anthropic Messages API ネイティブ（ORGOS_LLM_PROVIDER=anthropic）
- OpenAI 互換 API 継続サポート
