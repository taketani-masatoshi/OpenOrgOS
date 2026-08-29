// @catalog-coverage: full
// @catalog-ids: hospitality

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadModuleManifest } from "../src/lib/modules.js";
import { registerModuleCli } from "../src/lib/module-cli.js";
import { Command } from "commander";
import { cleaningAccept, cleaningOrder } from "../steward/modules/hospitality/cli/cleaning.js";
import { damageClaim, damageLog } from "../steward/modules/hospitality/cli/damage.js";
import { computeNightsCap } from "../steward/modules/hospitality/cli/nights-cap.js";
import { appendGuestRegisterRow } from "../steward/modules/hospitality/cli/guest-register.js";
import { listHospitalityOpsDue } from "../steward/modules/hospitality/cli/ops-due.js";
import { upsertStay, loadStays } from "../steward/modules/hospitality/cli/ops-lib.js";
import { recurringComplete, seedDefaultRecurringTasks, saveRecurringTasks } from "../steward/modules/hospitality/cli/recurring.js";
import { listPermitOpeningBlockers } from "../src/lib/permit-opening-gate.js";
import { saveIdDocIndex } from "../steward/modules/hospitality/cli/access-and-docs.js";
import {
  cleanupHospitalityTenant,
  seedGuestRegisterCsv,
  seedHospitalityTenant,
} from "./helpers/hospitality-fixture.js";
import { GUEST_REGISTER_REQUIRED_COLUMNS } from "../schemas/hospitality-guest-register.js";

describe("hospitality module 100 — CLI contract", () => {
  it("manifest cli_commands match registered subcommands", () => {
    const manifest = loadModuleManifest("hospitality");
    expect(manifest?.cli_commands?.length).toBeGreaterThan(30);
    const program = new Command().name("orgos").exitOverride();
    const operations = registerModuleCli(program);
    const hospitality = operations.commands.find((c) => c.name() === "hospitality");
    expect(hospitality).toBeTruthy();
    const registered = new Set(hospitality!.commands.map((c) => c.name()));
    for (const name of manifest!.cli_commands ?? []) {
      if (name === "guest-message") {
        expect(registered.has("guest-message")).toBe(true);
        continue;
      }
      if (name.startsWith("id-docs-")) {
        expect(registered.has(name)).toBe(true);
        continue;
      }
      expect(registered.has(name)).toBe(true);
    }
  });
});

describe("hospitality extended ops", () => {
  const tenantId = `test-hospitality-100-${process.pid}`;
  let root = "";

  beforeEach(() => {
    root = seedHospitalityTenant(tenantId);
    upsertStay({
      id: "STAY-2026-010",
      property_id: "PROP-002",
      check_in: "2026-08-01",
      check_out: "2026-08-03",
      status: "checked_out",
    });
  });

  afterEach(() => {
    cleanupHospitalityTenant(tenantId);
  });

  it("cleaning flow syncs stay cleaning_status", () => {
    cleaningOrder("STAY-2026-010", "CTR-012");
    expect(loadStays().stays.find((s) => s.id === "STAY-2026-010")?.cleaning_status).toBe("ordered");
    cleaningAccept("STAY-2026-010");
    expect(loadStays().stays.find((s) => s.id === "STAY-2026-010")?.cleaning_status).toBe("done");
  });

  it("damage claim transitions", () => {
    const incident = damageLog({
      stayId: "STAY-2026-010",
      itemDescription: "broken lamp",
    });
    const claimed = damageClaim(incident.id, "preparing");
    expect(claimed.claim_status).toBe("preparing");
  });

  it("recurring complete advances next_due", () => {
    seedDefaultRecurringTasks();
    const task = recurringComplete("REC-FIRE-INSPECT", "2026-08-01");
    expect(task.last_completed_on).toBe("2026-08-01");
    expect(task.next_due > "2026-08-01").toBe(true);
  });

  it("ops-due includes cleaning submitted branch", () => {
    cleaningOrder("STAY-2026-010");
    const due = listHospitalityOpsDue("2026-08-24");
    expect(due.some((d) => d.kind === "cleaning")).toBe(true);
  });

  it("ops-due surfaces damage, recurring, and id_doc kinds", () => {
    const incident = damageLog({
      stayId: "STAY-2026-010",
      itemDescription: "scratched floor",
    });
    damageClaim(incident.id, "preparing");

    seedDefaultRecurringTasks();
    saveRecurringTasks({
      version: 1,
      tasks: [
        {
          id: "REC-OVERDUE",
          title: "消防用設備等点検（期限超過）",
          category: "compliance",
          property_id: "PROP-002",
          cadence: "yearly",
          next_due: "2020-01-01",
          cli_hint: "operations hospitality recurring-list",
        },
      ],
    });

    saveIdDocIndex({
      version: 1,
      entries: [
        {
          id: "IDDOC-TEST-001",
          stay_id: "STAY-2026-010",
          doc_type: "passport",
          relative_path: "records/id-docs/test.pdf",
          retained_until: "2020-01-01",
          registered_on: "2020-01-01",
        },
      ],
    });

    const due = listHospitalityOpsDue("2026-08-24");
    expect(due.some((d) => d.kind === "damage")).toBe(true);
    expect(due.some((d) => d.kind === "recurring")).toBe(true);
    expect(due.some((d) => d.kind === "id_doc")).toBe(true);
  });
});

