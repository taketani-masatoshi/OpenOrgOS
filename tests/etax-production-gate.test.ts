import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { EtaxSubmissionStore, etaxProductionReadiness, sendEtaxSubmission } from "../src/lib/finance/etax.js";
import type { EtaxSpecCatalog } from "../schemas/finance/etax.js";

describe("e-Tax production gate", () => {
  it("stays closed without official certification evidence", async () => {
    const catalog: EtaxSpecCatalog = {
      schema: "orgos.jp.etax-spec-catalog.v1",
      updated_at: "2026-09-21T00:00:00.000Z",
      entries: [],
    };
    const readiness = etaxProductionReadiness({
      catalog,
      xsdSha256: "a".repeat(64),
      mappingSha256: "b".repeat(64),
      certificationEvidenceSha256: "c".repeat(64),
    });
    expect(readiness.productionReady).toBe(false);
    expect(readiness.items.length).toBeGreaterThan(0);
    expect(readiness.items.every((item) => item.ready === false)).toBe(true);
    expect(readiness.items.map((item) => item.reason).join(" ")).toContain("接続試験証跡がない");

    const root = mkdtempSync(join(tmpdir(), "orgos-etax-prod-"));
    writeFileSync(join(root, "marker"), "encrypted-volume");
    const store = new EtaxSubmissionStore(join(root, "state"), 10, { production: true, encryptedStorage: true });
    await expect(sendEtaxSubmission({
      store, submissionId: "ETAX-not-sent",
      transport: { name: "fixture", certified: true, async send() { return { requestId: "never" }; } },
    })).rejects.toThrow("production e-Tax send is not enabled");
    expect(() => new EtaxSubmissionStore(join(root, "plain"), 10, { production: true, encryptedStorage: false }))
      .toThrow("requires encrypted storage");
  });
});
