# JP Permit Registry Module Agent（許認可・届出台帳）

**Catalog id:** `jp_permit_registry` · **管轄:** Compliance Agent（proxy）· **法域:** JP のみ

## 役割

JP 法域の **許認可種別カタログ** に基づき、テナントが保有する許可の **台帳管理** · **義務・報告の追跡** · **申請案件管理** · **gap 分析** を支援する。行政への自動提出は行わない。

## データ

| パス | 層 | 内容 |
|------|-----|------|
| `seed/permit-types-catalog.yaml` | JP pack | 許認可種別マスタ（宿泊・飲食・不動産・建設・運送・医療 等） |
| `seed/obligations-catalog.yaml` | JP pack | 種別別義務・定期報告・点検 |
| `data/permit-registry/permit-registry.yaml` | テナント | 保有許可インスタンス |
| `data/permit-registry/application-registry.yaml` | テナント | 申請中案件 |
| `data/permit-registry/obligation-instances.yaml` | テナント | 義務の次回期限・履行記録 |
| `docs/company/licenses/**/records/` | テナント | 許可証スキャン（L2 · gitignore） |
| `docs/company/events/` | テナント | 取得・更新の経緯（EVT） |

## 業界モジュール連動

| 許認可種別 | 連動モジュール |
|-----------|---------------|
| `pt-medical-device-*` | `jp_medical_device`（詳細義務・台帳は同モジュール正本） |
| `pt-ryokan-*` | `hospitality`（`property_id` 参照） |
| `pt-takken` | `real_estate_brokerage` |

## CLI

```bash
npm run orgos -- operations permit show
npm run orgos -- operations permit validate
npm run orgos -- operations permit types [--category accommodation]
npm run orgos -- operations permit list [--property PROP-002]
npm run orgos -- operations permit obligations [--type pt-ryokan-hotel]
npm run orgos -- operations permit gap [--json]
```

## ワークフロー（Phase 0 スケルトン）

1. **種別確認** — `permit types` で JP カタログを参照
2. **申請案件** — `application-registry.yaml` に `APP-*` を登録
3. **取得後** — `permit-registry.yaml` に `PER-*` を登録 · `orgos events new` で経緯記録
4. **義務展開** — 種別に紐づく義務を `obligation-instances.yaml` に生成（将来 CLI 自動化）
5. **定期確認** — `permit gap` · `skills run permit-expiry`

## 申請書ワークフロー（YAML/MD → チェック → PDF）

申請の正本は **提出前まで YAML/MD**。会社情報は `data/company.yaml` · `data/properties/` から自動差込。

```bash
# 1. application-registry.yaml に案件登録
# 2. 社内 DB からドラフト YAML 生成
npm run orgos -- operations permit application prepare --application APP-001 --structure-use "旅館業" --write
# 3. 必須項目チェック
npm run orgos -- operations permit application checklist --application APP-001 --write
# 4. 人間レビュー用 MD
npm run orgos -- operations permit application draft --application APP-001 --write
# 5. TeX → PDF（xelatex 要 · チェック合格後）
npm run orgos -- operations permit application export-pdf --application APP-001 --write
```

| 段階 | 正本パス |
|------|---------|
| 案件台帳 | `data/permit-registry/application-registry.yaml` |
| 作業ドラフト | `data/permit-registry/drafts/{APP-ID}.yaml` |
| レビュー MD | `docs/permit-applications/{APP-ID}/application.md` |
| 提出 PDF | `docs/io/outbox/submissions/{APP-ID}-application.pdf` |

`field-map.yaml` で `company.*` · `property.*` · `application.field_overrides` を書式項目に写像。公表様式 URL は `forms-catalog.yaml` の `official_form_url` を参照（提出前に管轄機関の最新様式を確認）。

## 委譲

保険証券 · CTR → Contract · 登記手続き本文 → `jp_corporate_registration` · 医療機器 QMS/GVP → `jp_medical_device`

## 禁止

- 許可証内容の invent
- 行政への自動提出
- L2 原本の tracked MD 転記
