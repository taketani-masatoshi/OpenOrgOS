# TJS-11 — 目標法域セットと完成度評価

**正本:** 組織 OS · 法域 pack 完成度の分母定義  
**関連:** [jurisdiction-matrix.md](jurisdiction-matrix.md) · [jurisdiction-pack-contract.md](jurisdiction-pack-contract.md) · [framework-assessment.md](../framework-assessment.md) §11

---

## 1. なぜ 275 法域を分母にしないか

`steward/jurisdictions/countries.yaml` は **ISO 3166-1 alpha-2 全件（249 法域）** を索引する。未実装法域は `tier: stub` で共有 `_stub` pack にフォールバックする。

| レイヤ | 分母 | 意味 |
|--------|------|------|
| **グローバル索引** | 249 法域 | 「選択肢として存在する」— stub 可 |
| **TJS-11（本書）** | **11 バケット** | 「製品として準備する」— pack_ready 必須 |
| **参照実装** | JP | mal テナント · pack_reference |

275 国・地域を 100% 実装するのは **製品ゴールではない**。評価・ロードマップ・バックログの分母は **TJS-11** を使う。

---

## 2. TJS-11 一覧

| # | ゴール地域 | pack 単位 | ISO | 必須表示言語 | 備考 |
|---|-----------|-----------|-----|-------------|------|
| 1 | **欧州** | `EU` **または** `DE`+`FR`+`GB`+`NL`+`IE` | 下表参照 | en + 各国語 | §3 で定義を固定 |
| 2 | 中国 | `CN` | CN | zh-Hans · en | 本土法人 |
| 3 | UAE | `AE` | AE | en · **ar** | デュアル言語 |
| 4 | シンガポール | `SG` | SG | en | sg-demo |
| 5 | ロシア | `RU` | RU | **ru** · en | データ residency は pack notes |
| 6 | アメリカ | `US` | US | en | us-demo · subdivision |
| 7 | マレーシア | `MY` | MY | en · **ms** | |
| 8 | 香港 | `HK` | HK | en · zh-Hant | hk-demo · language_bridge 例 |
| 9 | 台湾 | `TW` | TW | zh-Hant · en | 法域・表示を pack 契約で明示 |
| 10 | 日本 | `JP` | JP | ja · en | mal · **pack_reference** |
| 11 | オーストラリア | `AU` | AU | en | Pty Ltd 想定 |

**進捗の数え方:** TJS-11 の各バケットが **pack_ready**（§4）に達した数 ÷ **11**。欧州は §3 の定義に従い、達成条件を満たすまで **0 または部分点** とする（EE 単体は欧州達成とみなさない）。

---

## 3. 欧州（TJS-EU）の定義 — **案 A 確定（2026-06-25）**

「欧州」は ISO 1 コードにできない。TJS-11 の欧州バケットは **案 A — EU メタ pack** を正本とする。

| 項目 | 内容 |
|------|------|
| pack id | **`EU`**（TJS メタ · `countries.yaml` に登録） |
| 構成 | 共通 `corporate_core` REG · 税/CoA seed · 分国 `legal_subdivision`（US/DE と同型） |
| 達成 | `EU` pack_ready + **DE · FR · GB** subdivision テンプレ |
| テナント | **`eu-demo`** · `legal_subdivision: DE` · `entity_form: gmbh` |

### 案 B — 主要国 5 pack（**不採用** · 参照のみ）

| 項目 | 内容 |
|------|------|
| pack id | `DE` · `FR` · `GB` · `NL` · `IE` |
| 備考 | 将来の subdivision 拡張で部分再利用可 |

### 現状（2026-06-25）

| 項目 | 状態 |
|------|------|
| `EE`（エストニア） | pack_ready · ee-demo — **EU サンプル 1 国** |
| **`EU`（TJS メタ）** | **pack_ready** · eu-demo · subdivisions DE FR GB |
| TJS-EU 達成 | **✓ 案 A 達成** |

---

## 4. 法域 pack readiness tier

業務モジュールの [readiness.yaml](../../steward/modules/readiness.yaml) と同型。**法域 pack 専用 tier**（`countries.yaml` の `stub` / `full` とは別概念）。

| tier | 定義 | 確認 |
|------|------|------|
| **stub** | ISO 登録のみ · `_stub` 共有 | `countries.yaml` `tier: stub` |
| **pack_skeleton** | `pack.manifest.yaml` · `entity-forms.yaml` · `regulations/catalog.yaml` 骨格 | `jurisdiction packs check {code}` 通過 |
| **pack_ready** | 下記 DoD すべて ✓ | demo テナント `validate` 0 |
| **pack_reference** | pack_ready + 法域固有 modules + **実運用テナント**例 | 現状 **JP のみ** |

### pack_ready DoD（チェックリスト）

1. **`pack.manifest.yaml`** — `corporate_core` 8 キー写像 · `regulations_catalog` · `tax_profile_schema`
2. **`regulations/templates/core/`** — officer_comp · board · shareholder · approval · expense · conflict · document · travel の **8 REG テンプレ実体**
3. **`seed/`** — `tax-profile.yaml.example` · `chart-of-accounts.yaml.example`
4. **`entity-forms.yaml`** — 当法域のデフォルト法人形態 + 主要形態 3 件以上
5. **demo テナント** — `tenants/{code}-demo/` · `jurisdiction: {code}` · `npm run steward -- --tenant {code}-demo validate` **エラー 0**
6. **`countries.yaml`** — 当該 ISO の `tier: full` · `pack_root` 設定
7. **`registry.yaml` + `packs.lock.yaml`** — 索引 · pin 更新
8. **テスト** — `jurisdiction packs check {code}` を CI / `npm run check` に含む

