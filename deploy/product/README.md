# OrgOS Ledger — マネージド単一テナント（Docker）

顧客 1 社 = 1 `ORGOS_TENANT` = 1 コンテナ。正本: [managed-single-tenant-runbook.md](../../docs/product/managed-single-tenant-runbook.md)

```bash
export ORGOS_TENANT=acme-corp
export LEDGER_DATA=./data/acme-corp
mkdir -p "$LEDGER_DATA"

docker compose -f docker-compose.ledger.yaml up -d
```

環境変数:

| 変数 | 例 | 説明 |
|------|-----|------|
| `ORGOS_TENANT` | `acme-corp` | テナント ID |
| `LEDGER_DATA` | `./data/acme-corp` | workspace マウント（`tenants/{id}` 相当） |
| `LEDGER_PORT` | `9470` | ホストポート |

本番では `ORGOS_ENV=production` · WebAuthn RP ID · TLS リバースプロキシを設定すること（`docs/operator-production.md`）。
