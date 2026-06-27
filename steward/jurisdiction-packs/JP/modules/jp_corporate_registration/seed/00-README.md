# jp_corporate_registration — seed 展開

```bash
# tenants/{id}/modules.yaml
modules:
  - id: corporate_registration
    agent: jp_corporate_registration
    enabled: true
    data_root: data/corporate-registration/
```

seed の `.example` を `data/corporate-registration/` にコピーして案件を編集する。

生成物: `docs/corporate-registration/{case-id}/`
