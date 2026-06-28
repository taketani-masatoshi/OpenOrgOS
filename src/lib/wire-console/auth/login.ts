import { createDevSession } from "./session.js";
import { createProdSession } from "./prod.js";
import { getWireConsoleAuthConfig, wireConsoleAuthMode } from "./mode.js";

export interface WireConsoleLoginBody {
  passkey?: string;
  prod_token?: string;
  operator_id?: string;
  approver_id?: string;
}

export function authenticateWireConsoleLogin(
  body: WireConsoleLoginBody
): { token: string; user: { operator_id: string; approver_id: string; mode: "dev" | "prod" } } | {
  error: string;
  status: number;
} {
  const mode = wireConsoleAuthMode();

  if (mode === "prod") {
    if (body.passkey) {
      return { error: "dev passkey login disabled in prod mode", status: 403 };
    }
    if (!body.prod_token) {
      return { error: "prod_token required", status: 422 };
    }
    if (!body.operator_id || !body.approver_id) {
      return { error: "operator_id and approver_id required in prod mode", status: 422 };
    }
    const result = createProdSession({
      prod_token: body.prod_token,
      operator_id: body.operator_id,
      approver_id: body.approver_id,
    });
    if ("error" in result) {
      return { error: result.error, status: 401 };
    }
    return result;
  }

  if (!body.passkey) {
    return { error: "passkey required", status: 422 };
  }
  const result = createDevSession({
    passkey: body.passkey,
    operator_id: body.operator_id,
    approver_id: body.approver_id,
  });
  if ("error" in result) {
    return { error: result.error, status: 401 };
  }
  return result;
}

export { getWireConsoleAuthConfig };
