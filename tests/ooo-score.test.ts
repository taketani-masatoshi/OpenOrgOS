import { describe, expect, it } from "vitest";
import {
  GUARD_AUTH,
  GUARD_CONTAINMENT,
  GUARD_VALIDATION,
} from "../scripts/ooo-score.js";
import { extractRoutes } from "../scripts/ooo-routes.js";

/**
 * The scorer grades our own work, so its detectors are pinned here. Every time
 * a detector was widened during the 90/99 programmes it was widened because a
 * score came out low — the wrong reason. Widening now costs a fixture: the
 * recorded source below must be updated in the same change as a new POSITIVE
 * case, and the NEGATIVE cases must keep failing to match.
 */
const RECORDED_SOURCES = {
  auth: "require\\w*Permission|require(Ceo|PlatformOperator|SalesPanel|Approver)|isOooLoginEmailAllowed|assert\\w+Policy|(getChatSessionUser|sessionUser|requireWireSession)\\([\\s\\S]{0,240}?\\b401\\b",
  validation:
    "json\\(\\s*(res\\s*,\\s*)?(400|422|405)\\s*,|(InvalidJsonError|ZodError)[\\s\\S]{0,120}?\\b(400|422)\\b",
  containment: "catch\\s*[({]",
};

const AUTH_POSITIVE = [
  'if (!requireChatPermission(user, "chat:approve", res)) return true;',
  "if (!requireBudgetSurfacePermission(user, \"chat:read\", res)) return true;",
  "if (!requireCeo(user, res)) return true;",
  "if (!requirePlatformOperator(user, res)) return true;",
  "if (!requireSalesPanel(user, res)) return true;",
  "if (!requireApprover(user, res)) return true;",
  "if (!isOooLoginEmailAllowed(email, policy)) return refuse();",
  "assertGuestPolicy(operator);",
  // The entrance surfaces have no permission helper: their gate is the session
  // lookup and the 401 that follows it.
  'const user = getChatSessionUser(req);\nif (!user) {\n  json(401, { ok: false, error: "unauthorized" });\n  return true;\n}',
];

const AUTH_NEGATIVE = [
  // A session read with no refusal behind it is not a gate.
  "const user = sessionUser(req);\nreturn json(200, { ok: true, user });",
  "// permission is checked by the caller",
  'if (user.role === "ceo") { }',
  "const permission = permissionsFor(user);",
];

const VALIDATION_POSITIVE = [
  'json(res, 422, { ok: false, error: "approval_id required" });',
  'json(400, { ok: false, error: "bad request" });',
  'json(res, 405, { ok: false, error: "method not allowed" });',
  "} catch (error) {\n  if (error instanceof ZodError) {\n    json(res, 400, { ok: false });",
];

const VALIDATION_NEGATIVE = [
  "json(res, 200, { ok: true });",
  "json(res, 500, { ok: false });",
  "// returns 422 when the body is malformed",
  "const status = 422;",
];

const CONTAINMENT_POSITIVE = [
  // A bare `catch {` contains the error just as well as a bound one.
  "try {\n  parsed = schema.parse(JSON.parse(raw));\n} catch {\n  json(res, 400, {});","try {\n  run();\n} catch (error) {\n  json(res, 500, {});"];
const CONTAINMENT_NEGATIVE = ["const caught = false;", "// catch failures upstream"];

describe("ガード検出器", () => {
  it("記録した検出式から動いていない", () => {
    expect(GUARD_AUTH.source).toBe(RECORDED_SOURCES.auth);
    expect(GUARD_VALIDATION.source).toBe(RECORDED_SOURCES.validation);
    expect(GUARD_CONTAINMENT.source).toBe(RECORDED_SOURCES.containment);
  });

  it.each(AUTH_POSITIVE)("権限ガードとして数える: %s", (sample) => {
    expect(GUARD_AUTH.test(sample)).toBe(true);
  });

  it.each(AUTH_NEGATIVE)("権限ガードとして数えない: %s", (sample) => {
    expect(GUARD_AUTH.test(sample)).toBe(false);
  });

  it.each(VALIDATION_POSITIVE)("入力検証として数える: %s", (sample) => {
    expect(GUARD_VALIDATION.test(sample)).toBe(true);
  });

  it.each(VALIDATION_NEGATIVE)("入力検証として数えない: %s", (sample) => {
    expect(GUARD_VALIDATION.test(sample)).toBe(false);
  });

  it.each(CONTAINMENT_POSITIVE)("例外封じ込めとして数える: %s", (sample) => {
    expect(GUARD_CONTAINMENT.test(sample)).toBe(true);
  });

  it.each(CONTAINMENT_NEGATIVE)("例外封じ込めとして数えない: %s", (sample) => {
    expect(GUARD_CONTAINMENT.test(sample)).toBe(false);
  });
});

describe("経路の静的抽出", () => {
  it("両方の並び順と正規表現経路を読む", () => {
    const routes = extractRoutes(
      "fixture.ts",
      [
        'if (pathname === "/chat/v1/today" && method === "GET") {',
        "  return true;",
        "}",
        'if (method === "POST" && pathname === "/chat/v1/auth/login") {',
        "  return true;",
        "}",
        "const runMatch = pathname.match(/^\\/chat\\/v1\\/commands\\/([^/]+)\\/run$/);",
        'if (runMatch && method === "POST") {',
        "  return true;",
        "}",
      ].join("\n"),
    );
    expect(routes.map((r) => `${r.method} ${r.path}`)).toEqual([
      "GET /chat/v1/today",
      "POST /chat/v1/auth/login",
      "POST /chat/v1/commands/:id/run",
    ]);
  });

  it("二重プレフィックスの注記から両方の経路を出す", () => {
    const routes = extractRoutes(
      "fixture.ts",
      [
        "// @ooo-route-prefix /chat/v1/org/budget,/api/v1/org/budget",
        'if (path === "/expense-claim/approve" && method === "POST") {',
        "  return true;",
        "}",
      ].join("\n"),
    );
    expect(routes.map((r) => r.path)).toEqual([
      "/chat/v1/org/budget/expense-claim/approve",
      "/api/v1/org/budget/expense-claim/approve",
    ]);
  });

  it("経路ブロックは次の宣言の手前で終わる", () => {
    const routes = extractRoutes(
      "fixture.ts",
      [
        'if (pathname === "/a" && method === "GET") {',
        "  return true;",
        "}",
        'if (pathname === "/b" && method === "GET") {',
        "  return true;",
        "}",
      ].join("\n"),
    );
    expect(routes[0].line).toBe(1);
    expect(routes[0].endLine).toBe(4);
  });
});
