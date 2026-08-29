#!/usr/bin/env bash
# mal: check whether a scheduling accept arrived via IMAP → triage → process-mail
# (not inject). Does not invent accept replies.
#
# Usage:
#   ORGOS_TENANT=mal ./scripts/mal-schedule-imap-accept-check.sh [SCH-YYYY-NNN]
#
# Pass criteria for a case awaiting responses:
# - mail intake sync / ops-poll ran (caller responsibility)
# - participant.response=accept AND responded_mail_id is set
# - responded_mail_id does NOT look like MSG-REH-* / MSG-EML-* inject fixtures
# - optional: eml exists under records/executive/mail-received/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export ORGOS_TENANT="${ORGOS_TENANT:-mal}"
CASE_ID="${1:-}"

echo "== mail receive poll (IMAP) =="
npm run orgos -- --tenant "$ORGOS_TENANT" mail intake sync --json 2>/dev/null | tail -20 || true

echo "== scheduling ops-poll =="
npm run orgos -- --tenant "$ORGOS_TENANT" executive scheduling ops-poll --json 2>/dev/null | tail -40 || true

if [[ -z "$CASE_ID" ]]; then
  echo "Pass SCH case id to inspect accept path, e.g.:"
  echo "  $0 SCH-2026-023"
  exit 0
fi

npm run orgos -- --tenant "$ORGOS_TENANT" executive scheduling show --id "$CASE_ID" --json 2>/dev/null |
  node -e '
let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{
  const j=JSON.parse(s.slice(s.indexOf("{")));
  const parts=(j.participants||[]).map(p=>({
    name:p.name, email:p.email, response:p.response, mail:p.responded_mail_id
  }));
  const injectish = parts.filter(p => p.mail && /MSG-(REH|EML)-/i.test(p.mail));
  const imapish = parts.filter(p => p.response==="accept" && p.mail && !/MSG-(REH|EML)-/i.test(p.mail));
  const out = {
    case_id: j.id,
    status: j.status,
    participants: parts,
    accept_via_likely_imap: imapish.length>0,
    accept_via_inject_fixture: injectish.length>0,
    live_proof: j.quality_signals?.live_proof ?? null,
    advice: imapish.length
      ? "Record: executive scheduling quality proof --partner … --accept-path imap --venue-ref-kind …"
      : injectish.length
        ? "This accept looks like inject/fixture — do not claim IMAP roundtrip"
        : "No accept yet — wait for real reply then re-run"
  };
  console.log(JSON.stringify(out,null,2));
  process.exit(imapish.length || (!injectish.length && parts.every(p=>p.response!=="accept")) ? 0 : 2);
});
'
