# Phase 0 — リポジトリ棚卸し（2026-07-10）

**Branch:** `feat/tenant-integrations-secretary-mail`（main より +4 commits）  
**未コミット:** **145 paths**（#1–3 クリーンアップ後 · `./scripts/phase0-repo-triage.sh` で再生成可）  
**参照:** クリーンアップ前 197 paths（Agent export 46 · 生成物 4 を除去）

---

## 1. サマリー

| Bucket | 件数 | PR 提案 | 推奨アクション |
|:------:|:----:|---------|----------------|
| **A** Wire / Hub | 25 | `feat/wire-orchestration-hub-stack` | 単独 PR · 最優先 merge |
| **B** Secretary / TI | 22 | `feat/secretary-correspondence-v2` | 現ブランチから分離 |
| **C** Agent export | 46 | `chore/agent-export-sync` or **revert** | 意図確認 → 最小 export |
| **D** テナント | 91 | `chore/tenant-seeds-202607`（分割可） | テナント別 3 PR 推奨 |
| **GEN** 生成物 | 3 | コミットしない | export / Community script 出力 |
| **F** Steward policy | 5 | `chore/steward-policy-modules` | B/D と分離 |
| **G** Cursor / Phase0 | 3 | Phase0 doc のみ commit | ミラー · create-pr.sh は discard |
| **H** package.json | 2 | 各 PR に随伴 | 依存追加の所属 PR へ |

### ブランチ上コミット済み（main 差分 · 112 files）

| Commit | 内容 |
|--------|------|
| `7472420` | Tenant integrations · Secretary correspondence send |
| `8fa3981` | Wire Top5 · mal protocol · systemd · strict cap 99 |
| `62deed3` | Wire W1–W4 · relay E2E · federation sync |
| `0695b9d` | Eco cap alignment · community export |

**問題:** 1 ブランチに Wire + Secretary +（未コミット）Tenant が混在 → Phase 1 で物理分離。

---

## 2. Bucket A — Wire / Hub stack（25）

**PR:** `feat/wire-orchestration-hub-stack` · **base:** `main`（Eco コミット merge 後）

| Status | Path |
|:------:|------|
| M | `src/cli/registrars/orchestration.ts` — wire-gateway init/discover/federation CLI（+65 行） |
| M | `data/hub-a/hub-federation.yaml` |
| M | `data/hub-a/registered-orgs.yaml` |
| M | `data/hub-b/hub-federation.yaml` |
| M | `data/hub-b/registered-orgs.yaml` |
| M | `deploy/witness-hub/seed-federation.ts` |
| M | `docs/org-os/c4-community-backlog.md` |
| M | `docs/org-os/gov-gateway-live-pilot-log-mal.md` |
| M | `docs/org-os/wire-gateway-requirements.md` |
| M | `publish/protocol/wire-trust-registry.yaml` |
| M | `steward/platform/protocol/wire-trust-registry.yaml` |
| M | `tests/gov-gateway-live.test.ts` |
| ?? | `deploy/witness-hub/data/` |
| ?? | `deploy/witness-hub/docker-compose.cities.yaml` |
| ?? | `deploy/witness-hub/hubs-city.yaml` |
| ?? | `docs/org-os/wire-hub-stack-pilot.md` |
| ?? | `scripts/deploy-city-hubs.sh` |
| ?? | `scripts/wire-hub-stack-smoke.sh` |
| ?? | `tests/outbox-permissions-gate.test.ts` |

**DoD:** `npm test -- tests/wire*.test.ts tests/mal-wire*.test.ts tests/gov-gateway*.test.ts tests/outbox-permissions-gate.test.ts`

---

## 3. Bucket B — Secretary / TI / correspondence（22）

**PR:** `feat/secretary-correspondence-v2` · **base:** `main`

| Status | Path |
|:------:|------|
| M | `schemas/executive.ts` |
| M | `src/cli/registrars/executive.ts` |
| M | `src/commands/secretary-correspondence.ts` |
| M | `src/lib/correspondence/index.ts` |
| M | `src/lib/correspondence/mail-send.ts` |
| M | `src/lib/correspondence/send-gate.ts` |
| M | `steward/core/agents/secretary_agent.md` |
| M | `steward/core/skills/correspondence_draft.md` |
| M | `steward/core/skills/correspondence_send.md` |
| M | `steward/core/skills/external_correspondence.md` |
| M | `steward/rules/secretary_steward_boundary.md` |
| M | `tenants/mal/docs/executive/correspondence-drafts/00-このフォルダについて.md` |
| M | `tests/correspondence-approval-gate.test.ts` |
| ?? | `src/commands/secretary-contacts.ts` |
| ?? | `src/lib/correspondence/mail-setup-readiness.ts` |
| ?? | `src/lib/secretary/` |
| ?? | `steward/rules/secretary-contact-registry.md` |
| ?? | `tests/secretary-contact-registry.test.ts` |

