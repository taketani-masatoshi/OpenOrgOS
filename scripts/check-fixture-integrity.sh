#!/usr/bin/env bash
# Fail if a test run mutated committed tenant fixtures.
#
# Run this *after* the test steps. Tests restore fixtures before each test, so
# damage done by the last test in a file used to survive into the worktree — a
# suite that removed a whole tenant directory silently deleted committed files.
# CI never noticed because nothing asserted the tree was unchanged.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

# quotepath=false keeps non-ASCII tenant paths readable, as in check-tenant-tip.sh.
status="$(git -c core.quotepath=false status --porcelain -- tenants/)"

if [[ -z "$status" ]]; then
  echo "✓ committed tenant fixtures unchanged by the test run"
  exit 0
fi

deleted="$(printf '%s\n' "$status" | grep -E '^.D' || true)"
modified="$(printf '%s\n' "$status" | grep -E '^.M' || true)"
untracked="$(printf '%s\n' "$status" | grep -E '^\?\?' || true)"

echo "✗ check-fixture-integrity: the test run changed tracked files under tenants/"
echo

if [[ -n "$deleted" ]]; then
  echo "Deleted committed fixtures ($(printf '%s\n' "$deleted" | wc -l | tr -d ' ')):"
  printf '%s\n' "$deleted" | sed 's/^/  /'
  echo
  echo "  A test removed a directory that also holds committed fixtures. Delete only"
  echo "  generated state — see the tracked-vs-generated rule in"
  echo "  tests/queue-audit-bridge.test.ts."
  echo
fi

if [[ -n "$modified" ]]; then
  echo "Modified committed fixtures ($(printf '%s\n' "$modified" | wc -l | tr -d ' ')):"
  printf '%s\n' "$modified" | sed 's/^/  /'
  echo
  echo "  A test wrote over a committed fixture. Write to a scratch tenant"
  echo "  (tenants/_fixture-*) or restore the file when the test finishes."
  echo
fi

if [[ -n "$untracked" ]]; then
  echo "New files not covered by .gitignore ($(printf '%s\n' "$untracked" | wc -l | tr -d ' ')):"
  printf '%s\n' "$untracked" | sed 's/^/  /'
  echo
  echo "  Generated tenant runtime belongs in .gitignore, or the test should write"
  echo "  to a temporary directory."
  echo
fi

echo "Restore with: git restore tenants/ && git clean -fd tenants/"
exit 1
