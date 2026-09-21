# OrgOS Ledger — マネージド単一テナント（Docker）

顧客 1 社 = 1 `ORGOS_TENANT` = 1 コンテナ。正本: [managed-single-tenant-runbook.md](../../docs/product/managed-single-tenant-runbook.md)

```bash
cp .env.ledger.example .env.ledger
# LEDGER_DATA = テナントディレクトリ（tenant.yaml がある場所）
export ORGOS_TENANT=acme-corp
export LEDGER_DATA=/absolute/path/to/tenants/acme-corp

docker compose --env-file .env.ledger -f docker-compose.ledger.yaml up -d
```

環境変数:

| 変数 | 例 | 説明 |
|------|-----|------|
| `ORGOS_TENANT` | `acme-corp` | テナント ID |
| `LEDGER_DATA` | `/path/to/tenants/acme-corp` | テナントディレクトリ（`tenant.yaml` 必須）。`/workspace/tenants/$ORGOS_TENANT` にマウント |
| `ORGOS_PUBLIC_BASE_URL` | `https://acme-corp.ledger.example.com` | 案内メール・Passkey 用の公開 HTTPS |
| `ORGOS_LEDGER_HOST_SUFFIX` | `.ledger.example.com` | コントロールプレーンホスト接尾辞 |
| `LEDGER_PORT` | `9470` | ホストポート |

本番では `ORGOS_ENV=production` · WebAuthn RP ID / Origin · TLS リバースプロキシを設定すること（`docs/operator-production.md`）。
