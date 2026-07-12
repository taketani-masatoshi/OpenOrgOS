import { existsSync } from "node:fs";
import {
  meshRoutesRegistrySchema,
  type MeshRoutesRegistry,
} from "../../../schemas/protocol/mesh-routes.js";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import { readYamlFile } from "../utils.js";
import { getMeshRoutesYamlPath } from "./paths.js";
import { deliverProtocolEnvelopeWithRelay, type DeliverEnvelopeResult } from "./transport.js";

export function loadMeshRoutesRegistry(): MeshRoutesRegistry {
  const path = getMeshRoutesYamlPath();
  if (!existsSync(path)) {
    return meshRoutesRegistrySchema.parse({ routes: [] });
  }
  return readYamlFile(path, meshRoutesRegistrySchema);
}

export function resolveMeshRoute(destinationPeerId: string): string[] {
  const registry = loadMeshRoutesRegistry();
  const route = registry.routes.find((r) => r.destination_peer_id === destinationPeerId);
  if (!route) {
    return [destinationPeerId];
  }
  if (route.via.length === 0) {
    return [destinationPeerId];
  }
  const chain = [...route.via];
  if (chain[chain.length - 1] !== destinationPeerId) {
    chain.push(destinationPeerId);
  }
  return chain;
}

export async function deliverEnvelopeViaMesh(
  envelope: EventEnvelope,
  destinationPeerId: string
): Promise<DeliverEnvelopeResult & { hops: string[] }> {
  const hops = resolveMeshRoute(destinationPeerId);
  const errors: string[] = [];
  let lastResult: DeliverEnvelopeResult = { delivered: false, reason: "no hops" };

  for (const hopPeerId of hops) {
    lastResult = await deliverProtocolEnvelopeWithRelay(envelope, hopPeerId);
    if (!lastResult.delivered && !lastResult.queued) {
      errors.push(`${hopPeerId}: ${lastResult.reason}`);
    }
  }

  if (errors.length) {
    return {
      delivered: false,
      queued: lastResult.queued,
      reason: errors.join("; "),
      hops,
    };
  }

  return {
    delivered: true,
    queued: lastResult.queued,
    endpoint: lastResult.endpoint,
    reason: lastResult.queued ? `mesh-queued: ${lastResult.reason}` : "mesh-ok",
    hops,
  };
}
