import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  attemptOfficialFiling,
  filingCountsAsSuccess,
  isAllowedOfficialXsdPath,
  isCorporateEltaxFilingMet,
  looksLikeOfficialReceiptNumber,
  officialFilingHostKind,
  officialFilingProductStatus,
  OFFICIAL_FILING_POINTS,
  recordOfficialFilingReceipt,
  scoreOfficialFilingReceipt,
  submitOfficialReturnXml,
} from "../src/lib/finance/filing/official-receipt.js";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/finance/official-filing-receipt.yaml",
);

const PRIVATE_KEY = [
  "-----BEGIN PRIVATE KEY-----",
  "FILING-GUARD-TEST-KEY-MATERIAL",
  "-----END PRIVATE KEY-----",
].join("\n");

const ETAX_ENDPOINT = "https://www.e-tax.nta.go.jp/";
const ELTAX_ENDPOINT = "https://www.eltax.lta.go.jp/";

/** Shape-only digit string for disposable gitignored scoring (not a production receipt). */
const SHAPE_DIGITS_ETAX = "1234567890123456";
const SHAPE_DIGITS_ELTAX = "9876543210987654";

let disposableRoot: string | null = null;

afterEach(() => {
  if (disposableRoot) rmSync(disposableRoot, { recursive: true, force: true });
  disposableRoot = null;
});

function initGitignoredReceiptRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "orgos-filing-"));
  disposableRoot = root;
  spawnSync("git", ["init"], { cwd: root, encoding: "utf8" });
  writeFileSync(join(root, ".gitignore"), "/records/\n", "utf8");
  return root;
}

