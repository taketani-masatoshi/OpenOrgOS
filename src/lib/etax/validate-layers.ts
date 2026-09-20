import type { ReturnPackage } from "../../../schemas/etax/return-package.js";
import type { EtaxValidationReport } from "../../../schemas/etax/validation.js";
import { EtaxException, etaxError } from "../../../schemas/etax/errors.js";
import { assertProcedureAllowed, loadProcedureMatrix } from "./procedures.js";
import { officialXsdAvailable } from "./spec-paths.js";
import { resolveOfficialXsd } from "./spec-fetch.js";
import { loadProcedureMapping } from "./xml-mapper.js";
import {
  assertWellFormedXml,
  rejectUnsafeXml,
  validateXmlAgainstXsd,
  xmlContentHash,
} from "./xml-validate.js";
import { assertContentHash } from "./return-package.js";
import type { EtaxSubmissionRecord } from "./store.js";

export function validateEtaxDocument(opts: {
  xml?: string;
  pkg: ReturnPackage;
  submission?: EtaxSubmissionRecord;
  env?: "mock" | "test" | "production";
}): EtaxValidationReport {
  const layers: EtaxValidationReport["layers"] = [];
  let xmlHash: string | undefined;
  let schemaPath: string | undefined;

  if (!opts.xml) {
    layers.push({
      layer: "structural",
      status: "SPEC_BLOCKED",
      detail: "No official XML to validate (generator remains mapping-blocked)",
    });
  } else {
    try {
      rejectUnsafeXml(opts.xml);
      assertWellFormedXml(opts.xml);
      xmlHash = xmlContentHash(opts.xml);
      const mapping = loadProcedureMapping(opts.pkg.procedureCode);
      if (!officialXsdAvailable()) {
        layers.push({
          layer: "structural",
          status: "SPEC_BLOCKED",
          detail: "Well-formed, but official e-tax19 XSD is not unpacked",
        });
      } else if (!mapping) {
        layers.push({
          layer: "structural",
          status: "SPEC_BLOCKED",
          detail: "Well-formed, but no procedure→XSD mapping is registered",
        });
      } else {
        schemaPath = resolveOfficialXsd(mapping.schemaRelativePath);
        const xsd = validateXmlAgainstXsd(opts.xml, schemaPath);
        layers.push({
          layer: "structural",
          status: xsd.ok ? "pass" : "fail",
          detail: xsd.ok ? `XSD ${mapping.schemaRelativePath}` : xsd.output,
        });
      }
    } catch (error) {
      layers.push({
        layer: "structural",
        status: "fail",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    assertProcedureAllowed(opts.pkg.procedureCode, opts.env ?? "mock", loadProcedureMatrix());
    layers.push({
      layer: "specification",
      status: "SPEC_BLOCKED",
      detail:
        "Procedure is allowed in OpenOrgOS matrix, but e-tax08 inter-form rules are not loaded as data",
    });
  } catch (error) {
    const blocked = error instanceof EtaxException ? error.etax.blocked : undefined;
    layers.push({
      layer: "specification",
      status: blocked === "UNSUPPORTED_PROCEDURE" ? "fail" : "SPEC_BLOCKED",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    assertContentHash(opts.pkg);
    if (opts.submission && opts.submission.contentHash !== opts.pkg.contentHash) {
      throw etaxError({
        code: "ETAX_CONTENT_HASH_MISMATCH",
        blocked: "HASH_MISMATCH",
        message: "Submission contentHash does not match package",
      });
    }
    layers.push({
      layer: "orgos",
      status: "pass",
      detail: "contentHash bound",
    });
  } catch (error) {
    layers.push({
      layer: "orgos",
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const ok = layers.every((row) => row.status === "pass");
  return { ok, layers, xmlHash, schemaPath };
}