describe("register-append PII guard", () => {
  const tenantId = `test-hospitality-append-${process.pid}`;
  let root = "";

  beforeEach(() => {
    root = seedHospitalityTenant(tenantId);
    upsertStay({
      id: "STAY-2026-011",
      property_id: "PROP-002",
      check_in: "2026-08-10",
      check_out: "2026-08-12",
    });
    seedGuestRegisterCsv(root, {
      year: "2026",
      month: "08",
      header: [...GUEST_REGISTER_REQUIRED_COLUMNS, "stay_id"],
      rows: [],
    });
  });

  afterEach(() => {
    cleanupHospitalityTenant(tenantId);
  });

  it("appends row without returning guest name in result", () => {
    const result = appendGuestRegisterRow({
      stayId: "STAY-2026-011",
      guestName: "Secret Guest Name",
      address: "Tokyo",
      occupation: "Engineer",
      checkInDate: "2026-08-10",
      checkOutDate: "2026-08-12",
    });
    expect(result.rowsAppended).toBe(1);
    const csv = readFileSync(
      join(root, "docs/properties/PROP-002/operations/records/2026/08/宿泊者名簿.csv"),
      "utf-8"
    );
    expect(csv).toContain("Secret Guest Name");
    expect(JSON.stringify(result)).not.toContain("Secret Guest Name");
  });

  it("register-append CLI stdout omits guest name", async () => {
    const program = new Command().name("orgos").exitOverride();
    const operations = registerModuleCli(program);
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
      logs.push(String(msg ?? ""));
    });
    try {
      await operations.parseAsync(
        [
          "hospitality",
          "register-append",
          "--i-understand-pii",
          "--stay-id",
          "STAY-2026-011",
          "--guest-name",
          "Secret Guest Name",
          "--address",
          "Tokyo",
          "--occupation",
          "Engineer",
          "--check-in",
          "2026-08-10",
          "--check-out",
          "2026-08-12",
        ],
        { from: "user" }
      );
    } finally {
      spy.mockRestore();
    }
    expect(logs.join("\n")).toContain("1 行追記");
    expect(logs.join("\n")).not.toContain("Secret Guest Name");
  });
});

describe("nights-cap boundaries", () => {
  const tenantId = `test-hospitality-cap-${process.pid}`;

  beforeEach(() => {
    seedHospitalityTenant(tenantId);
  });

  afterEach(() => {
    cleanupHospitalityTenant(tenantId);
  });

  function seedCapStay(nights: number, id = "STAY-2026-200"): void {
    upsertStay({
      id,
      property_id: "PROP-002",
      check_in: "2026-01-01",
      check_out: "2026-07-01",
      nights,
    });
  }

  it("ryokan permit disables cap", () => {
    seedCapStay(200);
    const cap = computeNightsCap("2026");
    expect(cap.cap_applies).toBe(false);
    expect(cap.permit_kind).toBe("ryokan");
  });
});

describe("nights-cap minpaku tenant", () => {
  const tenantId = `test-hospitality-minpaku-${process.pid}`;
  let root = "";

  beforeEach(() => {
    root = seedHospitalityTenant(tenantId);
    writeFileSync(
      join(root, "data", "permit-registry", "permit-registry.yaml"),
      [
        "as_of: \"2026-08-24\"",
        "permits:",
        "  - id: PER-MIN-001",
        "    permit_type_id: pt-minpaku-notification",
        "    status: active",
        "    property_id: PROP-002",
        "",
      ].join("\n"),
      "utf-8"
    );
  });

  afterEach(() => {
    cleanupHospitalityTenant(tenantId);
  });

  it("warns at 179, warns at 180, blocks at 181 nights", () => {
    upsertStay({
      id: "STAY-2026-179",
      property_id: "PROP-002",
      check_in: "2026-01-01",
      check_out: "2026-07-01",
      nights: 179,
    });
    expect(computeNightsCap("2026").severity).toBe("warn");

    upsertStay({
      id: "STAY-2026-180",
      property_id: "PROP-002",
      check_in: "2026-07-01",
      check_out: "2026-07-02",
      nights: 1,
    });
    const at180 = computeNightsCap("2026");
    expect(at180.occupied_nights).toBe(180);
    expect(at180.severity).toBe("warn");

    upsertStay({
      id: "STAY-2026-181",
      property_id: "PROP-002",
      check_in: "2026-07-02",
      check_out: "2026-08-01",
      nights: 1,
    });
    const over = computeNightsCap("2026");
    expect(over.cap_applies).toBe(true);
    expect(over.occupied_nights).toBeGreaterThan(180);
    expect(over.severity).toBe("over");

    const due = listHospitalityOpsDue("2026-08-24");
    expect(due.some((d) => d.kind === "nights_cap" && d.severity === "p0")).toBe(true);
  });
});

describe("hospitality blockers gate", () => {
  const tenantId = `test-hospitality-blockers-${process.pid}`;

  beforeEach(() => {
    seedHospitalityTenant(tenantId);
  });

  afterEach(() => {
    cleanupHospitalityTenant(tenantId);
  });

  it("does not duplicate fire compliance in permit + registration lists", () => {
    const blockers = listPermitOpeningBlockers({ moduleId: "hospitality" });
    const fireHits = blockers.filter((b) =>
      b.required_any_of.includes("pt-fire-compliance-notice")
    );
    expect(fireHits.length).toBeLessThanOrEqual(1);
    expect(blockers.some((b) => b.fulfilment === "registration")).toBe(true);
  });
});
