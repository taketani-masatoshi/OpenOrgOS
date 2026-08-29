# Skill: tenant_config_propose（テナント設定変更の提案）

## 目的

`modules.yaml` / `standards.yaml` の `enabled` 変更を **提案**し、Org Approval（`tenant.config`）を起票する。適用は CEO 承認後のみ。

## CLI

```bash
npm run orgos -- tenant-config propose --target standards --id ISO-27001 --enabled true
npm run orgos -- tenant-config propose --target modules --id rental --enabled true
npm run orgos -- skills run tenant-config-propose
```

## 制約

- YAML を直接書き換えない（propose のみ）
- 承認は `orgos tenant-config approve --id APR-… --reviewed` または Steward Chat UI
