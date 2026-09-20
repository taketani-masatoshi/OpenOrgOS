# 是正処置・予防処置（CAPA）規程（第2階層）

**文書番号:** {{doc_number}}  
**版:** 1.0  
**制定:** {{effective_date}}  
**会社名:** {{company.name}}

---

## 第1条（目的）

不適合 · 苦情 · 監査指摘 · 有害事象 · 工程逸脱から原因を除き、再発を防ぎ、必要に応じて予防する。

## 第2条（適用）

{{company.name}} の QMS · GVP で検知した問題に適用する。ソース種別は `complaint` · `ae` · `audit` · `change` · `pms` とする。

## 第3条（起票）

1. 問題を CAPA 台帳（`ledgers/capa-records.yaml`）に登録する。
2. 重大度（minor / major / critical）を暫定判定する。
3. 苦情又は有害事象から起票する場合は、元台帳の id を `source_ref` に残す。

## 第4条（原因分析と計画）

1. 直接原因と根本原因を記録する（5 Why、特性要因図等）。
2. 是正（再発防止）と、必要なら予防（横展開）を計画し、期限と担当役割を付ける。
3. リスクファイルへの影響がある場合は QMS-REG-004 を並行する。

## 第5条（実施と有効性確認）

1. 計画どおり実施し、実施日を記録する。
2. ステータスを `effectiveness_check` にし、確認期限を置く。
3. 結果は `effective` / `ineffective` とする。無効の場合は計画を見直す。
4. クローズは人間の承認（`medical_device.capa_close`）を要する。有効性未確認のまま閉じない。

## 第6条（CLI）

```
orgos operations medical-device capa list --open
orgos operations medical-device capa schedule-effectiveness --id CAPA-…
orgos operations medical-device capa record-effectiveness --id CAPA-… --result effective
```
