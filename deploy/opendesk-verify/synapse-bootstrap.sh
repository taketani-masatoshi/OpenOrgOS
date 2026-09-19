#!/bin/sh
# Generate a signing key once, then start Synapse on the mounted Postgres config.
# This script is ours. The Synapse image stays upstream (AGPL) and is not copied in.
set -eu

if [ ! -f /data/localhost.signing.key ]; then
  python -m synapse.app.homeserver \
    --server-name=localhost \
    --config-path=/data/generated.yaml \
    --generate-config \
    --report-stats=no
fi

cp /bootstrap/homeserver.yaml /data/homeserver.yaml
exec python -m synapse.app.homeserver --config-path=/data/homeserver.yaml
