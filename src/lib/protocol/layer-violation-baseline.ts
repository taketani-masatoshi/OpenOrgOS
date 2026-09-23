/**
 * Known upward-layer edges during staged migration.
 * Shrink this list as cycles / layer violations are resolved — never grow it.
 */
export const PROTOCOL_LAYER_VIOLATION_BASELINE: readonly string[] = [
  "src/lib/protocol/adapters/community-export.ts (adapters) -> src/lib/protocol/readiness/community-readiness.ts (readiness)",
  "src/lib/protocol/adapters/community-export.ts (adapters) -> src/lib/protocol/readiness/eco-production-evidence.ts (readiness)",
  "src/lib/protocol/adapters/community-integration-flags.ts (adapters) -> src/lib/protocol/readiness/eco-production-evidence.ts (readiness)",
  "src/lib/protocol/core/inbound-verify.ts (core) -> src/lib/protocol/transport/peers.ts (transport)",
  "src/lib/protocol/core/record-transaction.ts (core) -> src/lib/protocol/distribution/registry.ts (distribution)",
  "src/lib/protocol/core/record-transaction.ts (core) -> src/lib/protocol/transport/peer-protocol-policy.ts (transport)",
  "src/lib/protocol/core/record-transaction.ts (core) -> src/lib/protocol/transport/peers.ts (transport)",
  "src/lib/protocol/core/validate.ts (core) -> src/lib/protocol/distribution/registry.ts (distribution)",
  "src/lib/protocol/core/validate.ts (core) -> src/lib/protocol/distribution/trusted-hubs.ts (distribution)",
  "src/lib/protocol/core/validate.ts (core) -> src/lib/protocol/distribution/witness-client.ts (distribution)",
  "src/lib/protocol/core/validate.ts (core) -> src/lib/protocol/distribution/witness-policy.ts (distribution)",
  "src/lib/protocol/core/validate.ts (core) -> src/lib/protocol/distribution/witness-pool.ts (distribution)",
  "src/lib/protocol/core/validate.ts (core) -> src/lib/protocol/distribution/witness-queue.ts (distribution)",
  "src/lib/protocol/core/validate.ts (core) -> src/lib/protocol/transport/peers.ts (transport)",
  "src/lib/protocol/core/wire-counterparty.ts (core) -> src/lib/protocol/distribution/wire-trust-registry.ts (distribution)",
  "src/lib/protocol/core/wire-counterparty.ts (core) -> src/lib/protocol/transport/peers.ts (transport)",
  "src/lib/protocol/transport/peer-discovery.ts (transport) -> src/lib/protocol/distribution/trusted-hubs.ts (distribution)",
  "src/lib/protocol/transport/peer-protocol-policy.ts (transport) -> src/lib/protocol/distribution/registry.ts (distribution)",
  "src/lib/protocol/transport/protocol-api-server.ts (transport) -> src/lib/protocol/distribution/reconcile-alerts-store.ts (distribution)",
  "src/lib/protocol/transport/protocol-api-server.ts (transport) -> src/lib/protocol/distribution/wire-relay-store.ts (distribution)",
  "src/lib/protocol/transport/protocol-api-server.ts (transport) -> src/lib/protocol/distribution/witness-queue.ts (distribution)",
] as const;
