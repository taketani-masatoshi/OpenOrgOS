import type { ReturnPackage } from "../../../schemas/etax/return-package.js";
import { etaxError } from "../../../schemas/etax/errors.js";
import { loadProcedureMapping } from "./xml-mapper.js";

/**
 * Official KSK2 XML must come from a registered envelope + field map derived
 * from e-tax10/e-tax11. Wrapping payload fields in a guessed form root is not KSK2 XML.
 */
export function generateOfficialXml(pkg: ReturnPackage): never {
  const mapping = loadProcedureMapping(pkg.procedureCode);
  throw etaxError({
    code: "ETAX_XML_GENERATOR_SPEC_BLOCKED",
    blocked: "SPEC_BLOCKED",
    rule: mapping ? "ksk2-envelope" : "ksk2-field-map",
    message: mapping
      ? `Mapping ${pkg.procedureCode} is present but official instance serialization is not bound to a KSK2 envelope. Refusing to invent XML.`
      : `No KSK2 field mapping for procedure ${pkg.procedureCode}. Unpack e-tax10/e-tax11 and register spec/mappings/${pkg.procedureCode}.yaml. Refusing to invent XML.`,
  });
}
