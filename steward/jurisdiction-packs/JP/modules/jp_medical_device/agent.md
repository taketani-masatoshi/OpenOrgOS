# JP Medical Device Module Agent（医療機器 · QMS · GVP · 運用台帳）

**Catalog id:** `jp_medical_device` · **管轄:** Medical Device Regulatory Agent（proxy）· **法域:** JP のみ

## 役割

**製造業 · 製造販売業 · 販売業** の義務整理、許可・品目台帳、QMS 4 階層文書、GVP 手順書、苦情/AE/CAPA/変更/PMS/当局照会の運用台帳、品目申請チェックリスト（社内ドラフト）を支援する。PMDA 届出 · 許認可申請の **提出実行は人間**（薬事担当 · 代表者）。

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
| `data/medical-device/license-registry.yaml` | 業許可台帳（`expires_on`） |
| `data/medical-device/device-master.yaml` | 品目マスタ（経路 · 認証期限） |
| `data/medical-device/ledger-registry.yaml` | 台帳索引 |
| `data/medical-device/ledgers/*.yaml` | 出荷 · 苦情 · AE · 教育 · 文書 · CAPA · 変更 · PMS · 照会 |
| `data/medical-device/audit.jsonl` | 運用監査証跡（gitignore） |
| `docs/medical-device/qms/` · `gvp/` · `applications/` | 生成文書 |

## CLI

```bash
npm run orgos -- --tenant mal operations medical-device show
npm run orgos -- --tenant mal operations medical-device validate
npm run orgos -- --tenant mal operations medical-device deadlines
npm run orgos -- --tenant mal operations medical-device obligations --role mah
npm run orgos -- --tenant mal operations medical-device qms draft --doc QMS-MAN-001 --write
npm run orgos -- --tenant mal operations medical-device gvp draft --doc GVP-001 --write
npm run orgos -- --tenant mal operations medical-device ledger status
npm run orgos -- --tenant mal operations medical-device capa open --source complaint --title "..."
npm run orgos -- --tenant mal operations medical-device capa schedule-effectiveness --id CAPA-... --on 2026-09-15
npm run orgos -- --tenant mal operations medical-device capa record-effectiveness --id CAPA-... --result effective
npm run orgos -- --tenant mal operations medical-device capa close --id CAPA-...
npm run orgos -- --tenant mal operations medical-device change open --type process --title "..."
npm run orgos -- --tenant mal operations medical-device application draft --kind certification --write
npm run orgos -- --tenant mal operations medical-device audit list
```

CLI 実装分割: `cli/ops.ts` · `cli/draft.ts` · `cli/application.ts`（`lib.ts` は barrel）

## 禁止

- PMDA / 都道府県 / 認証機関への自動届出
- 患者個人情報の docs/ 平文転記
- L2 口座 · 住所の tracked MD への転記
