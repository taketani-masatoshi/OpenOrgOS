# メモ — 各国政府系通信規格

**用途:** OpenOrgOS **Wire 緩衝層** 設計の調査メモ。  
**Wire Gateway（I3-a）:** [wire-gateway-requirements.md](../wire-gateway-requirements.md)  
**Gov Gateway（I3-b）:** [gov-gateway-adapters.md](../gov-gateway-adapters.md) · [gov-gateway-adapters-survey.md](../gov-gateway-adapters-survey.md)

> 税務・法務助言ではない。接続要件は各国当局の最新仕様を正とする。

---

## アーキテクチャメモ

| ファイル | 内容 |
|----------|------|
| [00-wire-buffer-layer.md](00-wire-buffer-layer.md) | Wire を緩衝材とする設計原則 |

---

## 国別メモ

### Hub 配置国（§7.B · §7.C）

| 国 | メモ | profile | Hub |
|----|------|---------|-----|
| エストニア | [EE-estonia.md](countries/EE-estonia.md) | `xroad_v7` | `HUB-EU-EE` |
| 日本 | [JP-japan.md](countries/JP-japan.md) | `jp_*` | `HUB-APAC-JP` |
| UAE | [AE-uae.md](countries/AE-uae.md) | `ae_uae_api` | `HUB-ME` |
| アイルランド | [IE-ireland.md](countries/IE-ireland.md) | `ie_psb_api` | `HUB-EU-IE` |
| トルコ | [TR-turkey.md](countries/TR-turkey.md) | `tr_edevelop` | `HUB-TR-IST` |
| 米国 | [US-united-states.md](countries/US-united-states.md) | `us_fed_api` | `HUB-US` |
| チリ | [CL-chile.md](countries/CL-chile.md) | `cl_pisee` | `HUB-SA` |
| ニュージーランド | [NZ-new-zealand.md](countries/NZ-new-zealand.md) | `nz_api_standard` | `HUB-OCEANIA-NZ` |
| エジプト | [EG-egypt.md](countries/EG-egypt.md) | `eg_digital_egypt` | `HUB-AF-CAI` |
| ジブチ | [DJ-djibouti.md](countries/DJ-djibouti.md) | `xroad_v7_dj` | `HUB-AF-DJ` |
| 南ア | [ZA-south-africa.md](countries/ZA-south-africa.md) | `za_sita_mios` | `HUB-AF-ZA` |

### 主要国（Hub 外 · 将来ラップ）

| 国・地域 | メモ | profile |
|----------|------|---------|
| 中国 | [CN-china.md](countries/CN-china.md) | `cn_gov_data_exchange` |
| 香港 | [HK-hong-kong.md](countries/HK-hong-kong.md) | `hk_iam_smart` |
| シンガポール | [SG-singapore.md](countries/SG-singapore.md) | `sg_apex` |
| 豪州 | [AU-australia.md](countries/AU-australia.md) | `au_apigovau` |
| 欧州（EU） | [EU-europe.md](countries/EU-europe.md) | `eu_edelivery_as4` |
| ロシア | [RU-russia.md](countries/RU-russia.md) | `ru_smev4` |
| インド | [IN-india.md](countries/IN-india.md) | `in_api_setu` |

### 既存ラップ（P0 草案 · Hub 外）

| 国 | メモ | profile |
|----|------|---------|
| ジョージア | [GE-georgia.md](countries/GE-georgia.md) | `ge_gov_gateway_3g` |

---

## 技術ファミリー（実装再利用メモ）

```
X-Road     → EE · DJ
EU AS4     → IE · EU 越境（EE X-Road と compose 可）
中央 GW 型 → TR · GE · EG · UAE
OAuth/FAPI → HK · SG · AU · JP（身份層）
国标/標準  → CN · IN · ZA · CL · US（agency 別）
独立閉域   → RU（SMEV + SKZI · P5）
```

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-07-07 | 国別メモ初版（Hub 11 + 主要 7 + GE） |
