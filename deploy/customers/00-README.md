# Per-customer production env convention
#
# | Path | Tracked? | Purpose |
# |------|----------|---------|
# | `deploy/customers/_template/production.env.example` | yes | Template |
# | `deploy/customers/<customer>/production.env.example` | yes (optional) | Customer-specific non-secret defaults |
# | `deploy/customers/<customer>/production.env` | **no** (gitignore) | Secrets + live tokens |
# | `deploy/customers/<customer>/verify-evidence/` | **no** | Timestamped verify logs |
#
# Verify MCP token + prod auth checklist:
#   ./scripts/prod-auth-verify.sh <customer-id>
#
# SMTP drill (records `customer_id` on `product-fleet/mail-outbox.yaml`):
#   ./scripts/customer-mail-drill.sh <customer-id> ops@customer.example
#
# Operator Console shared example remains at
# `deploy/operator-console/env/production.env.example`.
