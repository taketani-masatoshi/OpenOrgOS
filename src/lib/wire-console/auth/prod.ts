import { timingSafeEqual } from "node:crypto";
import type { WireConsoleUser } from "./session.js";
import { registerSession } from "./session.js";

function prodTokenExpected(): string {
  const token = process.env.WIRE_CONSOLE_PROD_TOKEN;
  if (!token) {
    throw new Error("WIRE_CONSOLE_PROD_TOKEN is required when WIRE_CONSOLE_AUTH=prod");
  }
  return token;
}

export function createProdSession(login: {
  prod_token: string;
  operator_id: string;
  approver_id: string;
}): { token: string; user: WireConsoleUser } | { error: string } {
  let expected: Buffer;
  try {
    expected = Buffer.from(prodTokenExpected(), "utf-8");
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  const got = Buffer.from(login.prod_token, "utf-8");
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    return { error: "invalid prod token" };
  }
  const user: WireConsoleUser = {
    operator_id: login.operator_id,
    approver_id: login.approver_id,
    mode: "prod",
  };
  return registerSession(user);
}
