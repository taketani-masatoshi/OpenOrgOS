import { etaxError } from "../../../schemas/etax/errors.js";
import type { ReturnPackage } from "../../../schemas/etax/return-package.js";

/**
 * Official KSK2 XML generation is Phase 2.
 * This function must not invent NTA XML from memory of old schemas.
 */
export function generateOfficialXml(_pkg: ReturnPackage): never {
  throw etaxError({
    code: "ETAX_XML_GENERATOR_SPEC_BLOCKED",
    blocked: "SPEC_BLOCKED",
    rule: "ksk2-xsd",
    message:
      "Official KSK2 XML Schema is not yet registered as unpacked XSD. Refusing to invent e-Tax XML.",
  });
}
