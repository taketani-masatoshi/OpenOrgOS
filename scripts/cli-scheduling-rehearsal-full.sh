#!/usr/bin/env bash
# Full scheduling CLI rehearsal — proposal send → respond → CEO confirm → closed
set -euo pipefail
cd "$(dirname "$0")/.."

MAIL_CFG="tenants/mal/records/executive/mail-config.yaml"
if [ -f "$MAIL_CFG" ]; then
  cp "$MAIL_CFG" "$MAIL_CFG.rehearsal-bak"
  cat > "$MAIL_CFG" <<'EOF'
provider: smtp
from:
  name: MAL
  email: ai@malkk.com
smtp:
  host: smtp.test.local
  port: 587
  secure: false
receive:
  sync: stub
EOF
  trap 'mv -f "$MAIL_CFG.rehearsal-bak" "$MAIL_CFG"' EXIT
fi

node --import tsx src/cli.ts --tenant mal tenant scaffold-data 2>&1 | tail -3

export STEWARD_OPERATOR_AUTH=1
ORGOS=(node --import tsx src/cli.ts --tenant mal --operator-id OP-001)

echo "=== 0. doctor --repair (mail-config · approval registry · operator key sync) ==="
node --import tsx src/cli.ts --tenant mal doctor --repair 2>&1 | tail -15 || true

echo "=== 0b. ensure operator auth ==="
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
  echo "  rotating OP-001 key (registry / ~/.orgos mismatch)"
  node --import tsx src/cli.ts --tenant mal operator registry rotate-key --id OP-001
fi
export ORGOS_OPERATOR_KEY="$(< "${HOME}/.orgos/operators/OP-001.key")"

echo "=== 1. scheduling new ==="
NEW_JSON=$("${ORGOS[@]}" executive scheduling new \
  --title "CLIフルリハーサル" \
  --participant "テストA|test-a@scheduling.mal|external" \
  --participant "テストB|test-b@scheduling.mal|external" \
  --from 2026-07-16 --to 2026-07-28 --json)
CASE_ID=$(node -e "console.log(JSON.parse(process.argv[1]).id)" "$NEW_JSON")
echo "CASE_ID=$CASE_ID"

echo "=== 2. scheduling propose ==="
"${ORGOS[@]}" executive scheduling propose --id "$CASE_ID"

echo "=== 3. proposal approve + send ==="
CASE_JSON=$("${ORGOS[@]}" executive scheduling show --id "$CASE_ID" --json)
node --import tsx -e "
const caseRow = JSON.parse(process.argv[1]);
const drafts = caseRow.correspondence
  .filter((r) => r.kind === 'proposal' && !r.sent_at)
  .map((r) => r.draft_id);
console.log(drafts.join('\n'));
" "$CASE_JSON" | while read -r DRAFT_ID; do
  [ -z "$DRAFT_ID" ] && continue
  DRAFT_JSON=$("${ORGOS[@]}" mail outbound correspondence show "$DRAFT_ID" --json)
  APR_ID=$(node -e "console.log(JSON.parse(process.argv[1]).approval_id)" "$DRAFT_JSON")
  echo "  approve+send $DRAFT_ID ($APR_ID)"
  "${ORGOS[@]}" org approval approve --id "$APR_ID" --approver "段燕燕" --reviewed
  "${ORGOS[@]}" mail outbound correspondence send --id "$DRAFT_ID"
done

echo "=== 4. scheduling respond (accept) ==="
"${ORGOS[@]}" executive scheduling respond --id "$CASE_ID" \
  --email test-a@scheduling.mal --response accept --slot-id SLOT-001
"${ORGOS[@]}" executive scheduling respond --id "$CASE_ID" \
  --email test-b@scheduling.mal --response accept --slot-id SLOT-001

echo "=== 5. CEO answer ==="
CEO_ID=$("${ORGOS[@]}" mail intake ceo list --json | node -e "
const rows = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const q = rows.find((r) => r.scheduling_case_id === '$CASE_ID' && r.status === 'pending');
if (!q) process.exit(1);
console.log(q.id);
")
echo "CEO_ID=$CEO_ID"
"${ORGOS[@]}" mail intake ceo answer --id "$CEO_ID" --operator OP-001 \
  --field schedule_ceo_choice "はい（確定・通知送信）"

echo "=== 6. final status ==="
"${ORGOS[@]}" executive scheduling show --id "$CASE_ID"

echo "=== 7. validate ==="
node --import tsx src/cli.ts --tenant mal validate 2>&1 | tail -5
