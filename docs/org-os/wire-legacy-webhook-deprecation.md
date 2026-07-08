# Legacy webhook transport — deprecation

**Status:** deprecated (migration period)  
**Sunset target:** **2026-10-01**  
**Canonical transport:** `wire_v1` (Wire Gateway `POST /wire/v1/events`)

## Background

Peers may still use:

- `inbound_webhook_url` (legacy single URL)
- `inbound_endpoints[].transport: legacy_webhook`

These paths bypass Gateway nonce / timestamp / rate limits (see [wire-gateway-requirements.md](wire-gateway-requirements.md) §14).

## Migration

1. Prefer Wire Gateway URL:

```yaml
inbound_endpoints:
  - url: https://wire.partner.example/wire/v1/events
    mode: push
    transport: wire_v1
    priority: 1
```

2. Or make legacy explicit (still deprecated, for auditability):

```bash
orgos protocol peers migrate-legacy --tenant {id} --dry-run
orgos protocol peers migrate-legacy --tenant {id} --apply
# Promote to wire_v1 when Gateway URL known:
orgos protocol peers migrate-legacy --tenant {id} --apply --to-wire-url https://wire.partner.example/wire/v1/events
```

3. Set `legacy.enabled: false` in tenant `wire-gateway.yaml` (seed default).

4. Production gate:

```bash
ORGOS_STRICT_TRANSPORT=1 orgos protocol validate --tenant {id}
```

Empty / legacy-only peers fail validation under strict mode.

## Runtime behaviour (until sunset)

- Outbound Gateway poller still delivers `legacy_webhook` peers.
- Each legacy send writes audit action `wire.legacy_deprecated` and a one-time stderr warning per process.
- After **2026-10-01**, remove legacy deliver support in a major revision (tracked separately).

## Related

- [wire-gateway-wire-protocol.md](wire-gateway-wire-protocol.md)
- [wire-gateway-requirements.md](wire-gateway-requirements.md) §14 · §21