describe("official filing receipt", () => {
  it("scores 0 for every filing item when the gitignored receipt is absent", () => {
    const fixture = readFileSync(FIXTURE, "utf-8");
    expect(fixture).toContain("FIXTURE-NOT-AN-OFFICIAL-RECEIPT");
    const scores = scoreOfficialFilingReceipt();
    expect(scores.corporate_etax).toBe(0);
    expect(scores.corporate_eltax).toBe(0);
    expect(scores.sole_etax).toBe(0);
    expect(scores.sole_eltax).toBe(0);
  });

  it("refuses fixture-shaped receipt strings", () => {
    expect(filingCountsAsSuccess("FIXTURE-NOT-AN-OFFICIAL-RECEIPT")).toBe(false);
    expect(filingCountsAsSuccess("")).toBe(false);
    expect(filingCountsAsSuccess(undefined)).toBe(false);
    expect(looksLikeOfficialReceiptNumber("FIXTURE-NOT-AN-OFFICIAL-RECEIPT")).toBe(false);
    expect(looksLikeOfficialReceiptNumber("12345")).toBe(false);
    expect(isAllowedOfficialXsdPath(undefined)).toBe(false);
    expect(isAllowedOfficialXsdPath(FIXTURE)).toBe(false);
    expect(isAllowedOfficialXsdPath("tests/fixtures/finance/return.xsd")).toBe(false);
    expect(isAllowedOfficialXsdPath("Tests/Fixtures/finance/return.xsd")).toBe(false);
  });

  it("refuses llm submit before xsd and keeps official host only", () => {
    expect(officialFilingHostKind(ETAX_ENDPOINT)).toBe("etax");
    expect(officialFilingHostKind(ELTAX_ENDPOINT)).toBe("eltax");
    for (const endpoint of [ETAX_ENDPOINT, ELTAX_ENDPOINT]) {
      const llm = submitOfficialReturnXml({
        caller: { kind: "llm", authenticated: true },
        certificatePresent: true,
        endpoint,
        xml: "<Return/>",
      });
      expect(llm.reason).toBe("caller_forbidden");
    }
    const badHost = submitOfficialReturnXml({
      caller: { kind: "human", authenticated: true },
      certificatePresent: true,
      endpoint: "https://example.com/",
      xml: "<Return/>",
    });
    expect(badHost.reason).toBe("endpoint_not_official");
  });

  it("refuses to send for an llm or mcp caller on e-Tax and eLTAX", () => {
    for (const endpoint of [ETAX_ENDPOINT, ELTAX_ENDPOINT]) {
      for (const kind of ["llm", "mcp"] as const) {
        const result = attemptOfficialFiling({
          caller: { kind, authenticated: true },
          certificatePresent: true,
          endpoint,
          privateKeyPem: PRIVATE_KEY,
        });
        expect(result.sent).toBe(false);
        expect(result.success).toBe(false);
        expect(result.reason).toBe("caller_forbidden");
      }
      const agent = attemptOfficialFiling({
        caller: { kind: "agent", authenticated: true },
        certificatePresent: true,
        endpoint,
      });
      expect(agent.sent).toBe(false);
      expect(agent.reason).toBe("caller_forbidden");
    }
  });

  it("omits private-key material from the filing result on e-Tax and eLTAX", () => {
    for (const endpoint of [ETAX_ENDPOINT, ELTAX_ENDPOINT]) {
      const logs: string[] = [];
      const result = attemptOfficialFiling(
        {
          caller: { kind: "human", authenticated: true },
          certificatePresent: true,
          endpoint,
          privateKeyPem: PRIVATE_KEY,
        },
        (line) => logs.push(line),
      );
      const blob = `${JSON.stringify(result)}\n${logs.join("\n")}`;
      expect(blob).not.toContain("FILING-GUARD-TEST-KEY-MATERIAL");
      expect(blob).not.toContain("BEGIN PRIVATE KEY");
      expect(result.sent).toBe(false);
      expect(result.success).toBe(false);
      expect(result.reason).toBe("official_receipt_number_required");
      expect(logs.length).toBeGreaterThan(0);
    }
  });

  it("does not open a socket or log the return XML for e-Tax or eLTAX", () => {
    for (const endpoint of [ETAX_ENDPOINT, ELTAX_ENDPOINT]) {
      const logs: string[] = [];
      const marker = "XML-BODY-MUST-NOT-BE-LOGGED";
      const result = submitOfficialReturnXml(
        {
          caller: { kind: "human", authenticated: true },
          certificatePresent: true,
          endpoint,
          privateKeyPem: PRIVATE_KEY,
          xml: `<Return>${marker}</Return>`,
        },
        (line) => logs.push(line),
      );
      const blob = `${JSON.stringify(result)}\n${logs.join("\n")}`;
      expect(blob).not.toContain(marker);
      expect(blob).not.toContain("FILING-GUARD-TEST-KEY-MATERIAL");
      expect(result.sent).toBe(false);
      expect(result.success).toBe(false);
      expect(result.reason).toBe("xsd_invalid");
      expect(logs.some((line) => line.includes("xml_bytes="))).toBe(true);
    }
  });

  it("keeps filing scores at 0 after xsd_invalid refusal", () => {
    const before = scoreOfficialFilingReceipt();
    submitOfficialReturnXml({
      caller: { kind: "human", authenticated: true },
      certificatePresent: true,
      endpoint: ELTAX_ENDPOINT,
      xml: "<Return/>",
    });
    const after = scoreOfficialFilingReceipt();
    expect(after).toEqual(before);
    expect(after.corporate_eltax).toBe(0);
    expect(after.sole_eltax).toBe(0);
    expect(isCorporateEltaxFilingMet()).toBe(false);
  });

  it("refuses non-human record and host mismatch", () => {
    const root = initGitignoredReceiptRoot();
    const llm = recordOfficialFilingReceipt(
      {
        caller: { kind: "llm", authenticated: true },
        item: "corporate_etax",
        officialReceiptNumber: SHAPE_DIGITS_ETAX,
        endpoint: ETAX_ENDPOINT,
      },
      root,
    );
    expect(llm.recorded).toBe(false);
    if (!llm.recorded) expect(llm.reason).toBe("caller_forbidden");

    const mismatch = recordOfficialFilingReceipt(
      {
        caller: { kind: "human", authenticated: true },
        item: "corporate_etax",
        officialReceiptNumber: SHAPE_DIGITS_ETAX,
        endpoint: ELTAX_ENDPOINT,
      },
      root,
    );
    expect(mismatch.recorded).toBe(false);
    if (!mismatch.recorded) expect(mismatch.reason).toBe("host_mismatch");
  });

  it("scores corporate e-Tax 2 and sole e-Tax 4 only from a gitignored digit receipt", () => {
    const root = initGitignoredReceiptRoot();
    expect(scoreOfficialFilingReceipt(root).corporate_etax).toBe(0);
    const logs: string[] = [];
    const recorded = recordOfficialFilingReceipt(
      {
        caller: { kind: "human", authenticated: true },
        item: "corporate_etax",
        officialReceiptNumber: SHAPE_DIGITS_ETAX,
        endpoint: ETAX_ENDPOINT,
      },
      root,
      (line) => logs.push(line),
    );
    expect(recorded).toEqual({ recorded: true, item: "corporate_etax" });
    expect(logs.join("\n")).not.toContain(SHAPE_DIGITS_ETAX);
    recordOfficialFilingReceipt(
      {
        caller: { kind: "human", authenticated: true },
        item: "sole_etax",
        officialReceiptNumber: SHAPE_DIGITS_ETAX,
        endpoint: ETAX_ENDPOINT,
      },
      root,
    );
    const scores = scoreOfficialFilingReceipt(root);
    expect(scores.corporate_etax).toBe(OFFICIAL_FILING_POINTS.corporate_etax);
    expect(scores.sole_etax).toBe(OFFICIAL_FILING_POINTS.sole_etax);
    expect(scores.corporate_eltax).toBe(0);
    expect(scores.sole_eltax).toBe(0);
  });

  it("scores corporate eLTAX 2 and sole eLTAX 4 only from a gitignored digit receipt", () => {
    const root = initGitignoredReceiptRoot();
    recordOfficialFilingReceipt(
      {
        caller: { kind: "human", authenticated: true },
        item: "corporate_eltax",
        officialReceiptNumber: SHAPE_DIGITS_ELTAX,
        endpoint: ELTAX_ENDPOINT,
      },
      root,
    );
    recordOfficialFilingReceipt(
      {
        caller: { kind: "human", authenticated: true },
        item: "sole_eltax",
        officialReceiptNumber: SHAPE_DIGITS_ELTAX,
        endpoint: ELTAX_ENDPOINT,
      },
      root,
    );
    const scores = scoreOfficialFilingReceipt(root);
    expect(scores.corporate_eltax).toBe(OFFICIAL_FILING_POINTS.corporate_eltax);
    expect(scores.sole_eltax).toBe(OFFICIAL_FILING_POINTS.sole_eltax);
    expect(scores.corporate_etax).toBe(0);
    expect(scores.sole_etax).toBe(0);
  });

  it("refuses record when path is not gitignored or number is a decoy", () => {
    const root = mkdtempSync(join(tmpdir(), "orgos-filing-tracked-"));
    disposableRoot = root;
    spawnSync("git", ["init"], { cwd: root, encoding: "utf8" });
    // No .gitignore → path_not_gitignored
    const notIgnored = recordOfficialFilingReceipt(
      {
        caller: { kind: "human", authenticated: true },
        item: "corporate_etax",
        officialReceiptNumber: SHAPE_DIGITS_ETAX,
        endpoint: ETAX_ENDPOINT,
      },
      root,
    );
    expect(notIgnored.recorded).toBe(false);
    if (!notIgnored.recorded) expect(notIgnored.reason).toBe("path_not_gitignored");

    const ignored = initGitignoredReceiptRoot();
    const decoy = recordOfficialFilingReceipt(
      {
        caller: { kind: "human", authenticated: true },
        item: "corporate_etax",
        officialReceiptNumber: "FIXTURE-NOT-AN-OFFICIAL-RECEIPT",
        endpoint: ETAX_ENDPOINT,
      },
      ignored,
    );
    expect(decoy.recorded).toBe(false);
    if (!decoy.recorded) expect(decoy.reason).toBe("receipt_number_invalid");

    const unauth = recordOfficialFilingReceipt(
      {
        caller: { kind: "human", authenticated: false },
        item: "corporate_etax",
        officialReceiptNumber: SHAPE_DIGITS_ETAX,
        endpoint: ETAX_ENDPOINT,
      },
      ignored,
    );
    expect(unauth.recorded).toBe(false);
    if (!unauth.recorded) expect(unauth.reason).toBe("caller_not_authenticated");
  });

  it("keeps product status at zero on the workspace tip without inventing a receipt", () => {
    const status = officialFilingProductStatus();
    expect(status.socket_opens).toBe(false);
    expect(status.scores.corporate_etax).toBe(0);
    expect(status.scores.corporate_eltax).toBe(0);
    expect(status.scores.sole_etax).toBe(0);
    expect(status.scores.sole_eltax).toBe(0);
    expect(status.statutory_filing_met).toBe(false);
    expect(status.note).toContain("disposable");
  });

  it("preserves other items when recording one receipt in a disposable tree", () => {
    const root = initGitignoredReceiptRoot();
    recordOfficialFilingReceipt(
      {
        caller: { kind: "human", authenticated: true },
        item: "corporate_etax",
        officialReceiptNumber: SHAPE_DIGITS_ETAX,
        endpoint: ETAX_ENDPOINT,
      },
      root,
    );
    recordOfficialFilingReceipt(
      {
        caller: { kind: "human", authenticated: true },
        item: "corporate_eltax",
        officialReceiptNumber: SHAPE_DIGITS_ELTAX,
        endpoint: ELTAX_ENDPOINT,
      },
      root,
    );
    const scores = scoreOfficialFilingReceipt(root);
    expect(scores.corporate_etax).toBe(2);
    expect(scores.corporate_eltax).toBe(2);
    expect(scores.sole_etax).toBe(0);
    expect(officialFilingProductStatus(root).statutory_filing_met).toBe(false);
  });
});
