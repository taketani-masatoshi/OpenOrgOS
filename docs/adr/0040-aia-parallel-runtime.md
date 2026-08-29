# ADR 0040 — AIA parallel runtime (10 / 20 / 30 concurrent)

- **Status:** Accepted（仕様正本 · ランタイム実装は後続）
- **Date:** 2026-08-24
- **Context:** Work Order `--parallel` 既定 3 と LLM worker `max_inflight` だけでは、部門・モジュール AIA を 10〜30 同時に安全運用できない。同一テナント FS への並列書込・プロンプトクロストーク・LLM 枯渇が未制御。

## Context

- Catalog / Roster · Primary Folders · 4 層は既に正本（[09-openorgos-domain](../../steward/rules/engineering/09-openorgos-domain.md)）。
- モジュール `limits.concurrent_jobs` はスキーマのみで未 enforce（[module-security-manifest](../../schemas/module-security-manifest.ts)）。
- 統合役は Executive + Secretary Orchestrator に分散し、常設 Integration Agent が無い。
- 必要: テナント枠・作業スペース隔離・モジュール間型付きメッセージ・LLM バックプレッシャ。

## Decision

1. **AIA 同時実行枠（LLM 枠と分離）**  
   テナント `data/org/aia-runtime.yaml` で制御する。

   | ティア | `max_concurrent_aia` | 意味 |
   |--------|----------------------|------|
   | Soft（既定） | 10 | 小規模テナント既定 |
   | Target | 20 | 通常運用推奨上限 |
   | Hard | 30 | 絶対上限。超過分は **Queued**（起動拒否しない） |

2. **LLM バックプレッシャ**  
   Running への Admission は、AIA 枠 **かつ** LLM pool の空き `max_inflight` 合計が足りるときに限る（[ADR 0034](0034-llm-worker-pool-routing.md)）。足りなければ Queued のまま待つ。

3. **`--parallel` の位置づけ**  
   親 Work Order の子バッチ hint に降格。グローバル同時数の正本は AIA runtime。

4. **作業スペース隔離**  
   各 run は `tenants/{id}/scratch/aia-runs/{run_id}/` のみに中間成果を書く。Primary Folders への並列直書は禁止。SSOT 確定は Skill/CLI + CAS / yaml-atomic、または Integration merge。詳細: [aia-workspace-isolation.md](../org-os/aia-workspace-isolation.md)。

5. **モジュール `concurrent_jobs`**  
   manifest `limits.concurrent_jobs` を enforce する。未設定: コア Agent はテナント枠内、招待/third_party モジュールは既定 **1**。

6. **モジュール間機械メッセージ**  
   人向け MD 照会は残す。機械経路は型付き `ModuleMessage`（L0/L1 のみ）+ `agent_relay` 許可リスト。詳細: [module-messaging.md](../org-os/module-messaging.md)。

7. **Integration Agent**  
   常設の横断統合役を catalog に置く（読取: summaries / routing-queue / module-messages）。正データ非編集・承認非代替。詳細: [integration-agent.md](../org-os/integration-agent.md)。

8. **カタログ健全性**  
   `agent.md` 欠落のモジュールディレクトリは `incomplete` / **not dispatchable**。

## Consequences

- スケジューラ状態: Queued → Admitted → Running → Merging → Done | Failed（[aia-parallel-runtime.md](../org-os/aia-parallel-runtime.md)）。
- 観測必須: Running 数、キュー待ち、LLM 待ち、CAS 衝突、`concurrent_jobs` 拒否。
- **実装状況（2026-08-24）:**
  - `src/lib/aia/scheduler.ts` + runtime YAML 読取 — **完了**
  - dispatch scheduler Admission — **完了** (`agent-dispatch.ts`)
  - workspace 作成/GC — **完了**
  - module-message 永続化 + capability ゲート — **完了**
  - catalog `integration` — **完了**
  - `concurrent_jobs` enforce — **完了**
  - Chat skill `integration-brief` · モジュール fact — **未着手**

## Related

- [0034-llm-worker-pool-routing.md](0034-llm-worker-pool-routing.md)
- [0033-deterministic-fact-provider-registry.md](0033-deterministic-fact-provider-registry.md)
- [0035-chat-command-router.md](0035-chat-command-router.md)
- [aia-parallel-runtime.md](../org-os/aia-parallel-runtime.md)
- [aia-workspace-isolation.md](../org-os/aia-workspace-isolation.md)
- [module-messaging.md](../org-os/module-messaging.md)
- [integration-agent.md](../org-os/integration-agent.md)
- `schemas/aia-runtime.ts` · `schemas/module-message.ts`
