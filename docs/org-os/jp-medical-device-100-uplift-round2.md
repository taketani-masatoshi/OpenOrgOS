# 医療機器薬事モジュール — Round 2（100点 uplift）

**前提:** Round 1（`jp-medical-device-100-uplift-plan.md`）の完了定義 1–10 は達成済み。  
**目標:** 提出事実・ゲート逃げ道・全承認 subject·全体 validate を閉じ、実務閉ループを A+ にする。

## 完了定義（Round 2 · 100点）

1. **`report_filed_on` 閉ループ** — `ae mark-filed` があり、設定後 GVP overdue が消える。`gvp_report` 承認は「提出承認」であり提出事実ではない（ADR 追記）
2. **ゲート単一化** — `ledger close --type capa` も CAPA 有効性ゲートを通る
3. **全 `medical_device.*` subject の approve/reject E2E**
4. **apply 失敗 → 承認未確定** の回帰テスト
5. **reject が `status_before_approval` を復元**
6. **苦情→AE 昇格**（双方向参照）
7. **照会クローズゲート**（`response_draft_path` 必須 · `responded_on`）
8. **参照整合 + CAPA/変更品質ゲート**（`root_cause`+`action` · `risk_review` · 既知 `device_id`）
9. **`orgos validate`（integrity）が medical-device を含む**
10. **出荷/製造ロット最小閉ループ + 文書 `effective_on` は承認時のみ**

## やらないこと

- PMDA 自動提出
- 患者 PII の tracked 転記
- 医薬品モジュール
- 業許可申請の再実装（ADR 0011）
- 実許可番号の tracked 投入

## 最終評価（2026-08-28）

| # | 判定 | メモ |
|---|------|------|
| 1 | A+ | `ae-mark-filed` · deadlines 除外 · ADR 分離 |
| 2 | A+ | `closeLedgerEntry` + `assertCapaEntryCloseable` |
| 3 | A+ | capa / change / doc / gvp E2E |
| 4 | A+ | missing subject → approve throws |
| 5 | A+ | reject → `effectiveness_check` 復元 |
| 6 | A+ | `complaint-promote-ae` · `ae_id` |
| 7 | A+ | `inquiry close` ゲート |
| 8 | A+ | close-gates + integrity `device_id` |
| 9 | A+ | `collectMedicalDeviceIntegrityIssues` |
| 10 | A+ | typed distribution/batch · mal デモ行 · approve 時 `effective_on` |

**テスト:** `npx vitest run tests/jp-medical-device.test.ts` → **20/20 pass**  
**総合:** **A+ / 100（Round 2）**