pack 内 `modules/`（宣言系等）は **pack_ready 必須ではない**。JP の `declaration_modules` は **pack_reference** 要件。

---

## 5. 表示言語（法域と独立）

法域 pack と **別 KPI**。正本: [steward/locale/registry.yaml](../../steward/locale/registry.yaml)

### TJS-11 必須言語レジストリ

| `display_language` | BCP 47 | TJS 用途 | registry（2026-06） |
|--------------------|--------|---------|:-------------------:|
| ja | ja-JP | JP | ✓ |
| en | en-US | US · SG · HK · AU · AE 共通 | ✓ |
| zh-Hant | zh-HK | HK · TW | ✓ |
| zh-Hans | zh-CN | CN | ✓ |
| et | et-EE | EE（EU デモ） | ✓ |
| **ar** | ar-AE | AE | ✓ |
| **ru** | ru-RU | RU | ✓ |
| **ms** | ms-MY | MY | ✓ |
| **de** | de-DE | EU（案 A） | ✓ |
| fr | fr-FR | EU（案 B · 未採用） | 未登録 |

**言語完成度** = TJS 必須言語のうち `registry.yaml` に定義があり、`locale show` · Agent 要約で利用可能な数 ÷ 必須数。

### language_bridge（横断）

[language_bridge](../../steward/modules/language_bridge/) は **ユーザー表示言語 ≠ 議事録正本言語**（例: hk-demo — user `en` · system `zh-Hant`）。UI 多言語化そのものとは別レイヤ。

---

## 6. 三軸評価（完成度の報告形式）

モジュール · 法域 · 言語を **混ぜない**。

```
法域完成度  = TJS-11 で pack_ready 以上のバケット数 / 11
言語完成度  = TJS 必須 display_language 数 / 必須言語数（§5 表）
業務完成度  = production_ready モジュール数 / カタログ数（別軸 · readiness.yaml）
```

**製品体感完成度** は三軸の **最小値** または **加重平均** で報告する（[framework-assessment.md](../framework-assessment.md) §11）。

| 軸 | 分母 | 分子（2026-06 実測） | 率 |
|----|------|----------------------|-----|
| 法域 pack | TJS-11 | **11**（全バケット） | **100%** |
| 表示言語 | 9（§5 · fr 除く） | **9** | **100%** |
| 業務 module production_ready | 24 | **19** | **76%** |

欧州: TJS-EU **100%**（案 A · `EU` pack + subdivisions DE FR GB）。

---

## 7. 現状スナップショット（2026-06-25）

### pack 実装済（tier full）

| ISO | pack | tier（本書） | demo テナント |
|-----|------|-------------|--------------|
| JP | steward/jurisdiction-packs/JP | pack_reference | mal |
| US | steward/jurisdiction-packs/US | pack_ready | us-demo |
| SG | steward/jurisdiction-packs/SG | pack_ready | sg-demo |
| EE | steward/jurisdiction-packs/EE | pack_ready（EU 非該当） | ee-demo |
| HK | steward/jurisdiction-packs/HK | pack_ready | hk-demo |
| AU | steward/jurisdiction-packs/AU | pack_ready | au-demo |
| TW | steward/jurisdiction-packs/TW | pack_ready | tw-demo |
| MY | steward/jurisdiction-packs/MY | pack_ready | my-demo |
| CN | steward/jurisdiction-packs/CN | pack_ready | cn-demo |
| AE | steward/jurisdiction-packs/AE | pack_ready | ae-demo |
| RU | steward/jurisdiction-packs/RU | pack_ready | ru-demo |
| EU | steward/jurisdiction-packs/EU | pack_ready（TJS メタ） | eu-demo |

### TJS-11 未着手

**なし** — 11/11 pack_ready 達成（2026-06-25）。

### CLI 確認

```bash
npm run steward -- jurisdiction list
npm run steward -- jurisdiction packs check
npm run steward -- --tenant hk-demo validate
npm run steward -- locale list
```

---

## 8. ロードマップ優先順（TJS-11 達成）

| 順 | バケット | 理由 | 依存 |
|----|---------|------|------|
| 1 | **AU · MY · TW · CN** | HK/SG テンプレ流用 · 中華圏言語 registry 済 | zh-Hant/Hans |
| 2 | **AE** | GCC ハブ | **ar** registry |
| 3 | **RU** | 単独 pack | **ru** registry · residency notes |
| 4 | **TJS-EU** | ~~案 A/B 確定後~~ **✓ 案 A 完了** | de registry · EU manifest |
| — | **JP** | pack_reference 維持 | 宣言 modules 継続 |

---

## 9. バックログ · 定期見直し

| 頻度 | アクション |
|------|-----------|
| 法域 pack PR | `jurisdiction packs check {code}` · demo validate · 本書 §6 表更新 |
| 四半期 | TJS-11 進捗を [framework-assessment.md](../framework-assessment.md) §11 に反映 |
| 欧州方針確定 | ~~本書 §3 案 A/B のどちらかを `[x]` で固定~~ **案 A 確定（2026-06-25）** |

タスク正本: [framework-backlog.md](../framework-backlog.md) Phase **ORG-J8**

---

## 10. 関連

- [jurisdiction-matrix.md](jurisdiction-matrix.md) — Corporate Core 写像 · 調査表
- [jurisdiction-pack-contract.md](jurisdiction-pack-contract.md) — テナント 2 軸 bind
- [jurisdiction-oss-governance.md](jurisdiction-oss-governance.md) — OSS 分離 · CODEOWNERS
- [steward/jurisdictions/00-README.md](../../steward/jurisdictions/00-README.md) — 索引 CLI
- [framework-assessment.md](../framework-assessment.md) §11 — 三軸評価の製品文脈
