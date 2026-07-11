#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export STEWARD_OPERATOR_AUTH=1
ORGOS=(node --import tsx src/cli.ts --tenant mal --operator-id OP-001)

echo "=== 0. doctor --repair ==="
node --import tsx src/cli.ts --tenant mal doctor --repair 2>&1 | tail -8 || true

if ! node --import tsx -e "
import { setTenantId } from './src/lib/tenant.js';
import { syncOperatorKeyHashesFromLocalFiles } from './src/lib/scheduling-coordination/operational-readiness.js';
import { findOperatorById, verifyOperatorKey } from './src/lib/org/operators.js';
import { readOperatorKeyFromFile } from './src/lib/console-auth/cli-operator.js';
setTenantId('mal');
syncOperatorKeyHashesFromLocalFiles();
const key = readOperatorKeyFromFile('OP-001');
const op = findOperatorById('OP-001');
if (!key || !op || !verifyOperatorKey(op.key_hash, key)) process.exit(1);
"; then
  node --import tsx src/cli.ts --tenant mal operator registry rotate-key --id OP-001
fi
export ORGOS_OPERATOR_KEY="$(< "${HOME}/.orgos/operators/OP-001.key")"

echo "=== 1. scheduling new ==="
NEW_JSON=$("${ORGOS[@]}" executive scheduling new \
  --title "CLIリハーサル2" \
  --participant "テストA|test-a@scheduling.mal|external" \
  --participant "テストB|test-b@scheduling.mal|external" \
  --from 2026-07-15 --to 2026-07-25 --json)
CASE_ID=$(node -e "const j=JSON.parse(process.argv[1]); console.log(j.id)" "$NEW_JSON")
echo "CASE_ID=$CASE_ID"

echo "=== 2. scheduling propose ==="
"${ORGOS[@]}" executive scheduling propose --id "$CASE_ID"

echo "=== 3. scheduling respond ==="
"${ORGOS[@]}" executive scheduling respond --id "$CASE_ID" \
  --email test-a@scheduling.mal --response accept --slot-id SLOT-001
"${ORGOS[@]}" executive scheduling respond --id "$CASE_ID" \
  --email test-b@scheduling.mal --response accept --slot-id SLOT-001

echo "=== 4. CEO question ==="
"${ORGOS[@]}" mail intake ceo list

CEO_ID=$("${ORGOS[@]}" mail intake ceo list --json | node -e "
const rows = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const q = rows.find((r) => r.scheduling_case_id === '$CASE_ID' && r.status === 'pending')
  || rows.find((r) => r.status === 'pending');
if (!q) process.exit(1);
console.log(q.id);
")
echo "CEO_ID=$CEO_ID"

echo "=== 5. CEO answer ==="
"${ORGOS[@]}" mail intake ceo answer --id "$CEO_ID" --operator OP-001 \
  --field schedule_ceo_choice "はい（確定・通知送信）"

echo "=== 6. final status ==="
"${ORGOS[@]}" executive scheduling show --id "$CASE_ID"

echo "=== 7. validate ==="
node --import tsx src/cli.ts --tenant mal validate 2>&1 | tail -8
