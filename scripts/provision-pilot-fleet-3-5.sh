#!/usr/bin/env bash
# Provision pilot ledger tenants #3–#5 and link accountant hub (P2 gate: 5 companies)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

./scripts/provision-ledger-tenant.sh pilot-ledger-003 "パイロット第三株式会社" ceo3@pilot.example.com starter
./scripts/provision-ledger-tenant.sh pilot-ledger-004 "パイロット第四株式会社" ceo4@pilot.example.com business
./scripts/provision-ledger-tenant.sh pilot-ledger-005 "パイロット会計法人" tax@pilot.example.com accountant

npm run orgos -- ledger product control-plane --sync
npm run orgos -- ledger product link-accountant --client pilot-ledger-003 --accountant pilot-ledger-005
npm run orgos -- ledger product link-accountant --client pilot-ledger-004 --accountant pilot-ledger-005
npm run orgos -- ledger product fleet-health
npm run orgos -- ledger product readiness
