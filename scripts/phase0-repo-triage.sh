#!/usr/bin/env bash
# Phase 0 repo triage — classify uncommitted paths by bucket.
# Usage: ./scripts/phase0-repo-triage.sh [--json]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

python3 << 'PY'
import subprocess, sys, json
from collections import defaultdict

lines = [l for l in subprocess.check_output(["git", "status", "--porcelain"], text=True).strip().split("\n") if l.strip()]

def classify(path):
    p = path.strip('"')
    if p.startswith("steward/platform/agent/exports/"):
        return "C"
    if any(x in p for x in ["secretary", "correspondence", "mail-send", "mail-setup-readiness", "send-gate", "secretary-contacts", "schemas/executive.ts", "registrars/executive.ts", "tenant-init.ts", "tenant-setup-wizard", "integrity.ts", "peer-contact-policy"]):
        return "B"
    if p.startswith("src/lib/secretary/") or "secretary-contact-registry" in p or "secretary_steward_boundary" in p:
        return "B"
    if p.startswith("steward/core/agents/") or p.startswith("steward/core/skills/"):
        return "B"
    if p.startswith("tests/correspondence") or p.startswith("tests/secretary"):
        return "B"
    if p.startswith("src/lib/correspondence") or p.startswith("src/commands/secretary"):
        return "B"
    if p.startswith("src/cli/registrars/executive"):
        return "B"
    if p.startswith("src/cli/registrars/orchestration") or p.startswith("src/lib/protocol/validate.ts"):
        return "A"
    if any(x in p for x in ["wire-hub", "witness-hub", "wire-gateway", "hub-federation", "registered-orgs", "wire-trust", "mal-wire", "relay-sla", "gov-gateway-live", "wire-gateway-requirements", "wire-hub-stack", "peers.yaml.example"]):
        return "A"
    if p.startswith("deploy/witness-hub") or p.startswith("deploy/mal-pilot"):
        return "A"
    if p.startswith("data/hub-"):
        return "A"
    if p.startswith("scripts/") and any(x in p for x in ["wire", "hub", "mal", "relay", "deploy-city", "prod-validate", "setup-mal", "init-tenant"]):
        return "A"
    if p.startswith("tests/") and any(x in p for x in ["wire", "mal-wire", "relay", "gov-gateway", "outbox-permissions"]):
        return "A"
    if p.startswith("docs/org-os/wire") or p.startswith("docs/org-os/relay") or p.startswith("docs/org-os/gov-gateway") or p.startswith("docs/org-os/c4-community-backlog"):
        return "A"
    if p.startswith("publish/protocol/wire-trust"):
        return "A"
    if p.startswith("publish/protocol/community-"):
        return "GEN"
    if p.startswith("tenants/"):
        return "D"
    if p.startswith("steward/modules/") or (p.startswith("steward/rules/") and "secretary" not in p):
        return "F"
    if p.startswith(".cursor/") or p.startswith("cursor/rules/") or p.startswith("scripts/create-pr") or p.endswith("phase0-repo-triage.sh") or p.endswith("phase0-repo-triage-2026-07-10.md"):
        return "G"
    if p.startswith("package"):
        return "H"
    if p.startswith("src/lib/tenant-scaffold") or p.startswith("scripts/scaffold"):
        return "D"
    if p.startswith("docs/org-os/"):
        return "A"
    return "E"

names = {
    "A": "Wire / Hub stack",
    "B": "Secretary / TI / correspondence",
    "C": "Agent export batch",
    "D": "Tenant seed / data",
    "E": "Unclassified",
    "F": "Steward policy / modules",
    "G": "Cursor mirror (do not commit)",
    "H": "package.json / lock",
    "GEN": "Generated publish/protocol (do not commit)",
}
buckets = defaultdict(list)
for line in lines:
    status = line[:2].strip() or "M"
    path = line[3:].strip()
    buckets[classify(path)].append({"status": status, "path": path})

if "--json" in sys.argv:
    print(json.dumps({"total": len(lines), "buckets": dict(buckets)}, indent=2))
else:
    print(f"Phase 0 triage — {len(lines)} uncommitted paths\n")
    for code in ["A", "B", "C", "D", "E", "F", "G", "H", "GEN"]:
        items = buckets.get(code, [])
        if not items:
            continue
        print(f"{code}: {names[code]} ({len(items)})")
        for i in items[:8]:
            print(f"  {i['status']:2} {i['path']}")
        if len(items) > 8:
            print(f"  ... +{len(items) - 8} more")
        print()
    print("Canonical: docs/org-os/phase0-repo-triage-2026-07-10.md")
PY
