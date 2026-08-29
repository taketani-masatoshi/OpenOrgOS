# JP 許認可カタログ — 網羅方針とカバレッジ

**Status:** 2026-07-14 · 正本種別は `jp_permit_registry/catalog/permit-types.csv`  
**関連:** [jp-permit-application-requirements.md](./jp-permit-application-requirements.md) · [ADR 0011](../adr/0011-jp-permit-application-vs-registry.md) · [ADR 0012](../adr/0012-business-vs-compliance-fulfilment.md)（業モジュール ↔ 行許可取得の責務分離）

---

## 1. 「網羅」の定義（スコープ）

日本の許認可は自治体条例・届出まで含めると数万件規模になる。本カタログの網羅対象は次に限定する。

| 含む | 含まない（明示的に非ゴール） |
|------|------------------------------|
| 国法・政省令に基づく **事業者単位の許可・免許・登録・指定・届出** | 個人の国家資格のみ（弁護士・税理士・医師免許本体など） |
| 都道府県経由が通常の業免許（旅館業 · 建設業 · 宅建 等） | 市区町村だけのローカル条例固有様式（別途 `jurisdiction_confirm`） |
| 業開始前に取得しないと違法となるもの | 補助金・助成金申請（`jp_subsidy_application`） |
| 薬機法の製販・製造・販売系（医療機器・化粧品・医薬品） | 製品ごとの承認番号マスタ（品目承認は別台帳） |
| 金商法の金融商品取引業（1種・2種・助言・運用） | 行政機関 API 自動提出 |

**更新ルール:** 種別追加は CSV 行追加 → `operations permit catalog validate` → form pack 生成 →（任意）`review_status=verified`。

---

## 2. カテゴリと主な法令群

| category | 代表法令 |
|----------|----------|
| `accommodation` | 旅館業法 · 住宅宿泊事業法 |
| `fire_building` | 消防法 · 建築基準法 |
| `food_beverage` | 食品衛生法 · 酒税法 |
| `real_estate` | 宅建業法 · 賃貸住宅管理業法 · マンション管理業法 |
| `construction` | 建設業法 · 建築士法 |
| `transport` | 貨物自動車運送事業法 · 道路運送法 · 旅行業法 |
| `travel` | 旅行業法 |
| `medical_health` | 薬機法（医療機器 · 化粧品 · 医薬部外品 · 医薬品） |
| `pharmacy_clinic` | 医療法 · 薬局関連 |
| `finance` | 金商法 · 銀行法 · 保険業法 · 貸金業法 · 資金決済法 |
| `labor` | 労働者派遣法 · 職業安定法 |
| `waste_environment` | 廃棄物処理法 |
| `security` | 警備業法 |
| `telecom_media` | 電気通信事業法 · 放送法 |
| `import_export` | 関税法 |
| `entertainment` | 風営法 |
| `retail` | 古物営業法 · たばこ事業法 |
| `welfare_care` | 介護保険法 · 障害者総合支援法 |
| `education` | 学校教育法 |
| `agriculture` | 農地法 · 漁業法 |
| `energy` | 電気事業法 · ガス事業法 |
| `animal` | 動物愛護管理法 |
| `childcare` | 児童福祉法 |
| `other` | 個人情報保護法 · 労基法届出 等 |

---

## 3. 会社 DB → 申請書

| ソース | パス | 用途 |
|--------|------|------|
| 会社 | `data/company.yaml` | 商号 · 法人番号 · 本店 · 代表 · 資本金 · 事業内容 |
| 物件 | `data/properties/PROP-*.yaml` | 施設名・所在地 · 客室数 · 延床 |
| 申請 overrides | `APP` / CLI | 業態 · 免許区分など手入力 |
| 写像 | `data/permit-registry/field-map.yaml` | form フィールド ← 上記 |

L2（個人住所・口座番号）は写像しない。代表者住所は本店流用を既定とする。

---

## 4. 手続き・書類

1. `permit-conditions.csv` — 取得・更新・変更の手続ステップ（正本）
2. `operations permit-app procedures --type <id>` — 条件一覧表示
3. `operations permit-app checklist` — 書式必須項目 + 手続条件の不足
4. `operations permit-app draft` / `export-pdf` — MD/TeX/PDF 出力（OOO `writeTexAndCompile`）

---

## 5. 単独取得（業モジュール不要）

国法級 **138** 種別は `hospitality` 等の業モジュールをインストールしなくても取得手続きを開始できる。

| 前提 | 不要 |
|------|------|
| `jp_permit_application` · `jp_permit_registry` | 業モジュール · `required-compliance.yaml` |
| `data/company.yaml`（商号・本店・代表） | `--property`（全社向け許可） |

```bash
orgos operations permit-app catalog-status
orgos operations permit-app create --type pt-fiea-type1 --write
orgos operations permit-app prepare --application APP-… --write
# … checklist → draft → export-pdf → handoff → submit-mark → approve
# 既取得:
orgos operations permit-app intake attest --type pt-fiea-type1 \
  --permit-number "…" --issued-on YYYY-MM-DD --evidence /path.pdf --write
```

物件系（旅館 · 消防等）は `--property` を推奨。field-map の `site_*` / `structure_use` はグローバル必須ではなく、フォーム `required_fields` と会社フォールバックで充足する。

---

## 6. 安定性評価（2026-07-14）

| 観点 | 判定 | 根拠 |
|------|------|------|
| カタログ 138 取得導線 | **安定** | create は CSV 正本 · forms 138/138 · catalog-status で検証 |
| 業宣言 → 取得 | **安定** | activate → intake plan/attest/start-app · G-01 gate |
| 会社 DB 自動記入 | **安定** | field-map + company fallback（site_*） |
| 行政提出 | **人手** | 自動提出なし · handoff / submit-mark まで |
| 自治体固有様式 | **ギャップ** | jurisdiction_confirm · notes |
| Cert / Inspection | **運用可** | 別 CLI · 推奨は非ブロッキング |

**結論:** 定常業務モジュールが宣言する業許可の取得手続き、およびカタログ単独の国法級 138 種取得は、上記前提モジュールがあれば安定して回せる。開業可否（G-01）は業モジュール有効時のみ Required Compliance を要求する。

---

## 7. 既知の残ギャップ

- 自治体固有の追加様式・手数料はテナント確認が必要
- 金商法・薬機法の **品目・顧客セグメント別の付帯届出** は案件 notes で管理
- 個人資格（宅建士・食品衛生責任者等）は条件行として扱うが、資格者マスタは別途
