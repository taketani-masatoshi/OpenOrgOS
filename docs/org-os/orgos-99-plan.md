# OrgOS / OpenOrgOS Core — 採点改善記録

**版:** 1.1 · **日付:** 2026-06-28  
**採点正本:** [orgos-scoring-methodology.md](orgos-scoring-methodology.md)  
**実装:** `orgos-readiness.ts` · `orgos-readiness-strict.ts` · `openorgos-core-readiness.ts`

---

## 1. 目的（訂正）

| 旧（誤解を招く） | 新（正） |
|------------------|----------|
| OrgOS **99** = OS として完成 | **チェックリスト 99** = artifact/CI 合格率 |
| Core **100** = 実運用証明 | **チェックリスト 100** = 四要素実装 + テストファイル揃い |
| 厳格採点なし | **厳格 OrgOS ~91 · Core 92** = 対外・ロードマップ用 |

---

## 2. 実装済み（O99 系列）

| ID | 内容 | 批判への対応 |
|----|------|--------------|
| O99-1 | チェックリスト採点 | 回帰ゲートとして維持 · **単独の完成宣告に使わない** |
| O99-2 | **厳格採点追加** | 水増し換算 · Eco cap · 本番ギャップを反映 |
| O99-3 | `status --orgos` 二重表示 | CLI と文書の一致 |
| O99-4 | 採点方法論 doc | 文書矛盾の正本 |
| O99-5 | completion-plan §2 更新 | 「形式統一 低」obsolete 明記 |

---

## 3. スコア（2026-06-28 · `steward status --orgos`）

| 指標 | チェックリスト | 厳格 |
|------|:--:|:--:|
| OrgOS | 99 | ~91 |
| OpenOrgOS Core | 100 | 92 |

---

## 4. 99 → 100（厳格）の残条件

**路線正本:** [orgos-strict-99-roadmap.md](orgos-strict-99-roadmap.md)

| 領域 | チェックリスト | 厳格 |
|------|:--:|:--:|
| Steward-side 上限 | **99**（Eco cap 95） | **~91**（Eco cap 80） |
| 99+ 厳格 | N/A | **OS_Community** または **cap 見直し governance** |

1. module **93%+** production_ready（厳格 IF）  
2. **OS_Community** UI + Playwright（厳格 Eco 80→95+）  
3. 本番 `STEWARD_ENFORCE_OUTBOX_PERMISSIONS=1`  
4. Hub 鍵ローテ自動化 · webhook/relay 常駐  
5. ~~採点に npm test 成否を連動~~ → **Core 厳格で実装済**（2026-06-28）

---

## 5. 改定履歴

| 日付 | 版 | 内容 |
|------|-----|------|
| 2026-06-27 | 1.0 | チェックリスト採点導入（批判前） |
| 2026-06-28 | 1.1 | 厳格採点 · 文書矛盾解消 · 自己批判反映 |
| 2026-06-28 | 1.2 | 厳格 99 路線 · Core CI 連動 |
