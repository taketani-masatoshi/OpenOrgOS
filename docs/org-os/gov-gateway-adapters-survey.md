# Gov Gateway Adapters — 各国調査（Wire ラップ対象）

**Status:** 調査草案 · 2026-07-07  
**Parent:** [gov-gateway-adapters.md](gov-gateway-adapters.md) · [witness-hub-governance.md](witness-hub-governance.md)  
**Registry:** [`gov-gateway-adapters.yaml`](../../steward/platform/protocol/gov-gateway-adapters.yaml)  
**国別メモ:** [memos/README.md](memos/README.md) · [memos/countries/](memos/countries/)

> 本書は **国家・地域の政府間通信規格** の調査整理。税務・法務助言ではない。接続要件は各国当局の最新仕様を正とする。

---

## 1. 調査範囲

| 区分 | 国・地域 |
|------|----------|
| **既存ラップ（P0 草案）** | エストニア · 日本 · ジョージア |
| **Hub 最終系 §7.B** | 日本 · UAE · エストニア · アイルランド · トルコ · 米国 · チリ · NZ |
| **Hub AF pool §7.C** | エジプト · **ジブチ** · 南ア |
| **ユーザー指定の主要国** | 米国 · 中国 · 香港 · シンガポール · **豪州** · 欧州 · ロシア · インド |

---

## 2. 一覧サマリー

| 国・地域 | 中核規格 / プラットフォーム | 想定 `profile_id` | Hub | Adapter 優先 |
|----------|------------------------------|-------------------|-----|-------------|
| **エストニア** | **X-Road** v6/v7（Security Server） | `xroad_v7` | ✓ タリン | **P2**（既存草案） |
| **日本** | **e-Gov** · LGWAN · Gビズ / 法人番号 | `jp_*` | ✓ 東京 | **P3** |
| **ジョージア** | **Government Gateway 3G**（DGA） | `ge_gov_gateway_3g` | — | **P4** |
| **UAE** | **UAE API Marketplace** · UAEPASS · Open Finance Hub | `ae_uae_api` | ✓ ドバイ | **P2** |
| **アイルランド** | **PSB API Catalogue** · Data Sharing Framework（EIF 準拠） | `ie_psb_api` | ✓ ダブリン | **P2** |
| **トルコ** | **e-Devlet Kapısı** · KamuNET · G2G Web Services | `tr_edevelop` | ✓ イスタンブール | **P3** |
| **米国** | 連邦 **API/REST** · **FedRAMP/OSCAL** · Login.gov 等（単一 X-Road 型なし） | `us_fed_api` | ✓ NY | **P3** |
| **チリ** | **PISEE**（Nodo 相互運用）· ChileAtiende API | `cl_pisee` | ✓ サンティアゴ | **P3** |
| **ニュージーランド** | **NZ API Standard**（GCDO）· 慈善 trust 法域 | `nz_api_standard` | ✓ オークランド | **P2** |
| **エジプト** | **Digital Egypt** · G2G API 連携 | `eg_digital_egypt` | ✓ カイロ | **P4** |
| **ジブチ** | **X-Road**（ANSIE · eGA 導入） | `xroad_v7` | ✓ ジブチ | **P2** |
| **南ア** | **SITA MIOS** · 国家 e-Gov 戦略 | `za_sita_mios` | ✓ 南ア | **P4** |
| **中国** | **全国一体化政务大数据** GB/T 45800 · 政务数据共享交换 | `cn_gov_data_exchange` | — | **P4** |
| **香港** | **iAM Smart**（OAuth 2.0 · 電子署名） | `hk_iam_smart` | — | **P4** |
| **シンガポール** | **APEX** · Singpass · CorpPass（FAPI 2.0） | `sg_apex` | satellite | **P4** |
| **豪州** | **api.gov.au** · **AGDIS**（Digital ID · OIDC） | `au_apigovau` | satellite | **P3** |
| **欧州（EU）** | **EIF** · **CEF eDelivery AS4** · eIDAS | `eu_edelivery_as4` | （IE/EE でカバー） | **P3** |
| **ロシア** | **СМЭВ3/4**（SOAP/XML · REST · SKZI 暗号網） | `ru_smev4` | — | **P5** |
| **インド** | **API Setu** · DigiLocker · MeriPehchaan | `in_api_setu` | — | **P4** |

