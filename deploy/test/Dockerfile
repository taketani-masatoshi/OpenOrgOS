# OrgOS test runner — Vitest (+ optional Playwright smoke via compose profile)
FROM node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY deploy/test/entrypoint.sh /usr/local/bin/orgos-test-entrypoint.sh
RUN chmod +x /usr/local/bin/orgos-test-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/orgos-test-entrypoint.sh"]
CMD ["npm", "test"]