**DoD:** `npm test -- tests/correspondence*.test.ts tests/secretary*.test.ts` · `orgos validate`

---

## 4. Bucket C — Agent export 一括（46）

**PR:** `chore/agent-export-sync` **または revert**

```
steward/platform/agent/exports/agents/*.pack.md  ×46
```

**判断:**

| 選択 | 条件 |
|------|------|
| **Revert（推奨）** | Agent MD 本体に未コミット変更がない |
| **単独 chore PR** | 意図的 `orgos operator export --all` 実行後 |

**DoD:** export 元の Agent MD 変更と 1:1 対応 · CI validate green

---

## 5. Bucket D — テナント seed / データ（91）

**分割 PR 推奨:**

| Sub-PR | テナント | 件数 | 備考 |
|--------|----------|:----:|------|
| `chore/tenant-demo-cleanup` | demo | 26 | 大量 **削除** — 意図確認必須 |
| `chore/tenant-mal-seeds` | mal | 25 | events · protocol · docs |
| `chore/tenant-aiac-southwood` | aiac + southwood | 23 | protocol 再配置 |
| `chore/tenant-audit-bridge-sync` | *-demo, acme, hk | 15 | audit-bridge-state 一括 |
| `chore/tenant-scaffold` | _template + scripts | 5 | scaffold 系 |

**DoD:** `orgos validate` · L2 値なし · テナント単位で review

---

## 6. Bucket E — 再分類（10 → 0）

| Path | 再分類先 | 理由 |
|------|:--------:|------|
| `.cursor/rules/tenant-active-context.mdc` | **G** | 生成ミラー · コミット不要 |
| `publish/protocol/community-*.json` ×3 | **生成物** | `protocol community export` / Community script · CI 生成 |
| `src/lib/integrity.ts` | **B** | TI / tenant setup 連動 |
| `src/lib/protocol/validate.ts` | **A** | protocol validate 拡張 |
| `src/lib/tenant-init.ts` | **B** | tenant integrations |
| `src/lib/tenant-setup-wizard.ts` | **B** | tenant integrations |
| `steward/platform/protocol/seed/peers.yaml.example` | **A** | Wire seed |
| `tests/peer-contact-policy.test.ts` | **B** | Secretary peer policy |

---

## 7. Bucket F / G / H

**F — Steward policy（5）:** `module_contract.md` · `readiness.yaml` · `folder_access_policy.md` · `tenant-executive-scaffold.md`  
→ PR: `chore/steward-policy-modules`（Secretary PR とは分離）

**G — Cursor ミラー（1）:** `.cursor/rules/tenant-active-context.mdc` → **discard / gitignore 運用**

**H — package（2）:** `package.json` · `package-lock.json` → 所属 PR（B or A）に随伴

---

## 8. Phase 1 merge 順（正本）

```
main
  ← (1) feat/wire-eco-merged        # 既存 0695b9d 系（済）
  ← (2) feat/wire-orchestration-hub-stack   [A: 19]
  ← (3) feat/secretary-correspondence-v2    [B: 18 + E→B]
  ← (4) chore/steward-policy-modules        [F: 5]
  ← (5) chore/tenant-mal-seeds              [D partial]
  ← (6) chore/tenant-aiac-southwood
  ← (7) chore/tenant-demo-cleanup           # 要 CEO 確認
  ← (8) chore/tenant-audit-bridge-sync
```

**Agent export（C）:** merge 前に revert 推奨（ノイズ 46 件除去）

---

## 9. 作業コマンド（Phase 1 用）

```bash
# 棚卸し再生成
./scripts/phase0-repo-triage.sh

# Bucket A 分離例
git stash push -m "phase0-all" --include-untracked
git stash pop  # または branch-per-bucket で checkout -b

# Agent export revert
git checkout HEAD -- steward/platform/agent/exports/

# Cursor ミラー discard
git checkout HEAD -- .cursor/rules/tenant-active-context.mdc
```

---

## 10. Phase 0 DoD チェックリスト

- [x] 195 paths 全件バケット分類
- [x] PR 名 · base · merge 順確定
- [x] Bucket E 再分類表
- [x] テナント D サブ PR 分割案
- [x] 再生成スクリプト `scripts/phase0-repo-triage.sh`
- [ ] Phase 1 実行（PR 物理分離）— **次フェーズ**

*改定: 2026-07-10*
