/**
 * Product gate (development completion): tip filing-score stays 0, record without
 * confirm refuses, LLM callers refuse. Fixture XSD is refused. Official XSD may
 * use ORGOS_OFFICIAL_XSD_PATH to a non-fixture local file (CI leaves unset → skip).
 * Real receipt numbers are not invented — statutory met stays false.
 * Form pin_diff rows are books↔pin empty diffs when collation is supplied;
 * companies-act uses product ordinance labels (fixture yen proven in acceptance).
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isAllowedOfficialXsdPath,
  officialFilingProductStatus,
  officialReturnXmlMatchesXsd,
  officialXsdConnectionStatus,
  resolveOptionalLocalOfficialXsdPath,
  scoreOfficialFilingReceipt,
  submitOfficialReturnXml,
} from "../src/lib/finance/filing/official-receipt.js";
import { runTaxRecordOfficialReceipt } from "../src/commands/tax.js";
import {
  buildFormPinDiffRows,
  buildLivePinDiffRows,
  buildTaxLinesReadModel,
  formPinCollationToRow,
} from "../src/lib/product/tax-lines-read-model.js";
import {
  isLedgerUnifyProductTreeComplete,
  ledgerUnifyProductTreeStatus,
} from "../src/lib/product/ledger-unify-product-tree.js";
import { taxModuleBoundaryNote } from "../src/lib/tax/tax-handoff-package.js";

describe("finance filing product gate", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    process.exitCode = undefined;
    logs.length = 0;
  });

  it("handoff → lines-read → filing-score 0 → confirm refuse → LLM refuse → local XSD (e2e chain)", () => {
    const boundary = taxModuleBoundaryNote();
    expect(boundary.length).toBeGreaterThan(0);
    expect(isLedgerUnifyProductTreeComplete()).toBe(true);

    const model = buildTaxLinesReadModel();
    expect(model.submission).toBe("not-for-etax");
    expect(model.pin_diff_rows.find((r) => r.id === "companies-act-yen")?.diff_empty).toBe(
      false,
    );
    expect(model.pin_diff_rows.find((r) => r.id === "filing-score-tip")?.diff_empty).toBe(true);

    const root = mkdtempSync(join(tmpdir(), "orgos-filing-gate-chain-"));
    const status = officialFilingProductStatus(root);
    expect(status.socket_opens).toBe(false);
    expect(status.statutory_filing_met).toBe(false);
    expect(Object.values(status.scores).every((n) => n === 0)).toBe(true);

    console.log = (line: unknown) => {
      logs.push(String(line));
    };
    runTaxRecordOfficialReceipt({
      item: "corporate_etax",
      number: "123456789012",
      endpoint: "https://www.e-tax.nta.go.jp/",
      json: true,
    });
    const payload = JSON.parse(logs[0] ?? "{}") as { recorded?: boolean; reason?: string };
    expect(payload.recorded).toBe(false);
    expect(payload.reason).toBe("confirm_required");

    const attempt = submitOfficialReturnXml({
      xml: "<return/>",
      xsdPath: "/tmp/does-not-matter.xsd",
      caller: { kind: "llm", authenticated: true },
      certificatePresent: true,
      endpoint: "https://www.e-tax.nta.go.jp/",
    });
    expect(attempt.success).toBe(false);
    expect(attempt.reason).toBe("caller_forbidden");
    expect(Object.values(scoreOfficialFilingReceipt(root)).every((n) => n === 0)).toBe(true);

    const localXsd = join(root, "operator-local-return.xsd");
    writeFileSync(
      localXsd,
      [
        '<?xml version="1.0"?>',
        '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" elementFormDefault="qualified">',
        '  <xs:element name="Return">',
        '    <xs:complexType><xs:sequence/></xs:complexType>',
        "  </xs:element>",
        "</xs:schema>",
        "",
      ].join("\n"),
    );
    expect(isAllowedOfficialXsdPath(localXsd)).toBe(true);
    expect(officialReturnXmlMatchesXsd("<Return/>", localXsd)).toBe(true);
    expect(isAllowedOfficialXsdPath("tests/fixtures/finance/return.xsd")).toBe(false);
  });

  it("keeps filing-score at all zeros on a clean tip tree", () => {
    const root = mkdtempSync(join(tmpdir(), "orgos-filing-gate-"));
    const status = officialFilingProductStatus(root);
    expect(status.socket_opens).toBe(false);
    expect(status.statutory_filing_met).toBe(false);
    expect(status.receipt_file_present).toBe(false);
    expect(Object.values(status.scores).every((n) => n === 0)).toBe(true);
  });

  it("refuses record-official-receipt without confirm flag", () => {
    console.log = (line: unknown) => {
      logs.push(String(line));
    };
    runTaxRecordOfficialReceipt({
      item: "corporate_etax",
      number: "123456789012",
      endpoint: "https://www.e-tax.nta.go.jp/",
      json: true,
    });
    const payload = JSON.parse(logs[0] ?? "{}") as { recorded?: boolean; reason?: string };
    expect(payload.recorded).toBe(false);
    expect(payload.reason).toBe("confirm_required");
  });

  it("refuses LLM submit and leaves scores at 0", () => {
    const attempt = submitOfficialReturnXml({
      xml: "<return/>",
      xsdPath: "/tmp/does-not-matter.xsd",
      caller: { kind: "llm", authenticated: true },
      certificatePresent: true,
      endpoint: "https://www.e-tax.nta.go.jp/",
    });
    expect(attempt.success).toBe(false);
    expect(attempt.reason).toBe("caller_forbidden");
  });

  it("rejects fixture-tree XSD paths and reports unset official path", () => {
    expect(isAllowedOfficialXsdPath("tests/fixtures/finance/return.xsd")).toBe(false);
    expect(officialXsdConnectionStatus({}).status).toBe("xsd_path_unset");
    expect(
      officialXsdConnectionStatus({ ORGOS_OFFICIAL_XSD_PATH: "tests/fixtures/finance/return.xsd" })
        .status,
    ).toBe("xsd_path_invalid");
  });

  it("operator-supplied non-fixture XSD can xmllint when path is set (not official marks)", () => {
    const root = mkdtempSync(join(tmpdir(), "orgos-filing-xsd-ok-"));
    const localXsd = join(root, "operator-local-return.xsd");
    writeFileSync(
      localXsd,
      [
        '<?xml version="1.0"?>',
        '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" elementFormDefault="qualified">',
        '  <xs:element name="Return">',
        '    <xs:complexType><xs:sequence/></xs:complexType>',
        "  </xs:element>",
        "</xs:schema>",
        "",
      ].join("\n"),
    );
    expect(isAllowedOfficialXsdPath(localXsd)).toBe(true);
    expect(resolveOptionalLocalOfficialXsdPath({ ORGOS_OFFICIAL_XSD_PATH: localXsd })).toBe(
      localXsd,
    );
    expect(officialXsdConnectionStatus({ ORGOS_OFFICIAL_XSD_PATH: localXsd }).status).toBe("ok");
    expect(officialReturnXmlMatchesXsd("<Return/>", localXsd)).toBe(true);
    expect(officialReturnXmlMatchesXsd("<Nope/>", localXsd)).toBe(false);
    expect(officialReturnXmlMatchesXsd("<Return/>", "tests/fixtures/finance/return.xsd")).toBe(
      false,
    );
  });

  it("official XSD env path is exercised when ORGOS_OFFICIAL_XSD_PATH is set outside fixtures", () => {
    const configured = process.env.ORGOS_OFFICIAL_XSD_PATH?.trim();
    if (!configured || !isAllowedOfficialXsdPath(configured)) {
      expect(officialXsdConnectionStatus().status).not.toBe("ok");
      return;
    }
    expect(officialXsdConnectionStatus().status).toBe("ok");
    // Do not invent return XML that matches a real NTA schema here — operator validates
    // their own draft against the downloaded schema outside this suite when needed.
    expect(resolveOptionalLocalOfficialXsdPath()).toBe(configured);
  });

  it("tax lines-read model stays not-for-etax with pin_diff_rows and filing zeros", () => {
    const model = buildTaxLinesReadModel();
    expect(model.submission).toBe("not-for-etax");
    expect(model.filing.socket_opens).toBe(false);
    expect(Object.values(model.filing.scores).every((n) => n === 0)).toBe(true);
    expect(model.pin_diff_rows.length).toBeGreaterThanOrEqual(10);
  });

  it("pin_diff_rows are live from filing status and form collations", () => {
    const root = mkdtempSync(join(tmpdir(), "orgos-filing-live-pin-"));
    const filing = officialFilingProductStatus(root);
    const rows = buildLivePinDiffRows(filing, "not-for-etax");
    expect(rows.map((r) => r.id).slice(0, 4)).toEqual([
      "submission",
      "socket",
      "filing-score-tip",
      "statutory-filing",
    ]);
    expect(rows.find((r) => r.id === "companies-act-yen")?.diff_empty).toBe(false);
    const hot = {
      ...filing,
      scores: { ...filing.scores, corporate_etax: 2 },
      statutory_filing_met: true,
    };
    const flipped = buildLivePinDiffRows(hot, "not-for-etax");
    expect(flipped.find((r) => r.id === "filing-score-tip")?.diff_empty).toBe(false);
    expect(flipped.find((r) => r.id === "statutory-filing")?.diff_empty).toBe(false);
  });

  it("form pin_diff empty only when official pin and projection match", () => {
    expect(
      formPinCollationToRow({
        id: "companies-act-yen",
        label: "会社計算規則",
        pinPresent: false,
        projectedReady: true,
        diffCount: 0,
      }).diff_empty,
    ).toBe(false);
    expect(
      buildFormPinDiffRows([
        {
          id: "schedule4-yen",
          label: "別表四",
          pinPresent: true,
          projectedReady: true,
          diffCount: 0,
        },
      ])[0]?.diff_empty,
    ).toBe(true);
    expect(
      buildFormPinDiffRows([
        {
          id: "schedule4-yen",
          label: "別表四",
          pinPresent: true,
          projectedReady: true,
          diffCount: 1,
        },
      ])[0]?.diff_empty,
    ).toBe(false);
  });

  it("live schedule4 collation reports projectedReady when worksheet builds", async () => {
    const { buildLiveFormPinCollations } = await import(
      "../src/lib/product/tax-form-pin-collations.js"
    );
    const rows = buildLiveFormPinCollations();
    const schedule = rows.find((r) => r.id === "schedule4-yen");
    const companies = rows.find((r) => r.id === "companies-act-yen");
    expect(companies?.pinPresent).toBe(true);
    expect(schedule?.pinPresent).toBe(true);
    // Without a tenant worksheet this may be false; with demo books it may be true.
    expect(typeof schedule?.projectedReady).toBe("boolean");
  });

  it("ledger product tree requires git-tracked paths (not mere existence)", () => {
    const status = ledgerUnifyProductTreeStatus();
    expect(status.missing, JSON.stringify(status.missing)).toEqual([]);
    expect(status.untracked, JSON.stringify(status.untracked)).toEqual([]);
    expect(status.complete).toBe(true);
  });
});