**Hub 列:** [witness-hub-governance.md §7.B–C](witness-hub-governance.md) 最終系。

---

## 3. Hub 配置国（詳細）

### 3.1 日本 — `HUB-APAC-JP`（Wave 1）

| 項目 | 内容 |
|------|------|
| **中核** | デジタル庁 · 各省 **e-Gov インフラ** · **LGWAN**（自治体閉域）· **Gビズ** / 法人番号 API |
| **プロトコル** | HTTPS REST · GPKI/JPKI · 府省個別 XML/JSON |
| **OpenOrgOS ラップ** | `jp_egov_central` · `jp_lgwan` · `jp_gbiz`（[egov-adapter.profile.yaml](../../steward/jurisdiction-packs/JP/protocol/egov-adapter.profile.yaml)） |
| **Witness** | 東京 Hub · `witness_mode: orgos_hub` |
| **注意** | LGWAN は閉域 — Hub 物理配置と **接続経路を分離**設計 |

### 3.2 UAE — `HUB-ME`（Wave 1）

| 項目 | 内容 |
|------|------|
| **中核** | **TDRA UAE API Marketplace** · **UAEPASS**（連邦デジタル ID）· **API-First Policy** |
| **金融** | CBUAE **Open Finance** — 中央 **API Hub** + Trust Framework（銀行等） |
| **OpenOrgOS ラップ** | `ae_uae_api`（一般）· `ae_open_finance`（金融 wire 用 · 別 profile） |
| **Witness** | ドバイ DIFC · substance 必須 |
| **参考** | [OECD OPSI UAE API Marketplace](https://oecd-opsi.org/innovations/uae-api-market-place/) |

### 3.3 エストニア — `HUB-EU-EE`（Wave 1 · Treasury）

| 項目 | 内容 |
|------|------|
| **中核** | **X-Road** — Security Server · member/subsystem/service |
| **OpenOrgOS ラップ** | `xroad_v7`（[xroad-adapter.profile.yaml](../../steward/jurisdiction-packs/EE/protocol/xroad-adapter.profile.yaml)） |
| **相性** | タリン Treasury / Fund と **同一法域 substance** |

### 3.4 アイルランド — `HUB-EU-IE`（Wave 2）

| 項目 | 内容 |
|------|------|
| **中核** | **PSB API Catalogue** · **Data Sharing and Governance Act 2019** · Data Sharing Support Suite |
| **フレーム** | 欧州 **EIF** 4 層（legal · org · semantic · technical）準拠 |
| **技術** | REST · OpenAPI · 政府 API 標準（[datacatalogue.gov.ie](https://datacatalogue.gov.ie/standards/)） |
| **OpenOrgOS ラップ** | `ie_psb_api` — EU **`eu_edelivery_as4`** と compose 可 |
| **Witness** | ダブリン CLG/Ltd コストセンター |

### 3.5 トルコ — `HUB-TR-IST`（Wave 3）

| 項目 | 内容 |
|------|------|
| **中核** | **e-Devlet Kapısı**（turkiye.gov.tr）— 1000+ 機関 · G2G **Web Services** |
| **ネットワーク** | **KamuNET**（官庁間 VPN）· 電子署名 · モバイル署名 |
| **アーキ** | 中央ゲートウェイ + ESB 型 — 機関間 **ポイント接続をゲートウェイに集約** |
| **OpenOrgOS ラップ** | `tr_edevelop` — AF · 南米 · タリンへの **1 乗継** と Hub 役割を両立 |
| **EU 接続** | EDIC / 欧州 Digital Identity Wallet 連携検討（将来） |

### 3.6 米国 — `HUB-US`（Wave 3 · DE 登記）

| 項目 | 内容 |
|------|------|
| **中核** | **単一の全国相互運用レイヤは弱い** — 連邦は agency 別 API + 共通認証・認可 |
| **主要要素** | **FedRAMP**（クラウド認可 · **OSCAL** 機械可読）· **Login.gov** · **SAM.gov** · agency REST API |
| **州** | StateRAMP 等 — wire 先が州の場合は **別 profile** |
| **OpenOrgOS ラップ** | `us_fed_api`（REST + OAuth2 一般）· `us_oscal`（コンプライアンス artifact 交換 · Wire 補助） |
| **注意** | B2B Org 間 Wire 正本は OpenOrgOS · 政府届出は **agency 別**スキーママップ |

### 3.7 チリ — `HUB-SA`（Wave 3）

| 項目 | 内容 |
|------|------|
| **中核** | **PISEE 2** — **Nodo** ソフトウェア · 機関間 **P2P**（中央中継なし）· 署名 · トレーサビリティ |
| **市民向け** | **ChileAtiende** API（access_token · JSON/XML）— サービス情報（Wire 本体とは別） |
| **OpenOrgOS ラップ** | `cl_pisee`（G2G）· `cl_chileatiende`（公開 API · 任意） |
| **参考** | [pisee.gob.cl](https://pisee.gob.cl/que-es-pisee/) |

### 3.8 ニュージーランド — `HUB-OCEANIA-NZ`（Wave 2 trust / Wave 5 Hub）

| 項目 | 内容 |
|------|------|
| **中核** | **NZ API Standard**（GCDO · 2022 Guidelines 昇格）· REST · OpenAPI · OAuth2/mTLS |
| **承継** | Endowment trust と **同一法域** |
| **OpenOrgOS ラップ** | `nz_api_standard` |
| **豪州との差** | NZ = API Standard 正本 · 豪州 = [api.gov.au](https://api.gov.au/) + AGDIS（別国 · satellite）

### 3.9 エジプト — `HUB-AF-CAI`（Wave 4）

| 項目 | 内容 |
|------|------|
| **中核** | **Digital Egypt**（digital.gov.eg）— 210+ サービス · **G2G API** 連携 |
| **OpenOrgOS ラップ** | `eg_digital_egypt` |
| **Witness** | MS 直行 · landing DC · Ramses 非依存 |
| **注意** | SOA 先行型の歴史 — **組織間合意 + API** をセットで設計 |

### 3.10 ジブチ — `HUB-AF-DJ`（Wave 4）

| 項目 | 内容 |
|------|------|
| **中核** | **X-Road**（ANSIE · e-Governance Academy 導入 · 2021–2022） |
| **OpenOrgOS ラップ** | **`xroad_v7` を再利用** — member/subsystem は DJ 固有 |
| **相性** | タリン · エストニア Hub と **技術スタック共通** — adapter 実装の再利用度高 |
| **参考** | [eGA Djibouti X-Road](https://ega.ee/project/public-administration-modernisation-djibouti/) |

### 3.11 南ア — `HUB-AF-ZA`（Wave 4）

| 項目 | 内容 |
|------|------|
| **中核** | **SITA** · **MIOS**（Minimum Interoperability Standards）— G2G/G2B/G2C |
| **技術** | オープン標準 · OAI-PMH メタデータ等 · 国家ポータルバックエンド統合 |
| **OpenOrgOS ラップ** | `za_sita_mios` |
| **注意** | 治安 · **短時間監査** · 現地パートナー必須 |

---

## 4. 主要国（Hub 外 · 将来ラップ）

### 4.1 中国 — `cn_gov_data_exchange`

| 項目 | 内容 |
|------|------|
| **国标** | **GB/T 45800.1-2025**（总体框架）· **GB/T 45800.2-2025**（数据共享交换要求 · 2025-10-01〜） |
| **方式** | 接口传输 · 库表交换 · 文件交换 |
| **OpenOrgOS** | `EventEnvelope` → 国标 JSON/XML ビュー · 国家政务大数据平台経由 |
| **Hub** | なし（東京 APAC で足りる方針）· **越境 Wire は別途コンプライアンス** |

### 4.2 香港 — `hk_iam_smart`

| 項目 | 内容 |
|------|------|
| **中核** | **iAM Smart** / **iAM Smart+** — OAuth 2.0 · 電子署名（ETO）· e-ME 填表 |
| **接続** | Sandbox → Production · [iamsmart.cyberport.hk](https://iamsmart.cyberport.hk/) |
| **OpenOrgOS** | 認証・署名レイヤをラップ · Wire envelope は MIME 拡張 |

### 4.3 シンガポール — `sg_apex`

| 項目 | 内容 |
|------|------|
| **中核** | **APEX**（API Exchange）· **Singpass** · **CorpPass**（FAPI 2.0 · PAR） |
| **Hub 方針** | Witness **不採用**（東京 APAC）— adapter のみ将来 |
| **参考** | [GovTech APEX](https://www.developer.tech.gov.sg/products/categories/data-and-apis/apex-cloud/features-roadmap) |

### 4.4 豪州 — `au_apigovau` / `au_agdis`

| 項目 | 内容 |
|------|------|
| **一般 API** | **api.gov.au** — Whole-of-Government API Design Standard |
| **Digital ID** | **AGDIS** · Digital ID Act 2024 · **OIDC** プロファイル（Schedule 2） |
| **NZ との関係** | オークランド Hub 正 · **シドニー satellite** — 豪州は **別 profile** |
| **OpenOrgOS** | B2B Wire = `au_apigovau` · 本人確認連携 = `au_agdis`（任意） |

### 4.5 欧州（EU 横断）— `eu_edelivery_as4`

| 項目 | 内容 |
|------|------|
| **フレーム** | **European Interoperability Framework (EIF) 2017**（改訂進行中） |
| **技術 BB** | **CEF eDelivery** — **AS4** · 4-corner model · Access Point |
| **関連** | **eIDAS**（eSignature · eID）· **SDG**（Single Digital Gateway）· **EBSI** |
| **Hub との関係** | **タリン（EE）** · **ダブリン（IE）** で EU 域をカバー — 越境は AS4 profile |
| **OpenOrgOS** | `eu_edelivery_as4` — X-Road（EE）と **compose**（ Eesti X-Road は EU 域で普及） |

### 4.6 ロシア — `ru_smev3` / `ru_smev4`

| 項目 | 内容 |
|------|------|
| **中核** | **СМЭВ**（SMEV）— 連邦官庁間電子相互作用 |
| **版** | **SMEV3** — SOAP/XML · WS-Security · **SMEV4** — REST/JSON · OpenAPI · ESIA 認証 |
| **接続** | **SKZI** 暗号網（ViPNet 等）· 公開インternet ではない |
| **OpenOrgOS** | ラップ可能だが **接続・認証の政治・技術ハードル大** — 優先 **P5** |
| **Hub** | なし |

### 4.7 インド — `in_api_setu`

| 項目 | 内容 |
|------|------|
| **中核** | **API Setu**（MeitY）— 4200+ API · **DigiLocker** · **MeriPehchaan** |
| **認証** | OAuth 2.0 · HMAC · パートナー onboarding |
| **OpenOrgOS** | `in_api_setu` · ドキュメント/サービス API を envelope にマップ |
| **Hub** | なし（APAC は東京） |

### 4.8 ジョージア — `ge_gov_gateway_3g`（既存）

| 項目 | 内容 |
|------|------|
| **中核** | **Georgian Government Gateway (3G)** — DGA · 350+ サービス · デジタル署名 |
| **OpenOrgOS** | [georgia-3g-adapter.profile.yaml](../../steward/jurisdiction-packs/GE/protocol/georgia-3g-adapter.profile.yaml) |

---

## 5. 技術ファミリー（実装再利用）

```
X-Road ファミリー          EU AS4 ファミリー         中央 API Gateway 型
─────────────────          ───────────────          ───────────────────
EE タリン                  IE ダブリン + EU           TR e-Devlet
DJ ジブチ ★                CEF eDelivery              GE 3G
（将来 FI 等）              eIDAS                      EG Digital Egypt
                                                      UAE API Marketplace

OAuth/FAPI 身份層           国标 / 標準化データ交換
─────────────────          ─────────────────────
HK iAM Smart               CN GB/T 45800
SG APEX/Singpass           IN API Setu
AU AGDIS                   ZA SITA MIOS
JP e-Gov/GPKI              CL PISEE (Nodo)
                           US Fed agency APIs

ロシア SMEV（独立 · SKZI 必須）
```

**★ ジブチ:** Hub 配置国かつ **X-Road** — タリン Hub と **同一 adapter コア**で実装コスト最小。

---

## 6. OpenOrgOS への推奨ロードマップ（更新）

| 優先 | profile 群 | 理由 |
|------|-------------|------|
| **P2** | `xroad_v7`（EE **+ DJ**）· `ie_psb_api` · `nz_api_standard` · `ae_uae_api` | Hub Wave 1–2 · X-Road 再利用 |
| **P3** | `jp_*` · `tr_edevelop` · `cl_pisee` · `us_fed_api` · `eu_edelivery_as4` · `au_apigovau` | Hub Wave 3 または EU/US/APAC 需要 |
| **P4** | `ge_gov_gateway_3g` · `eg_digital_egypt` · `za_sita_mios` · `sg_apex` · `hk_iam_smart` · `in_api_setu` · `cn_gov_data_exchange` | AF / 隣接 / 将来 APAC |
| **P5** | `ru_smev4` | 暗号網 · 制裁・接続リスクを別途評価 |

---

## 7. Hub · Wire · Gov Gateway の関係（再掲）

| レイヤ | 例 |
|--------|-----|
| **Wire** | `EventEnvelope` 正本 |
| **Gov Gateway** | 上表の国家規格へ encode/decode |
| **Hub** | digest Witness（`witness_mode: orgos_hub`） |

**原則:** 国家ゲートウェイ失敗で Wire 承認をロールバックしない（[gov-gateway-adapters.md §2](gov-gateway-adapters.md)）。

---

## 8. 参考リンク

| 国・地域 | URL |
|----------|-----|
| X-Road | https://x-road.global/ |
| 日本 e-Gov | https://www.e-gov.go.jp/ |
| Georgia 3G | World Bank GovTech Georgia |
| UAE API Marketplace | OECD OPSI |
| Ireland PSB API | https://datacatalogue.gov.ie/api_catalogue/ |
| Turkey e-Devlet | https://www.turkiye.gov.tr/ |
| Chile PISEE | https://pisee.gob.cl/ |
| NZ API Standard | https://docref.digital.govt.nz/nz/dia/nz-api-standard/ |
| Australia api.gov.au | https://api.gov.au/ |
| EU eDelivery | https://interoperable-europe.ec.europa.eu/ |
| SMEV | https://info.gosuslugi.ru/ |
| India API Setu | https://www.apisetu.gov.in/ |
| China GB/T 45800 | 全国标准信息公共服务平台 |
| HK iAM Smart | https://www.iamsmart.gov.hk/ |
| Singapore APEX | https://www.developer.tech.gov.sg/ |
| Egypt Digital Egypt | https://digital.gov.eg/ |
| Djibouti X-Road | https://ega.ee/project/djibouti-digital-interoperability-platform/ |

---

## 9. 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-07-07 | 初版 — Hub 国 + 主要 8 国 + AF 3 調査 |
| 2026-07-07 | 国別メモ `memos/countries/` を追加 |
