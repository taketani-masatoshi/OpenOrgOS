# OrgOS Ledger — コントロールプレーン（P3）

マネージド単一テナント向けの **共有レジストリ**（データプレーンはテナント別のまま）。

## 正本

`product-fleet/control-plane.yaml`

| フィールド | 用途 |
|-----------|------|
| `tenant_id` | テナント ID |
| `host_slug` | サブドメイン（`{slug}.ledger.example`） |
| `plan` / `subscription_status` | 課金スナップショット |
| `accountant_parent_id` | 税理士ハブ（Accountant プラン） |

## テナント解決（HTTP）

優先順:

1. `X-OrgOS-Tenant` ヘッダ
2. ホスト名 `{slug}${ORGOS_LEDGER_HOST_SUFFIX}`（既定 `.ledger.localhost`）
3. `ORGOS_TENANT` 環境変数

## CLI

```bash
orgos ledger product control-plane --sync
orgos ledger product link-accountant --client acme --accountant tax-firm
orgos ledger product ops-dashboard   # ORGOS_LEDGER_OPS=1 または CEO
```

## 関連

- [fleet-operations.md](fleet-operations.md)
- [ADR 0058](../adr/0058-orgos-ledger-product-layer.md)
