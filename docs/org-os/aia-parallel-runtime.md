# AIA Parallel Runtime

**版:** 1.0 · **日付:** 2026-08-24  
**ADR:** [0040](../adr/0040-aia-parallel-runtime.md)  
**状態:** 仕様 Accepted · ランタイム実装済み（`src/lib/aia/scheduler.ts`）

## 目的

テナント内で **10 / 20 / 30** 体の AIA（Agent 実行）を同時に回せる制御面を定義する。LLM ワーカー枠・モジュール枠・作業スペース隔離と連動し、同一 SSOT への破壊的並列書込を防ぐ。

## 制御正本

`tenants/{id}/data/org/aia-runtime.yaml`

```yaml
schema: orgos.aia.runtime.v1
version: 1
# soft | target | hard — hard は絶対上限 30 を超えない
tier: soft
max_concurrent_aia: 10
# LLM 空きが無いとき Admitted しない（既定 true）
llm_backpressure: true
# Queued の最大滞留（秒）。超過は Failed(timeout_queued)
queue_timeout_seconds: 3600
# 観測用（実装が更新）
metrics: {}
```

スキーマ草案: `schemas/aia-runtime.ts`

| ティア | `max_concurrent_aia` | 用途 |
|--------|----------------------|------|
| soft | 10 | 既定 |
| target | 20 | 通常運用推奨 |
| hard | 30 | 絶対上限 |

Hard 超過の新規 run は **拒否せず Queued**。キュー長・待ち時間はメトリクスで可視化する。

## スケジューラ状態機械

```
Queued → Admitted → Running → Merging → Done
                 ↘ Failed
Running → Failed
Queued → Failed   (queue_timeout)
```

| 遷移 | 条件 |
|------|------|
| Queued → Admitted | `running < max_concurrent_aia` **かつ**（`llm_backpressure` 時）LLM pool 空き ≥ 1 |
| Admitted → Running | run workspace 作成成功 |
| Running → Merging | Skill/CLI 完了 · SSOT 反映準備 |
| Merging → Done | CAS / yaml-atomic 成功 |
| * → Failed | エラー · タイムアウト · キャンセル |

## Work Order `--parallel`

- 親 WO の **子バッチ hint**（一度に何件を Admission 候補に載せるか）。
- グローバル同時数の正本は **本 runtime**。hint > 残枠なら残枠に切り詰める。

実装接続（後続）: `schemas/queue.ts` · `src/lib/agent-dispatch.ts` を scheduler 経由に変更。

## モジュール枠

| 種別 | `limits.concurrent_jobs` |
|------|--------------------------|
| 明示 | manifest 値を enforce |
| コア Agent（未設定） | テナント `max_concurrent_aia` まで（個別キャップなし） |
| third_party / invited（未設定） | **1** |

同一 module id の Running 数が上限に達したら当該 module 向け Admission を遅延。

## LLM 連動

- AIA 枠と LLM `max_inflight` は **別カウンタ**。
- Admission 時に pool の空きを見てバックプレッシャ（ADR 0034）。
- ローカル worker が 1 inflight のみでも、AIA は Queued で待機しうる（死なない）。

## キュー永続化

プロセス再起動後も Queued 状態を復元するため、スケジューラは `tenants/{id}/data/org/aia-queue.yaml` にキューを永続化する（`src/lib/aia/queue-store.ts`）。

| 操作 | タイミング |
|------|------------|
| hydrate | スケジューラ singleton 初期化時 |
| persist | admit / complete / fail / timeout 後 |

Vitest: `tests/aia-queue-store.test.ts`

## concurrent_jobs 横断検証

`src/lib/aia/concurrent-jobs-manifest.ts` — 有効モジュールの manifest `security.limits.concurrent_jobs` を検証。

| コマンド | 内容 |
|----------|------|
| `orgos modules check --all` | explicit > tenant max を fail |
| `orgos doctor` | `aia_concurrent_jobs` チェック |

MAL 有効モジュール（rental/hospitality/travel_booking=2 · jp_*=1）に explicit 値を設定済み。

Vitest: `tests/aia-concurrent-jobs-manifest.test.ts`

### プロセス再起動

単一ホスト運用では `aia-queue.yaml` を正本とし、scheduler 再起動時に `hydrate: true` で Queued を復元する（Redis/HA は ADR 0040 範囲外）。

Vitest: `tests/aia-queue-store.test.ts`（`hydrates queued runs after scheduler restart`）

## 観測（必須メトリクス）

| 名前 | 意味 |
|------|------|
| `aia_running` | 現在 Running |
| `aia_queued` | キュー長 |
| `aia_llm_wait` | LLM 不足による待ち回数 / 累計秒 |
| `aia_cas_conflict` | SSOT merge 衝突 |
| `aia_module_job_reject` | `concurrent_jobs` 超過による遅延/拒否相当 |

## カタログ健全性

モジュールディレクトリに `agent.md` が無い場合:

- 状態: `incomplete`
- dispatch / Admission: **禁止**（not dispatchable）
- `modules check` / validate で警告またはエラー（実装後続）

## 関連

- [aia-workspace-isolation.md](aia-workspace-isolation.md)
- [module-messaging.md](module-messaging.md)
- [integration-agent.md](integration-agent.md)
- [llm-worker-pool.md](llm-worker-pool.md)
