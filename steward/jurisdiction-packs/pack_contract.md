# Jurisdiction Pack 契約（OSS 配布単位）

> 1 法域 = 1 独立リポジトリ · Steward core は **索引 + pin のみ** 保持  
> 索引: `steward/jurisdictions/registry.yaml` · pin: `steward/jurisdictions/packs.lock.yaml`  
> **製品ゴール · pack tier:** [docs/org-os/tjs-11-target-jurisdictions.md](../../docs/org-os/tjs-11-target-jurisdictions.md)

---

## 1. 何がパックか

**Jurisdiction Pack** は **法律・規程・税・法人形態** の差替セット。`steward/modules/` の業務モジュール（賃貸・旅費等）とは別契約。

| 層 | リポジトリ | 例 |
|----|-----------|-----|
| **Steward core** | `steward-os/steward` | CLI · テナント · 業務モジュール |
| **法域パック** | `steward-os/jurisdiction-jp` 等 | 規程 · 税 seed · 法域固有モジュール |
| **テナント** | 非公開 | `tenant.yaml` · `modules.yaml` |

---

## 2. パックルート構成（必須）

```
{pack-root}/
├── pack.manifest.yaml      正本メタ（必須）
├── entity-forms.yaml       法人形態一覧
├── regulations/
│   ├── catalog.yaml
│   └── templates/
├── seed/
│   ├── tax-profile.yaml.example
│   └── chart-of-accounts.yaml.example
└── modules/                法域固有モジュール（任意）
    └── {module-id}/
        ├── module.manifest.yaml
        ├── agent.md
        └── seed/
```

### `pack.manifest.yaml`（必須フィールド）

| フィールド | 意味 |
|-----------|------|
| `id` | 法域コード（`JP` · `US` · …）— registry と一致 |
| `version` | SemVer |
| `contract_version` | Steward が解釈する契約版（現行 `1`） |
| `owner.org` | GitHub org / 個人 |
| `owner.maintainers` | GitHub team またはユーザー |
| `repository` | 正本 OSS URL |
| `license` | SPDX（例 `MIT`） |
| `regulations_catalog` | pack root **相対** |
| `regulations_templates_dir` | pack root **相対** |
| `tax_profile_schema` | `jp` · `us` · `corporate` |
| `corporate_core` | 旅費等の REG id 写像 |
| `declaration_modules` | pack 内 `modules/` の id 一覧（任意） |

---

## 3. Steward core との接続

```yaml
# steward/jurisdictions/registry.yaml — どの pack を解決するか
packs:
  JP:
    pack_root: steward/jurisdiction-packs/JP   # bundled 時
```

```yaml
# steward/jurisdictions/packs.lock.yaml — pin（CI · テナントが参照）
version: 1
packs:
  JP:
    version: "1.0.0"
    source: bundled                          # または github:steward-os/jurisdiction-jp@v1.0.0
    pack_root: steward/jurisdiction-packs/JP
```

`packs.lock.yaml` の `pack_root` が `packs.lock` にあれば **lock を優先**（vendor / submodule 先を指せる）。

---

## 4. 法域固有モジュール

- 置き場所: `{pack-root}/modules/{id}/`
- 契約は [module_contract.md](../modules/module_contract.md) と **同一**（manifest · agent.md · seed）
- `declaration_modules` に列挙した id のみ、当該法域テナントのカタログに出現
- 他法域テナントの `active_context` には **出さない**（トークン節約）

---

## 5. OSS 公開・オーナー

| 法域 | リポジトリ（目標） | オーナー team |
|------|-------------------|---------------|
| JP | `github.com/steward-os/jurisdiction-jp` | `@steward-os/jp-maintainers` |
| US | `github.com/steward-os/jurisdiction-us` | `@steward-os/us-maintainers` |
| SG | `github.com/steward-os/jurisdiction-sg` | `@steward-os/sg-maintainers` |
| EE | `github.com/steward-os/jurisdiction-ee` | `@steward-os/ee-maintainers` |
| HK | `github.com/steward-os/jurisdiction-hk` | `@steward-os/hk-maintainers` |

各リポジトリに **CODEOWNERS** を置き、法域の法改正・規程更新は **そのリポジトリのメンテナ** が PR する。Steward core は tag を pin するだけ。

詳細: [docs/org-os/jurisdiction-oss-governance.md](../../docs/org-os/jurisdiction-oss-governance.md)

---

## 6. CLI

```bash
npm run steward -- jurisdiction list
npm run steward -- jurisdiction show
npm run steward -- jurisdiction check [JP]
npm run steward -- jurisdiction packs list
npm run steward -- jurisdiction packs check [JP]
```

将来: `jurisdiction packs pin JP --source github:org/repo@v1.2.3`

---

## 7. validate

- `jurisdiction packs check` — manifest · catalog · テンプレ実体 · pack modules
- `modules check {id}` — core / pack どちらのモジュールも解決
- テナント `validate` — `jurisdiction` 必須 · 当該 pack の REG id のみ

関連: [jurisdiction-pack-contract.md](../../docs/org-os/jurisdiction-pack-contract.md) · [module_contract.md](../modules/module_contract.md)
