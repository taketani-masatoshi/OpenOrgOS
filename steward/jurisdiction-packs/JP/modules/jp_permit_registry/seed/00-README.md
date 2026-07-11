# jp_permit_registry seed

JP 法域の **許認可種別カタログ**（テナント非依存）と、テナント固有の **保有台帳** を分離する。

## 有効化

```bash
mkdir -p tenants/{id}/data/permit-registry
cp steward/jurisdiction-packs/JP/modules/jp_permit_registry/seed/permit-registry.yaml.example \
   tenants/{id}/data/permit-registry/permit-registry.yaml
cp steward/jurisdiction-packs/JP/modules/jp_permit_registry/seed/application-registry.yaml.example \
   tenants/{id}/data/permit-registry/application-registry.yaml
cp steward/jurisdiction-packs/JP/modules/jp_permit_registry/seed/obligation-instances.yaml.example \
   tenants/{id}/data/permit-registry/obligation-instances.yaml
# 種別カタログは seed 正本を参照（テナントコピー任意）
```

`modules.yaml` 例:

```yaml
modules:
  - id: permit_registry
    agent: jp_permit_registry
    enabled: true
    data_root: data/permit-registry/
```

## ファイル

| ファイル | 層 | 内容 |
|---------|-----|------|
| `permit-types-catalog.yaml` | JP pack | 許認可種別マスタ（60+ 種） |
| `obligations-catalog.yaml` | JP pack | 種別別義務・報告 |
| `forms-catalog.yaml` | JP pack | 許認可種別 → 申請書テンプレ · 必須項目 · 公表 URL |
| `field-map.yaml` | JP pack | 書式項目 → `company.*` / `property.*` 写像 |
| `drafts/{APP-ID}.yaml` | テナント | 申請作業ドラフト（提出前正本） |
| `permit-registry.yaml` | テナント | 保有許可インスタンス |
| `application-registry.yaml` | テナント | 申請案件 |
| `obligation-instances.yaml` | テナント | 義務の次回期限・履行 |
| `sources.yaml` | 参照 | 各省庁公表 URL |
| `ledgers/` | テナント | 点検・報告記録 |

## 旧 INDEX.csv からの移行

```bash
orgos operations permit import-index --dry-run
orgos operations permit import-index --write
```

（`import-index` は Phase 1 で実装予定）
