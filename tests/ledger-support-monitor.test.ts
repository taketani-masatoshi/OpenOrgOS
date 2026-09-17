import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import { loadSupportConfig } from "../src/lib/product/ledger-support.js";
import {
  postLedgerAlertWebhook,
  runFleetMonitor,
} from "../src/lib/product/ledger-monitor.js";

describe("ledger support + monitor alerts", () => {
  const prevRoot = process.env.ORGOS_WORKSPACE;
  let workspace: string | undefined;

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    workspace = undefined;
    if (prevRoot === undefined) delete process.env.ORGOS_WORKSPACE;
    else process.env.ORGOS_WORKSPACE = prevRoot;
    refreshOrgOsPaths();
    delete process.env.ORGOS_LEDGER_ALERT_WEBHOOK;
    delete process.env.ORGOS_ALERT_DRY_RUN_POST;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function withSupportYaml(body: string): void {
    workspace = mkdtempSync(join(tmpdir(), "orgos-support-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    mkdirSync(join(workspace, "product-fleet"), { recursive: true });
    writeFileSync(join(workspace, "product-fleet", "support.yaml"), body, "utf-8");
  }

  it("loadSupportConfig accepts empty escalation_webhook", () => {
    withSupportYaml(`version: 1
email: support@example.com
hours: "平日 10:00–18:00 JST"
status_page_url: docs/product/status.md
escalation_webhook: ""
oncall:
  primary: ops-primary
  contact: support@example.com
`);
    const cfg = loadSupportConfig();
    expect(cfg.email).toBe("support@example.com");
    expect(cfg.escalation_webhook).toBeUndefined();
    expect(cfg.status_page_url).toBe("docs/product/status.md");
    expect(cfg.oncall?.primary).toBe("ops-primary");
  });

  it("postLedgerAlertWebhook POSTs JSON payload", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await postLedgerAlertWebhook({
      url: "https://hooks.example/test",
      payload: { ok: false, service: "orgos-ledger-fleet" },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://hooks.example/test");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      ok: false,
      service: "orgos-ledger-fleet",
    });
  });

  it("alert dry-run returns payload without POSTing by default", async () => {
    withSupportYaml(`version: 1
email: support@example.com
escalation_webhook: https://hooks.example/paging
`);
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const snapshot = await runFleetMonitor({ alertDryRun: true });
    expect(snapshot.alert_dry_run?.would_post).toBe(true);
    expect(snapshot.alert_dry_run?.payload).toMatchObject({
      dry_run: true,
      service: "orgos-ledger-fleet",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
