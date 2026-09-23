# QMS / GxP ファミリー — fork 草案スキャフォールド

**Family id:** `qms_gxp`  
**Owner module:** `jp_medical_device`（REG-025 QMS · REG-026 GVP）  
**Sibling 例:** 化粧品製造販売、医薬部外品 等（将来モジュール）

---

## 目的

医療機器の QMS/GVP と **語彙は似ても法的義務が異なる** 業種向けに、  
**新規 REG（または共通章＋業種別紙）** の草案を書くときの出発点。

## 禁止

1. REG-025 / REG-026 の **テナント施行文を上書き・マージしない**
2. 「同じ QMS だから1本にまとめる」と判断しない
3. LLM が取締役会承認済みと偽らない

## LLM 作業手順（草案のみ）

1. Owner 雛形を **参照**する（コピー元として読む）  
   - `by-module/jp_medical_device/REG-025-iryo-kiki-qms/template.md`  
   - `by-module/jp_medical_device/REG-026-iryo-kiki-gvp/template.md`
2. 業種の法令・許認可（薬機法の該当章、ISO 22716 等）を **別紙または新 REG** に切り出す
3. 共通に残してよい章（文書管理・教育・逸脱の「手続の型」）だけ共通章案に残す
4. 出力は `草案` ヘッダ付き MD。`regulations.yaml` の enabled は触らない
5. Work Order の Acceptance に従い、人間レビュー待ちで止める

## 推奨アウトプット構成

```text
# （業種）品質管理規程（草案）
**規程ID:** REG-XXX（未採番なら TBD）
**Family:** qms_gxp · sibling of REG-025/026

## 第1条（目的）…
## 別紙1（業種固有義務）…
## 関連
- 参照（書き換えない）: REG-025 · REG-026
- 許認可手続: REG-037
```

## 関連

- 方針: `steward/jurisdiction-packs/JP/regulations/00-モジュール連動方針.md` §3–4  
- 実装: `src/lib/regulation-module-contract.ts` · `regulation-module-workflow.ts`
