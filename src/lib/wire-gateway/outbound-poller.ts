import type { WireGatewayConfig } from "../../../schemas/protocol/wire-gateway-config.js";
import { WireInternalClient } from "./internal-client.js";
import { envelopeToWireMessage } from "./codec.js";
import { appendWireGatewayAudit } from "./audit.js";
import { strictPkDidError } from "./security.js";

export interface OutboundPollerHandle {
  start(): void;
  stop(): void;
  /** Test / manual trigger — one poll cycle. */
  pollOnce(): Promise<void>;
}

export function createOutboundPoller(
  config: WireGatewayConfig,
  client: WireInternalClient
): OutboundPollerHandle {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;
  let legacyWarned = false;

  async function pollOnce(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const [pending, peers] = await Promise.all([client.listOutbox(), client.getPeers()]);

      function findPeerForReceiver(receiverId: string) {
        return peers.find(
          (p) =>
            p.peer_node_id === receiverId ||
            p.peer_id === receiverId ||
            p.peer_node_uri === receiverId ||
            p.peer_node_uri === `steward://tenant/${receiverId}` ||
            p.peer_node_uri?.endsWith(`/${receiverId}`)
        );
      }

      for (const item of pending) {
        const peer = findPeerForReceiver(item.receiver_node_id);
        if (!peer || !peer.wire_endpoint) continue;
        if (peer.transport !== "wire_v1" && peer.transport !== "legacy_webhook") continue;

        let envelope;
        try {
          envelope = await client.getOutboxEnvelope(item.event_id);
        } catch {
          continue;
        }

        const deliveredAt = new Date().toISOString();
        let httpStatus = 0;
        let delivered = false;
        let detail = "";
        let wireHash: string | undefined;

        try {
          let body: string;
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "User-Agent": "Steward-OS/0.8",
          };
          if (peer.transport === "wire_v1") {
            const wire = envelopeToWireMessage(envelope);
            const trustError =
              strictPkDidError(wire.sender, "sender") ??
              strictPkDidError(wire.receiver, "receiver");
            if (trustError) throw new Error(trustError);
            wireHash = wire.hash;
            body = JSON.stringify(wire);
            headers["X-OpenOrgOS-Wire-Version"] = "0.1";
          } else {
            if (!legacyWarned) {
              console.warn(
                `[wire-gateway] legacy_webhook delivery to ${peer.peer_node_id} is deprecated (sunset 2026-10-01)`
              );
              legacyWarned = true;
            }
            appendWireGatewayAudit(config.audit.path, {
              recorded_at: new Date().toISOString(),
              action: "wire.legacy_deprecated",
              event_id: item.event_id,
              sender: config.node_id,
              receiver: item.receiver_node_id,
              peer_node_id: peer.peer_node_id,
              reason: "legacy_webhook transport; migrate to wire_v1",
              gateway_id: config.node_id,
            });
            const { serializeEventEnvelope } = await import("../protocol/envelope.js");
            body = serializeEventEnvelope(envelope);
            headers["X-Steward-Format"] = "envelope";
          }
          const res = await fetch(peer.wire_endpoint, {
            method: "POST",
            headers,
            body,
          });
          httpStatus = res.status;
          delivered = res.status === 202 || res.status === 409 || res.ok;
          if (!delivered) {
            const errBody = (await res.json().catch(() => ({}))) as { error?: string };
            detail = errBody.error ?? `http ${res.status}`;
          }
        } catch (e) {
          detail = e instanceof Error ? e.message : String(e);
        }

        appendWireGatewayAudit(config.audit.path, {
          recorded_at: deliveredAt,
          action: delivered ? "wire.send" : "wire.reject",
          event_id: item.event_id,
          sender: config.node_id,
          receiver: item.receiver_node_id,
          peer_node_id: peer.peer_node_id,
          hash: wireHash,
          http_status: httpStatus || undefined,
          reason: delivered ? undefined : detail,
          gateway_id: config.node_id,
        });

        await client.reportDelivered(item.event_id, {
          event_id: item.event_id,
          delivered,
          peer_node_id: peer.peer_id ?? peer.peer_node_id,
          http_status: httpStatus || undefined,
          detail: detail || undefined,
          delivered_at: deliveredAt,
        });
      }
    } catch (e) {
      appendWireGatewayAudit(config.audit.path, {
        recorded_at: new Date().toISOString(),
        action: "internal.api_error",
        reason: e instanceof Error ? e.message : String(e),
        gateway_id: config.node_id,
      });
    } finally {
      running = false;
    }
  }

  return {
    start() {
      if (timer) return;
      void pollOnce();
      timer = setInterval(() => void pollOnce(), config.outbound.poll_interval_ms);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
    pollOnce,
  };
}
