# jp_subsidy_application seed

テナント `data/subsidy/` へコピー:

```bash
cp steward/jurisdiction-packs/JP/modules/jp_subsidy_application/seed/*.example tenants/{id}/data/subsidy/
# briefs/ は必要に応じて mkdir
```

`modules.yaml`（JP テナント）:

```yaml
  - id: jp_subsidy
    enabled: true
    agent: jp_subsidy_application
    data_root: data/subsidy/
```

給与単価は **L2** — 本番は gitignore 側 `personnel-cost-basis.yaml` にのみ記載可。
