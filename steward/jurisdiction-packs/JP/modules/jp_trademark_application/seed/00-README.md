# jp_trademark_application seed

テナント有効化時:

```bash
mkdir -p tenants/{id}/data/trademark
cp steward/jurisdiction-packs/JP/modules/jp_trademark_application/seed/*.example tenants/{id}/data/trademark/
# 図形商標の見本は records/trademark/（gitignore 推奨）
```

`modules.yaml` 例:

```yaml
modules:
  - id: trademark
    agent: jp_trademark_application
    enabled: true
    data_root: data/trademark/
```
