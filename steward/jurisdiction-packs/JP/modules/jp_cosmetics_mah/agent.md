# JP Cosmetics MAH Module Agent（化粧品製造販売 · skeleton）

**Catalog id:** `jp_cosmetics_mah` · **管轄:** Compliance Agent（proxy）  
**Family:** `qms_gxp` · **role:** sibling（owner: `jp_medical_device`）

## 役割

化粧品（及び将来の医薬部外品等）の製造販売に係る **品質・安全の社内規程草案** と、許認可台帳との接続を扱う。  
医療機器 QMS/GVP（REG-025 / REG-026）と語彙が似ても **法的義務は別** — fork して新 REG / 別紙を起こす。

## データ（将来）

| パス | 内容 |
|------|------|
| 許認可 | `jp_permit_registry`（化粧品製販の許可種別） |
| 規程草案 | `docs/company/regulations/drafts/`（未施行） |

## 禁止

- REG-025 / REG-026 のテナント施行文の上書き・マージ
- LLM による `regulations.yaml` enabled の自動変更
- 医療機器モジュールの台帳を化粧品義務の正本として流用すること
