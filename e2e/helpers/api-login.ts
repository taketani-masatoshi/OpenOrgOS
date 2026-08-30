import { expect, type APIRequestContext } from "@playwright/test";

/**
 * Log a request context into the chat BFF.
 *
 * Retries once on a connection reset: the server closes idle keep-alive sockets
 * between specs, and Playwright can pick exactly that socket for the first
 * request of the next spec.
 */
export async function loginApi(
  request: APIRequestContext,
  operatorId = "OP-001",
): Promise<void> {
  const send = () =>
    request.post("/chat/v1/auth/login", {
      data: { passkey: "orgos-dev", operator_id: operatorId, approver_id: operatorId },
    });

  let res;
  try {
    res = await send();
  } catch {
    res = await send();
  }
  expect(res.status(), await res.text()).toBe(200);
}
