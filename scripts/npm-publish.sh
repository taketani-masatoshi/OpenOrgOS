#!/usr/bin/env bash
# Publish @orgos/cli and @orgos/wire to npm registry.
# Prerequisites: npm login OR export NPM_TOKEN, clean git tag v0.8.0
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! npm whoami >/dev/null 2>&1; then
  echo "✗ npm not authenticated — run: npm login"
  echo "  or export NPM_TOKEN and add to ~/.npmrc:"
  echo "  //registry.npmjs.org/:_authToken=\${NPM_TOKEN}"
  exit 1
fi

npm run version:sync
npm run steward-chat:release-check
npm run package:publish-check

echo "Publishing @orgos/cli and @orgos/wire…"
npm publish -w @orgos/cli --access public
npm publish -w @orgos/wire --access public

echo "Updating Homebrew sha256…"
node scripts/update-homebrew-sha256.mjs

echo "Verify: npm view @orgos/cli version"
npm view @orgos/cli version

echo "✓ Published — push tag to trigger release workflow artifacts:"
echo "  git tag v$(node -p \"require('./package.json').version\") && git push origin v$(node -p \"require('./package.json').version\")"
