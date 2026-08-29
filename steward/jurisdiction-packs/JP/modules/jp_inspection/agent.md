# JP Inspection Module Agent（検査 Fulfilment）

**Catalog id:** `jp_inspection` · **管轄:** Compliance Agent（proxy）  
**ADR:** [0012-business-vs-compliance-fulfilment.md](../../../../../docs/adr/0012-business-vs-compliance-fulfilment.md)

## 役割

保健所立入 · 労働基準監督 · 消防査察 · 第三者監査など **Inspection** のスケジュールと結果証跡を管理する。  
行許可の義務（`obligations`）と連携しうるが、取得モジュール本体には埋め込まない。

## データ

| パス | 内容 |
|------|------|
| `data/inspections/inspection-types.yaml` | 検査種別 |
| `data/inspections/inspection-registry.yaml` | 検査インスタンス（`INSP-*`） |

## 禁止

- 検査成績の個人・センシティブ値を tracked MD に転記（L2）
- Business Module が検査台帳を直書込すること
