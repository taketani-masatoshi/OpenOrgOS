# 医療機器薬事モジュール — 100点修正計画

**目標:** 自己評価で重大・中・低の弱点を潰し、13機能を実務閉ループとして A+ 相当にする。  
**手法:** 自己評価 → 修正 → 再評価 を **3 ループ**。

## 完了定義（100点）

1. 承認 **approve / reject** の双方で台帳状態が一貫する
2. 台帳 apply 失敗時は承認も失敗（黙って成功にしない）
3. 苦情/AE ↔ CAPA、GVP escalate→WO、照会回答 path がテストで保証される
4. `humanApproveOrgApproval` 経由の結合テストがある
5. active 業許可の `expires_on` 欠落は validate error（warning ではない）
6. 申請ドラフトは品目必須フィールド不足を明示する
7. audit.jsonl の list CLI がある
8. CAPA に有効性確認（effectiveness）ステータス遷移がある
9. Agent pack / mal 派生 MD に OFF・未施行の矛盾が無い
10. `cli/lib.ts` が責務分割されている（ops / draft / application）

## ループ割当

| Loop | 焦点 | 結果 |
|------|------|------|
| 1 | reject 巻き戻し · apply 失敗伝播 · score-90 / pack 残骸 | **A+** — 1–2 · 9 の残骸解消 |
| 2 | 結合テスト · audit list · expires_on error · 申請充足チェック | **A+** — 3–7 達成（14 テスト中 13 通過時） |
| 3 | CAPA effectiveness · CLI 分割 · 最終ドキュメント · 最終評価 | **A+** — 8 · 10 · docs/ADR/Skill · 14/14 テスト |

## やらないこと（100点でも維持）

- PMDA 自動提出
- 患者 PII の tracked 転記
- 医薬品モジュール
- 業許可申請の再実装（ADR 0011）

---

## Loop 自己評価ログ

### Loop1（完了）

| # | 判定 | メモ |
|---|------|------|
| 1 | A | reject → `revertMedicalDeviceApproval` |
| 2 | A | apply throw + approve 側 rollback |
| 9 | A−→A | pack / 矛盾文言の掃除 |

**弱点残:** 結合テスト不足 · audit list · expires_on · 申請充足 · CAPA 有効性 · CLI 肥大

### Loop2（完了）

| # | 判定 | メモ |
|---|------|------|
| 3–4 | A+ | approve/reject E2E · AE↔CAPA · escalate · inquiry |
| 5 | A+ | active license `expires_on` → validate **error** |
| 6 | A+ | `assessApplicationForDeviceId` + `--force` |
| 7 | A+ | `audit list` CLI · manifest |

**弱点残:** CAPA effectiveness · cli 分割（991 行）

### Loop3（完了 · 最終）

| # | 判定 | メモ |
|---|------|------|
| 8 | A+ | `effectiveness_check` 状態 · schedule/record · close ゲート · deadlines |
| 9 | A+ | agent/skill/ADR と実装一致 · OFF 矛盾なし |
| 10 | A+ | `cli/shared.ts` · `ops.ts` · `draft.ts` · `application.ts` · `lib.ts` barrel |

**テスト:** `npx vitest run tests/jp-medical-device.test.ts` → **14/14 pass**

### 最終スコア（2026-08-28）

| 完了定義 | スコア |
|----------|--------|
| 1–10 すべて | **A+ / 100** |

意図的に残す非スコープ（PMDA 自動提出等）は減点対象外。
