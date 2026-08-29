#!/usr/bin/env bash
# Backup all OrgOS Ledger product tenants (P2 — RPO 24h target)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_ROOT="${LEDGER_BACKUP_DIR:-$ROOT/backups/ledger-fleet}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_ROOT/$STAMP"
mkdir -p "$DEST"

cd "$ROOT"

mapfile -t TENANTS < <(
  npm run orgos -- ledger product fleet-status --product-only 2>/dev/null \
    | node -e "
const chunks = [];
process.stdin.on('data', (d) => chunks.push(d));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString());
    for (const row of data.tenants ?? []) console.log(row.tenant_id);
  } catch { process.exit(1); }
});
" || true
)

if [[ ${#TENANTS[@]} -eq 0 ]]; then
  echo "No ledger product tenants found." >&2
  exit 1
fi

for id in "${TENANTS[@]}"; do
  echo "Backing up $id ..."
  npm run orgos -- ledger product export --tenant-id "$id" --output "$DEST/${id}.tar.gz"
done

cat > "$DEST/manifest.json" <<EOF
{
  "backed_up_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "tenant_count": ${#TENANTS[@]},
  "tenants": $(printf '%s\n' "${TENANTS[@]}" | jq -R . | jq -s .)
}
EOF

echo "✓ Fleet backup → $DEST (${#TENANTS[@]} tenants)"
