import type { IncomingMessage } from "node:http";
import {
  submitWireNodeGovernanceRequest,
  decideWireNodeGovernanceRequest,
  listPendingWireNodeRequests,
  loadWireNodeGovernanceRegistry,
} from "./wire-node-governance.js";

export interface CommunityWireNodeSubmitBody {
  tenant_id: string;
  wire_email?: string;
  corporate_number?: string;
  requested_by?: string;
  wire_url?: string;
}

export interface CommunityWireNodeDecideBody {
  request_id: string;
  approve: boolean;
  decided_by: string;
  note?: string;
}

function parseJsonBody<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

export function verifyCommunityGovernanceAuth(req: IncomingMessage): boolean {
  const token = process.env.ORGOS_COMMUNITY_GOVERNANCE_TOKEN?.trim();
  if (!token) {
    return process.env.NODE_ENV !== "production" && process.env.ORGOS_STRICT_TRUST !== "1";
  }
  const auth = req.headers.authorization?.trim();
  return auth === `Bearer ${token}`;
}

export function handleCommunityWireNodePending(): { ok: boolean; pending: unknown[] } {
  return { ok: true, pending: listPendingWireNodeRequests() };
}

export function handleCommunityWireNodeSubmit(body: CommunityWireNodeSubmitBody): {
  ok: boolean;
  request?: unknown;
  error?: string;
} {
  try {
    const request = submitWireNodeGovernanceRequest({
      tenantId: body.tenant_id,
      wireEmail: body.wire_email,
      corporateNumber: body.corporate_number,
      requestedBy: body.requested_by,
      wireUrl: body.wire_url,
    });
    return { ok: true, request };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function handleCommunityWireNodeDecide(
  body: CommunityWireNodeDecideBody,
  authorized: boolean
): { ok: boolean; request?: unknown; node?: unknown; error?: string; status?: number } {
  if (!authorized) {
    return { ok: false, error: "unauthorized — ORGOS_COMMUNITY_GOVERNANCE_TOKEN required", status: 401 };
  }
  try {
    const { request, node } = decideWireNodeGovernanceRequest({
      requestId: body.request_id,
      approve: body.approve,
      decidedBy: body.decided_by,
      note: body.note,
    });
    return { ok: true, request, node };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), status: 422 };
  }
}

export function communityWireNodeApiCatalog(): {
  version: string;
  base_path: string;
  routes: Array<{ method: string; path: string; auth?: string; description: string }>;
} {
  return {
    version: "1",
    base_path: "/protocol/v1/community/wire-node",
    routes: [
      {
        method: "GET",
        path: "/protocol/v1/community/wire-node/pending",
        description: "List pending wire node governance requests",
      },
      {
        method: "POST",
        path: "/protocol/v1/community/wire-node/submit",
        description: "Submit wire node registration (pk-DID · duplicate checks)",
      },
      {
        method: "POST",
        path: "/protocol/v1/community/wire-node/decide",
        auth: "Bearer ORGOS_COMMUNITY_GOVERNANCE_TOKEN",
        description: "Committee approve/reject pending request",
      },
    ],
  };
}

export async function handleCommunityWireNodeApiRoute(
  method: string,
  pathname: string,
  rawBody: string,
  req: IncomingMessage
): Promise<{ status: number; body: unknown } | null> {
  if (pathname === "/protocol/v1/community/wire-node/pending" && method === "GET") {
    return { status: 200, body: handleCommunityWireNodePending() };
  }

  if (pathname === "/protocol/v1/community/wire-node/submit" && method === "POST") {
    try {
      const data = parseJsonBody<CommunityWireNodeSubmitBody>(rawBody);
      if (!data.tenant_id?.trim()) {
        return { status: 422, body: { ok: false, error: "tenant_id required" } };
      }
      const result = handleCommunityWireNodeSubmit(data);
      return { status: result.ok ? 201 : 422, body: result };
    } catch (e) {
      return {
        status: 400,
        body: { ok: false, error: e instanceof Error ? e.message : String(e) },
      };
    }
  }

  if (pathname === "/protocol/v1/community/wire-node/decide" && method === "POST") {
    try {
      const data = parseJsonBody<CommunityWireNodeDecideBody>(rawBody);
      if (!data.request_id || !data.decided_by) {
        return { status: 422, body: { ok: false, error: "request_id and decided_by required" } };
      }
      const result = handleCommunityWireNodeDecide(data, verifyCommunityGovernanceAuth(req));
      return {
        status: result.status ?? (result.ok ? 200 : 422),
        body: result,
      };
    } catch (e) {
      return {
        status: 400,
        body: { ok: false, error: e instanceof Error ? e.message : String(e) },
      };
    }
  }

  if (pathname === "/protocol/v1/community/wire-node" && method === "GET") {
    return { status: 200, body: communityWireNodeApiCatalog() };
  }

  return null;
}

export { loadWireNodeGovernanceRegistry };
