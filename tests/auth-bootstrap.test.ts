import { describe, expect, it } from "vitest";
import {
  AUTH_BOOTSTRAP_TIMEOUT_MS,
  AUTH_LOGIN_FALLBACK_MS,
} from "../apps/shared/auth-bootstrap.js";

describe("auth bootstrap timing", () => {
  it("shows the login form well before a hung session check", () => {
    expect(AUTH_LOGIN_FALLBACK_MS).toBeLessThan(500);
    expect(AUTH_BOOTSTRAP_TIMEOUT_MS).toBeLessThanOrEqual(5_000);
    expect(AUTH_LOGIN_FALLBACK_MS).toBeLessThan(AUTH_BOOTSTRAP_TIMEOUT_MS);
  });
});
