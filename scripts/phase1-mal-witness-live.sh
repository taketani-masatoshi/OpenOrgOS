#!/usr/bin/env bash
# Phase 1 — MAL production witness hub live setup (Hub Docker + WTA + org cert)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
TENANT="${1:-mal}"
export ORGOS_TENANT="$TENANT"
COMPOSE="deploy/witness-hub/docker-compose.yaml"

echo "=== Phase 1: Witness Hub Docker (HUB-A then HUB-B) ==="
docker compose -f "$COMPOSE" up -d hub-a
for i in $(seq 1 30); do
  curl -sf http://127.0.0.1:9474/hub/v1/health >/dev/null && break
  sleep 2
done
docker compose -f "$COMPOSE" up -d --force-recreate hub-b
for i in $(seq 1 30); do
  curl -sf http://127.0.0.1:9474/hub/v1/health >/dev/null && \
  curl -sf http://127.0.0.1:9475/hub/v1/health >/dev/null && break
  sleep 2
done
curl -sf http://127.0.0.1:9474/hub/v1/health >/dev/null
curl -sf http://127.0.0.1:9475/hub/v1/health >/dev/null
echo "✓ HUB-A + HUB-B healthy"

echo ""
echo "=== Witness trust authority + hub certification ==="
ORGOS_TENANT="$TENANT" npm run orgos -- protocol witness trust init-authority \
  --tenant "$TENANT" \
  --authority-id WTA-MAL \
  --org-name "MAL Witness Trust Authority" \
  --jurisdiction JP \
  --org-uri "steward://tenant/mal" 2>/dev/null || true

ORGOS_TENANT="$TENANT" npm run orgos -- protocol witness trust certify \
  --tenant "$TENANT" --hub-id HUB-A --hub-url http://127.0.0.1:9474
ORGOS_TENANT="$TENANT" npm run orgos -- protocol witness trust certify \
  --tenant "$TENANT" --hub-id HUB-B --hub-url http://127.0.0.1:9475
ORGOS_TENANT="$TENANT" npm run orgos -- protocol witness trust publish --tenant "$TENANT"
ORGOS_TENANT="$TENANT" npm run orgos -- protocol witness trust verify --tenant "$TENANT" --json

echo ""
echo "=== Organization certificate attestation ==="
ORGOS_TENANT="$TENANT" node --import tsx -e "
import { setTenantId } from './src/lib/tenant.js';
import { exportProtocolPublicKeyBase64 } from './src/lib/protocol/signing.js';
import { readFileSync } from 'node:fs';
import { getWitnessTrustAuthorityKeyPath } from './src/lib/protocol/paths.js';
import {
  organizationCertificateSpkiSha256,
  saveOrganizationCertificateAttestation,
  signOrganizationCertificateAttestation,
  verifyOrganizationCertificateAttestation,
} from './src/lib/protocol/org-cert-witness.js';
import { loadWitnessTrustAuthority } from './src/lib/protocol/witness-trust.js';
import YAML from 'yaml';

setTenantId(process.env.ORGOS_TENANT ?? 'mal');
const gw = YAML.parse(readFileSync('tenants/mal/data/protocol/wire-gateway.yaml', 'utf-8'));
const orgDid = gw.did;
const pub = exportProtocolPublicKeyBase64();
const authority = loadWitnessTrustAuthority();
if (!authority) throw new Error('WTA missing');
const privateKeyPem = readFileSync(getWitnessTrustAuthorityKeyPath(), 'utf-8');
const issued = new Date().toISOString();
const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
const attestation = signOrganizationCertificateAttestation(
  {
    version: '1',
    org_did: orgDid,
    spki_sha256: organizationCertificateSpkiSha256(pub)!,
    authority_id: authority.authority_id,
    issued_at: issued,
    expires_at: expires,
  },
  privateKeyPem
);
saveOrganizationCertificateAttestation(attestation);
const verify = verifyOrganizationCertificateAttestation(attestation);
if (!verify.ok) throw new Error('org cert verify failed: ' + verify.issues.join(', '));
console.log('✓ organization certificate attestation saved and verified');
"

echo ""
echo "=== Witness pool status ==="
ORGOS_TENANT="$TENANT" npm run orgos -- protocol witness pool status --tenant "$TENANT"

echo ""
echo "=== Production gate (config only) ==="
WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY=1 \
  PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://wire.oorgos.org}" \
  ./scripts/prod-validate-wire.sh "$TENANT"

echo ""
echo "✓ Phase 1 complete — Hub stack left running (KEEP_STACK=1)"
echo "  Hub A: http://127.0.0.1:9474"
echo "  Hub B: http://127.0.0.1:9475"
