# data/investor-relations/

Agent capability seed — copy from `tenants/_template` on `orgos tenant init`.

Expected YAML (from `orgos modules activate investor_relations` seed):
- `cap-table.yaml` — structured cap table (holder_ref = stakeholder_id)
- `investor-registry.yaml` — investor/shareholder contact index (no L2 values)
- `disclosure-calendar.yaml` — statutory/voluntary disclosure schedule
- `ir-materials.yaml` — IR materials index

This template ships `*.yaml.example`. Activate copies module seed into the live filenames.

Validate: `npm run orgos -- operations ir validate`
Cross-check finance: `npm run orgos -- finances capital-raise-crosscheck`
