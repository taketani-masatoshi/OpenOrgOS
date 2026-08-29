import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  runSalesInbound,
  runSalesInboundView,
} from "../src/commands/sales.js";
import { runSalesInboundIntake } from "../src/lib/sales-inbound-intake.js";

function captureLog(run: () => void): string {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
    lines.push(String(msg));
  });
  run();
  spy.mockRestore();
  return lines.join("\n");
}

describe("sales inbound CLI", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("runSalesInbound prints markdown summary", () => {
    const out = captureLog(() => runSalesInbound());
    expect(out).toMatch(/インバウンド問合せ/);
    expect(out).toContain("SoT Path");
  });

  it("runSalesInbound supports json output", () => {
    const out = captureLog(() => runSalesInbound({ json: true }));
    const parsed = JSON.parse(out);
    expect(parsed.total_inquiries).toBeGreaterThanOrEqual(0);
    expect(parsed.by_status).toBeDefined();
  });

  it("runSalesInboundView prints canvas summary", () => {
    const out = captureLog(() => runSalesInboundView());
    expect(out).toMatch(/# インバウンド問合せ/);
  });

  it("runSalesInboundView supports json output", () => {
    const out = captureLog(() => runSalesInboundView({ json: true }));
    const parsed = JSON.parse(out);
    expect(parsed.view_id).toBe("inbound");
    expect(parsed.suite).toBe("sales");
  });

  it("runSalesInboundIntake dry-run completes", () => {
    const out = captureLog(() => runSalesInboundIntake({ dryRun: true }));
    expect(out).toMatch(/dry-run|起票予定/);
  });
});
