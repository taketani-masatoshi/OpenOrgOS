# 法域マトリクス — 株式会社相当法人形態

**正本:** 組織 OS · Jurisdiction Pack 設計  
**完成度分母:** [tjs-11-target-jurisdictions.md](tjs-11-target-jurisdictions.md)（TJS-11 · 275 法域は索引のみ）  
**スコープ:** 有限責任 · 出資者/株主 · 役員・取締役会型ガバナンスを **中心** としつつ、**合同会社 · LLC · パートナーシップ · NPO · 組合 · 個人事業主** 等は `entity-forms.yaml` で選択可能（実装深度は tier · status で段階化）

---

## 法域一覧

- **249 法域** — `steward/jurisdictions/countries.yaml`（ISO 3166-1 alpha-2）— **索引 · stub 可**
- **TJS-11** — 製品として準備する 11 バケット — [tjs-11-target-jurisdictions.md](tjs-11-target-jurisdictions.md)
- **tier full（現状 7）** — JP · US · SG · EE · HK · AU · TW（`pack_ready` 以上 · TJS-11 は 6）
- **tier stub** — 残り 244 法域 · 共有 `steward/jurisdiction-packs/_stub/`

```bash
npm run orgos -- jurisdiction countries
npm run orgos -- jurisdiction entity-forms JP
npm run orgos -- jurisdiction entity-forms US --subdivision DE
```

---

## Corporate Core（Steward 抽象）

| 抽象 ID | 意味 | JP (mal) | US (C-Corp) |
|---------|------|----------|-------------|
| `entity` | 名称 · 識別子 · 本店 | 法人番号 · 本店 | EIN · State of incorporation |
| `governance.shareholder_meeting` | 最高意思決定 | 株主総会 (REG-003) | Shareholder meeting (REG-US-003) |
| `governance.board` | 執行・監督 | 取締役会 (REG-002) | Board of directors (REG-US-002) |
| `governance.approval` | 決裁 | 稟議・決裁 (REG-004) | Approval authority (REG-US-004) |
| `policies.expense` | 経費 | REG-005 | REG-US-005 |
| `policies.travel` | 旅費 | REG-008 | REG-US-008 |
| `policies.document` | 文書 | REG-007 | REG-US-007 |
| `finance.tax` | 法人税 · 間接税 | 法人税 · 消費税 | Federal · State · Sales tax |
| `finance.coa` | 勘定 · 通貨 | JPY · 日本 GAAP 目安 | USD · US GAAP 目安 |

---

## 第1ラウンド調査（5 法域）

| 法域 | 対象形態 | ガバナンス | 法人税 | 間接税 | 識別子 | FY 慣行 |
|------|---------|-----------|--------|--------|--------|---------|
| **JP** | 株式会社 (KK) | 株主総会 · 取締役会 | 法人税 · 地方法人税 | 消費税 | 法人番号 (13桁) | 3/31 または定款 |
| **US** | C-Corporation | Shareholders · Board · Officers | Federal 21% · State varies | Sales tax (州) · 無 VAT | EIN · State file no. | Calendar year 多い |
| **SG** | Private Co. (Pte Ltd) | AGM · Directors | 17% (partial exempt) | GST 9% | UEN | 定款 |
| **EE** | OÜ (Osaühing) | Shareholders · Management board | 22% CIT | VAT 22% | Registry code | Calendar year 多い |
| **HK** | Private Ltd | General Meeting · Directors | Profits tax 16.5% | なし | BRN | 3/31 多い |
| **UK** | Private Ltd (Ltd) | AGM · Directors | Corporation tax 25% | VAT 20% | CRN | 04-05 または定款 |
| **DE** | GmbH（中小）/ AG（大会社） | Gesellschaftervers. · Geschäftsführung/Vorstand | Körperschaftsteuer + Gewerbesteuer | USt 19% | Handelsregister | Calendar year 多い |

### 組織形態（法域依存 · entity-forms.yaml）

| 法域 | 例（`jurisdiction entity-forms`） |
|------|-------------------------------------|
| **JP** | kk · gk · 民法任意組合 · 技術研究組合 · NPO · 個人事業主 等 22 形態 |
| **US** | c_corp · s_corp · llc · lp · llp · gp · nonprofit 等 |
| **US · DE** | Delaware LLC · C-Corp · LP · Series LLC 等 |

### 後続 Epic（深度）

| 法域 | 形態 | 状態 |
|------|------|------|
| JP | 学校法人 · 医療法人 · 管理組合 | entity-forms に stub 登録済 · pack 深度は後続 |
| 任意 | 外国法準拠 SPV | subdivision / 別 pack |

---

## 第2ラウンド（参照 · 一部実装済）

| 法域 | 対象形態 | Steward |
|------|---------|---------|
| **SG** | Pte Ltd | **pack + sg-demo** |
| **EE** | OÜ | **pack + ee-demo** |
| **HK** | Private company limited by shares | **pack + hk-demo** |
| AU | Proprietary Ltd (Pty Ltd) | **pack + au-demo** |
| TW | Private Company Limited by Shares | **pack + tw-demo** |

### TJS-11 進捗（2026-06-25）

| TJS バケット | pack_ready | 備考 |
|-------------|:----------:|------|
| JP | ✓ | pack_reference · mal |
| US | ✓ | us-demo |
| SG | ✓ | sg-demo |
| HK | ✓ | hk-demo |
| AU | ✓ | au-demo |
| TW | ✓ | tw-demo |
| MY | ✓ | my-demo |
| CN | ✓ | cn-demo |
| AE | ✓ | ae-demo · ar locale |
| RU | ✓ | ru-demo · ru locale |
| 欧州 | ✓ | **EU** pack · eu-demo · subdivisions DE FR GB（案 A） |

**11/11 完了** — EE は TJS-EU カウント外（EU デモ 1 国）。

詳細: [tjs-11-target-jurisdictions.md](tjs-11-target-jurisdictions.md) §6–§7

---

## Steward 写像 — 規程 REG

| Corporate Core | JP | US | SG / EE / HK |
|----------------|----|----|--------------|
| 役員報酬 | REG-001 | REG-US-001 | REG-SG/EE/HK-001 |
| Board | REG-002 | REG-US-002 | REG-*-002 |
| Shareholder | REG-003 | REG-US-003 | REG-*-003 |
| 決裁 | REG-004 | REG-US-004 | REG-*-004 |
| 経費 | REG-005 | REG-US-005 | REG-*-005 |
| 利益相反 | REG-006 | REG-US-006 | REG-*-006 |
| 文書 | REG-007 | REG-US-007 | REG-*-007 |
| 旅費 | REG-008 | REG-US-008 | REG-*-008 |

ISO 連動 REG (REG-009〜) · 事業モジュール REG (REG-012〜) は **法域横断 · テンプレ locale 差替** が Phase 2 以降。

---

## パック選定（実装優先）

**分母:** TJS-11 — [tjs-11-target-jurisdictions.md](tjs-11-target-jurisdictions.md)

1. **JP** — 参照実装 (`mal`) · pack_reference  
2. **US · SG · HK · AU · TW · MY · CN · AE · RU · EU** — pack_ready ✓（TJS-11 **11/11**）  
3. **EE** — EU デモ 1 国（TJS-EU 達成には含めない · `EU` メタ pack が正本）

関連: [jurisdiction-pack-contract.md](jurisdiction-pack-contract.md) · [tjs-11-target-jurisdictions.md](tjs-11-target-jurisdictions.md)
