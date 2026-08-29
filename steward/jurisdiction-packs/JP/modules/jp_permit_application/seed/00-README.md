# jp_permit_application seed

業免許取得プロジェクトのテナントデータ雛形。

## data_root

テナント `modules.yaml`:

```yaml
- id: jp_permit_application
  enabled: true
  agent: jp_permit_application
  data_root: data/permit-applications/
```

## 展開

```bash
mkdir -p tenants/{id}/data/permit-applications
cp steward/jurisdiction-packs/JP/modules/jp_permit_application/seed/application-registry.yaml.example \
  tenants/{id}/data/permit-applications/application-registry.yaml
```

申請案件（`APP-*`）は本モジュール正本。保有許可（`PER-*`）は `jp_permit_registry` の `data/permit-registry/`。

書式テンプレ · forms-catalog · field-map は **registry** モジュール seed / テナント `data/permit-registry/` を参照する。
