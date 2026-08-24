# OrgOS Demo All-in-one
# Design: docs/org-os/demo-docker.md
# Build context: repository root
#   docker compose -f deploy/demo/docker-compose.yaml build
#
# Phase 4: alpine runtime · prune docs/deploy · multi-arch via CI

# syntax=docker/dockerfile:1

FROM node:22-bookworm AS build
WORKDIR /src

COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY src ./src
COPY schemas ./schemas
COPY steward ./steward
COPY tsconfig.json tsconfig.build.json ./
COPY deploy/demo ./deploy/demo
COPY tenants/_template ./tenants/_template
COPY tenants/demo ./tenants/demo

RUN npm ci
RUN bash deploy/demo/prepare-seed.sh
RUN npm run operator-console:build
RUN npm run build:package

# Self-contained prod install outside the monorepo (avoid workspace hoist)
RUN mkdir -p /stage \
  && cp -a /src/packages/orgos-cli/. /stage/ \
  && cd /stage \
  && rm -rf node_modules docs deploy \
  && npm install --omit=dev --ignore-scripts \
  && find . -name '*.map' -delete \
  && node --input-type=module -e "await import('/stage/dist/src/lib/operator-console/combined-server.js')"

FROM node:22-alpine AS runtime
RUN apk add --no-cache ca-certificates \
  && addgroup -g 10001 -S orgos \
  && adduser -u 10001 -S -G orgos -h /home/orgos -s /sbin/nologin orgos

# ORGOS_ENV=demo — do NOT set NODE_ENV=production (triggers prod auth fail-closed)
ENV ORGOS_HOME=/opt/orgos \
    ORGOS_WORKSPACE=/workspace \
    ORGOS_TENANT=demo \
    ORGOS_ENV=demo \
    OPERATOR_CONSOLE_HOST=0.0.0.0 \
    OPERATOR_CONSOLE_PORT=9470 \
    STEWARD_CHAT_AUTH=0 \
    WIRE_CONSOLE_AUTH=dev \
    ORGOS_MCP_AUTH=0 \
    ORGOS_LLM_MOCK=1 \
    ORGOS_CSRF=0 \
    ORGOS_RATE_LIMIT=0

WORKDIR /opt/orgos

COPY --from=build /stage/ /opt/orgos/

# SPA assets (combined-server resolves cwd/apps/... · entrypoint cds to ORGOS_HOME)
COPY --from=build /src/apps/wire-console/dist-combined /opt/orgos/apps/wire-console/dist-combined
COPY --from=build /src/apps/steward-chat/dist /opt/orgos/apps/steward-chat/dist
COPY --from=build /src/deploy/demo/seed /opt/orgos/seed
COPY deploy/demo/entrypoint.sh /usr/local/bin/orgos-demo-entrypoint.sh

RUN chmod +x /usr/local/bin/orgos-demo-entrypoint.sh \
  && mkdir -p /workspace \
  && chown -R orgos:orgos /opt/orgos /workspace

USER orgos
EXPOSE 9470
VOLUME ["/workspace"]
# No curl — Node 22 built-in fetch (Phase 4 size reduction)
HEALTHCHECK --interval=10s --timeout=5s --start-period=120s --retries=12 \
  CMD node -e "fetch('http://127.0.0.1:9470/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/orgos-demo-entrypoint.sh"]
CMD ["orgos", "operator", "console", "start", "--host", "0.0.0.0", "--port", "9470", "--tenant", "demo"]
