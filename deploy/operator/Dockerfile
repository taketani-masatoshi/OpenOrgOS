# OrgOS Operator Console — baked image for local Community stack
# Differs from deploy/demo: auth on · tenant mal · workspace mounted (no demo seed).
# Build context: repository root
#   docker build -f deploy/operator/Dockerfile -t orgos-operator-console:local .

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
COPY deploy/operator ./deploy/operator
COPY tenants/_template ./tenants/_template

RUN npm ci
RUN npm run operator-console:build
RUN npm run build:package

# Self-contained prod install outside the monorepo (avoid workspace hoist)
RUN mkdir -p /stage \
  && cp -a /src/packages/orgos-cli/. /stage/ \
  && cd /stage \
  && rm -rf node_modules docs deploy \
  && npm install --omit=dev --ignore-scripts \
  && find . -name '*.map' -delete

FROM node:22-alpine AS runtime
RUN apk add --no-cache ca-certificates \
  && addgroup -g 10001 -S orgos \
  && adduser -u 10001 -S -G orgos -h /home/orgos -s /sbin/nologin orgos

# Development operator — auth on. Do NOT set NODE_ENV=production here
# (prod fail-closed + doctor) unless ORGOS_ENV=production is intentional.
ENV ORGOS_HOME=/opt/orgos \
    ORGOS_WORKSPACE=/workspace \
    ORGOS_TENANT=mal \
    ORGOS_ENV=development \
    OPERATOR_CONSOLE_HOST=0.0.0.0 \
    OPERATOR_CONSOLE_PORT=9470 \
    STEWARD_CHAT_AUTH=1 \
    WIRE_CONSOLE_AUTH=prod \
    WIRE_CONSOLE_PROD_ADAPTER=webauthn \
    ORGOS_SETTLEMENT_STEPUP=1 \
    ORGOS_MCP_AUTH=0 \
    ORGOS_LLM_MOCK=0 \
    ORGOS_CSRF=1 \
    ORGOS_RATE_LIMIT=0

WORKDIR /opt/orgos

COPY --from=build /stage/ /opt/orgos/

# SPA assets (combined-server resolves cwd/apps/... · entrypoint cds to ORGOS_HOME)
COPY --from=build /src/apps/steward-chat/dist /opt/orgos/apps/steward-chat/dist
COPY deploy/operator/entrypoint.sh /usr/local/bin/orgos-operator-entrypoint.sh

RUN chmod +x /usr/local/bin/orgos-operator-entrypoint.sh \
  && mkdir -p /workspace \
  && chown -R orgos:orgos /opt/orgos /workspace

USER orgos
EXPOSE 9470
VOLUME ["/workspace"]
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=12 \
  CMD node -e "fetch('http://127.0.0.1:9470/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/orgos-operator-entrypoint.sh"]
CMD ["orgos", "operator", "console", "start", "--host", "0.0.0.0", "--port", "9470", "--tenant", "mal"]
