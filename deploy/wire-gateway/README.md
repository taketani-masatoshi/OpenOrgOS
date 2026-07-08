# Wire Gateway Docker stack

## Start (HTTP)

```bash
cd deploy/wire-gateway
ORGOS_TENANT=demo WIRE_INTERNAL_BEARER=dev-change-me docker compose up
```

- Public: `http://127.0.0.1:8443/wire/v1/health`
- Internal API is on Docker `wire-internal` network only (not published)

## Start (HTTPS · **dev TLS only**)

```bash
cd deploy/wire-gateway
./scripts/gen-dev-tls.sh --tenant demo
ORGOS_TENANT=demo WIRE_INTERNAL_BEARER=dev-change-me \
  docker compose -f docker-compose.yaml -f docker-compose.tls.yaml up
```

- Public: `https://127.0.0.1:8443/wire/v1/health` (self-signed CA in `tls/`)
- **Never ship `tls/` PEMs to production** — see [production-tls-runbook.md](../../docs/org-os/production-tls-runbook.md)

## Production TLS

Use Mode A (reverse proxy + ACME) or Mode B (`--tls-cert/--tls-key` + secrets). Full runbook: [production-tls-runbook.md](../../docs/org-os/production-tls-runbook.md).

## Notes

- Mounts repo root; uses `npm run orgos -- wire-gateway …`
- Seed config: `config/wire-gateway.yaml` → points gateway at `http://wire-internal-api:8080/internal/v1/wire`
- `legacy.enabled` default **false** (see [wire-legacy-webhook-deprecation.md](../../docs/org-os/wire-legacy-webhook-deprecation.md))

See [wire-gateway-requirements.md](../../docs/org-os/wire-gateway-requirements.md).
