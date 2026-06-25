# Jurisdiction Pack 契約

**正本:** 組織 OS 法域拡張 · 実装: `src/lib/jurisdiction.ts` · `steward/jurisdictions/registry.yaml`  
**完成度:** [tjs-11-target-jurisdictions.md](tjs-11-target-jurisdictions.md) — pack_ready DoD · TJS-11 分母

---

## 1. 定義

**Jurisdiction Pack** = 1 法域における **株式会社相当** テナント向けの差替セット:

| 要素 | パス例 |
|------|--------|
| レジストリ | `steward/jurisdictions/registry.yaml`（索引のみ） |
| 規程カタログ | `steward/jurisdiction-packs/{code}/regulations/catalog.yaml` |
| 規程テンプレ | `regulations_templates_dir`（全法域: `steward/jurisdiction-packs/{code}/regulations/templates/`） |
| seed | `steward/jurisdiction-packs/{code}/seed/*.example` |
| entity forms | `steward/jurisdiction-packs/{code}/entity-forms.yaml` |

**業務モジュール**（`steward/modules/rental/` 等）とは **別契約**。テナントは `modules.yaml` で ON/OFF · `tenant.yaml` で法域を指定。

OSS 分離: [jurisdiction-oss-governance.md](jurisdiction-oss-governance.md) · [pack_contract.md](../../steward/jurisdiction-packs/pack_contract.md)

---

## 2. テナント bind — 2 軸（独立）

```yaml
# tenants/{id}/tenant.yaml

# ── 法域（legal）── 規程 · 税 · 法人形態
jurisdiction: JP          # JP | US | SG | EE | HK
entity_form: kk
legal_subdivision: DE     # 任意 — US pack でデラウェア州法（省略時 pack 既定）

# ── 表示言語（display）── UI · Agent · 規程 MD 起草言語（法域と独立）
display_language: ja      # ja | en | zh-Hant | zh-Hans | et
locale: ja-JP             # レガシー BCP 47（display_language 省略時）

default_currency: JPY
```

| 軸 | フィールド | 例 |
|----|-----------|-----|
| **法域** | `jurisdiction` · `legal_subdivision` | 日本法 · デラウェア州法 · 香港法 |
| **表示** | `display_language` · `locale` | 日本語 UI · 英語 UI |

環境変数 `STEWARD_DISPLAY_LANGUAGE` でセッションのみ表示言語を上書き可。

CLI:

```bash
npm run steward -- jurisdiction list
npm run steward -- jurisdiction show
npm run steward -- locale list
npm run steward -- locale show
```

```yaml
# tenants/{id}/jurisdiction.yaml（任意 · 上書き）
pack: US
```

---

## 3. テナント要件

| 項目 | ルール |
|------|--------|
| `jurisdiction` | **全テナント必須** — `tenant.yaml` に明示 |
| `tenant init` | `--jurisdiction` 省略時は `JP` を書き込む（暗黙フォールバックはコードに持たない） |
| 旧 path | `steward/standards/regulations/` はリダイレクト README のみ · 読取は pack 経由 |
| validate | `npm run check` · 各法域 demo テナントで validate |

---

## 4. validate 分岐

| ファイル | 解決 |
|---------|------|
| `data/finance/tax-profile.yaml` | pack の `tax_profile_schema`（`jp` · `us` · `corporate`） |
| `data/finance/chart-of-accounts.yaml` | pack の `default_currency` |
| `regulations.yaml` ids | 当該 pack catalog の REG id |
| 決算 PDF (`kessan`) | JP pack 専用 — 他法域は未実装 |

実装: `getResolvedJurisdiction()` → schema · catalog path 解決

---

## 5. 必須ファイル（pack ごと）

| チェック | JP | US | SG | EE | HK |
|---------|:--:|:--:|:--:|:--:|:--:|
| `registry.yaml` 登録 | ✓ | ✓ | ✓ | ✓ | ✓ |
| demo テナント validate | mal | us-demo | sg-demo | ee-demo | hk-demo |
| `regulations/catalog.yaml` | ✓ | ✓ |
| `entity-forms.yaml` | ✓ | ✓ |
| governance テンプレ ≥4 | ✓ | ✓ |
| `seed/tax-profile.yaml.example` | ✓ | ✓ |
| `seed/chart-of-accounts.yaml.example` | ✓ | ✓ |

CLI: `npm run steward -- jurisdiction check [JP|US]`（将来） · 現状は `tests/jurisdiction.test.ts`

---

## 6. Agent · トークン

- `modules sync-context` が **有効 jurisdiction** を `active_context.md` に 1 行記載
- 規程テンプレは **当該 pack の catalog に列挙された REG のみ** 読取可（既存 cursor rule と同型）
- `travel_booking` 等 Skill は `resolveCorporateCoreReg("travel")` で REG-008 / REG-US-008 を切替

---

## 7. 旧 path ポリシー

`steward/standards/regulations/` は **非正本**（リダイレクトのみ）。新規 REG は当該法域パックの catalog · templates に追加する。

関連: [jurisdiction-matrix.md](jurisdiction-matrix.md) · [module_contract.md](../../steward/modules/module_contract.md)
