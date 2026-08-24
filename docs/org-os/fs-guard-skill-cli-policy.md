# FS-guard Skill CLI policy

**版:** 1.3 · **日付:** 2026-08-24  
**ADR:** [0039-agent-fs-guard](../adr/0039-agent-fs-guard.md)

`orgos guard apply` が正本の canonical write 経路。既存 Skill CLI の一部は **例外として文書化** し、段階的に guard 経由へ移行する。

正本コード: `src/lib/org/fs-guard/skill-cli-policy.ts`（`orgos doctor` が例外件数を warn）

**直接 write 凍結:** `src/lib/org/fs-guard/canonical-write-baseline.ts` · `npm run check:canonical-writes`（`npm run check` に含む）。baseline キーは **`file:symbol` 件数**（行番号ではない）。新規 `writeFileSync` / `cpSync` 等は baseline 更新なしでは CI 失敗。

## Skill Agent コンテキスト移行

`orgos skills run` は `skill.agent_id` が無い場合 **module の `moduleId` を Agent id として FS-guard コンテキストに載せる**。enforce 有効化前に、解決された Agent に **有効な identity と write grant** が必要。`orgos guard init --seed` · `orgos guard keygen --agent <id>` · `orgos guard grant …` で整備する。`orgos doctor` は identity/grant 不足 Skill を **WARN**（exit 1 にしない）。

| Command | Status | Note |
|---------|--------|------|
| `orgos guard apply` | guard_required | Primary canonical write path after init; `--expected-sha256` required |
| `orgos guard hash` | guard_required | Prints current canonical sha256 for CAS |
| `orgos finances add` | guard_required | Uses applyAgentWrite when FS-guard is enforced (finance agent) |
| `orgos finances reconcile` | guard_required | Read-only by default; `--output` uses applyAgentWrite when enforced |
| `orgos broker transfer` | guard_required | `--write` stores instruction under runs/broker/ via finance agent when enforced |
| `orgos agent dispatch run` | guard_required | Dispatch context.path checked by fs-guard when initialized |
| `operator_guard_apply` | guard_required | LLM canonical write — host signs; `expected_sha256` required; not gated by `ORGOS_LLM_TOOLS_WRITE` |
| `orgos skills run` | guard_required | Sets FS-guard agent from `skill.agent_id` or module `moduleId` fallback |

## 関連

- [agent-fs-guard.md](agent-fs-guard.md)
- [passkey-production-security-plan.md](passkey-production-security-plan.md)
- [aia-parallel-runtime.md](aia-parallel-runtime.md)
