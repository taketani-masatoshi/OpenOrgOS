# 安全管理に関する文書・記録管理手順（GVP）

**文書番号:** {{doc_number}}  
**会社:** {{company.name}}  
**制定:** {{effective_date}}

---

## 1. 文書体系

| 番号 | 内容 |
|------|------|
| GVP-001 | マニュアル |
| GVP-002〜004 | 収集 · 評価 · 報告 |
| 本書 | 文書 · 記録 |
| GVP-FRM-* | 様式 |

正本ディレクトリは `docs/medical-device/gvp/`。目録は `data/medical-device/gvp-catalog.yaml`。

## 2. 改訂

1. QMS-REG-001 と同じ版管理 · 承認（`medical_device.doc_revision`）を用いる。
2. 旧版は文書管理台帳で廃止し、受付担当へ周知する。
3. 外部文書（省令 · 通知）の版を年次で確認する。

## 3. 記録

苦情 · 有害事象 · 報告 · PMS · 当局照会は `data/medical-device/ledgers/` に **5 年間** 保管する。個人識別情報は置かない。

## 4. 点検

安全管理責任者は、未評価 · 期限超過 · 未提出を定期に台帳から確認する。CLI: `orgos operations medical-device deadlines`。
