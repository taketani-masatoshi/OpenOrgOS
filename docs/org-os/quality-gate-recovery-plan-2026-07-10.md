# Quality Gate Recovery Plan — 自己評価 4.5+ 達成

**版:** 1.0 · **日付:** 2026-07-10  
**起点:** main @ `6cfc5b0` · 自己評価 2.5/5  
**目標:** 4.5/5（Delivery + Quality + Ops すべて B+ 以上）

---

## 1. 評価軸と目標

| 観点 | 現状 | 目標 | 施策 |
|------|:----:|:----:|------|
| 統合到達 | 4/5 | 4.5 | hotfix PR merge · CI 緑 |
| PR/マージ手順 | 2.5/5 | 4.5 | CI green 必須 · hotfix 経由 |
| 品質ゲート | 2/5 | 4.5 | 0 test fail · validate pass |
| ワークスペース | 1.5/5 | 4.5 | clean tree · stash 整理 |
| Community P3-1 | 2/5 | 4.0 | git init · STEWARD_REPO hard gate |
| **総合** | **2.5/5** | **≥4.5** | 下記 Phase 順 |

---

## 2. Phase A — P0 hotfix（30min）

- demo `operators.yaml` 復元（acme fixture 流用）
- demo executive `*.yaml.example` 復元（`_template` から）
- demo `company-events.yaml` 復元（空 registry）
- `orgos-readiness-strict.ts` IF 軸 cap（strict ≤ checklist）
- `agent-readiness` 期待値 45 → 47（setup · medical_device_regulatory 追加）
- skill runtime テスト更新（`cursor-only` → `agent` 正規化に追従）

**DoD:** `npm run check` PASS · P0 テスト PASS

---

## 3. Phase B — テナント peer graph（30min）

- `seedOrgPeerGraphForTenant` で mal · southwood · aiac 三角 peer 同期
- `three-org-wire-demo` · `peer-contact-graph` 通過

**DoD:** protocol triangle tests PASS

---

## 4. Phase C — 残テスト + docs（30min）

- `framework-assessment.md` テスト数同期
- operator-rbac · security-validate · demo-validate 通過確認
- フル `npm test` 0 fail 目標

---

## 5. Phase D — P3-1 Community（2h）

- `OS_Community` git init + `.gitignore` 確認
- `ci.yml` hard gate（`STEWARD_REPO` 未設定時 fail · `continue-on-error` 削除）
- `.env.example` に `STEWARD_ORGOS_ROOT` 追記

---

## 6. Phase E — Ops 整理（15min）

- hotfix PR → main merge
- マージ済みブランチ delete（local + remote）
- 作業ツリー clean

---

## 7. 再評価基準（4.5/5）

| 条件 | 必須 |
|------|:----:|
| GitHub CI main green | ✓ |
| `npm test` 0 fail | ✓ |
| `npm run check` PASS | ✓ |
| git status clean（hotfix 除く） | ✓ |
| OrgOS 厳格 ≥96 · Core 厳格 ≥99（test pass 後） | ✓ |
