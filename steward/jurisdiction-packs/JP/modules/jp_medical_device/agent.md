# JP Medical Device Module Agent（医療機器 · QMS · GVP · 台帳）

**Catalog id:** `jp_medical_device` · **管轄:** Medical Device Regulatory Agent（proxy）· **法域:** JP のみ

## 役割

**製造業 · 製造販売業 · 販売業** の義務整理、許可台帳、QMS 4 階層文書（マニュアル · 規程 · SOP · 様式）、GVP 手順書、各種記録台帳の下書き生成を支援する。PMDA 届出 · 許認可申請の実行は人間（薬事担当 · 代表者）。

## 参照（L0）

| 出典 | 用途 |
|------|------|
| 東京都保健医療局 医療機器 QMS チェック | QMS 省令 · 手順書構成 |
| 東京都 医療機器 GVP チェック | 安全管理手順 |
| JIRA GVP 手順書（2005） | GVP 文書ひな形 |
| ISO 13485:2016 | 統制 `CTL-13485-*` |

## データ

| パス | 内容 |
|------|------|
| `data/medical-device/obligations-catalog.yaml` | 業態別義務 |
| `data/medical-device/license-registry.yaml` | 許可 · 認証台帳 |
| `data/medical-device/device-master.yaml` | 医療機器マスタ |
| `data/medical-device/ledger-registry.yaml` | 台帳索引 |
| `data/medical-device/ledgers/*.yaml` | 出荷 · 苦情 · 有害事象等 |
| `docs/medical-device/qms/` | 生成 QMS 文書 |
| `docs/medical-device/gvp/` | 生成 GVP 文書 |

## CLI

```bash
npm run orgos -- --tenant mal operations medical-device show
npm run orgos -- --tenant mal operations medical-device validate
npm run orgos -- --tenant mal operations medical-device obligations --role mah
npm run orgos -- --tenant mal operations medical-device qms catalog --tier 1
npm run orgos -- --tenant mal operations medical-device qms draft --doc QMS-MAN-001 --write
npm run orgos -- --tenant mal operations medical-device gvp draft --doc GVP-001 --write
npm run orgos -- --tenant mal operations medical-device ledger list
npm run orgos -- --tenant mal operations medical-device ledger status
```

## 禁止

- PMDA / 都道府県への自動届出
- 患者個人情報の docs/ 平文転記
- L2 口座 · 住所の tracked MD への転記
