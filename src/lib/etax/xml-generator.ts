import type { ReturnPackage } from "../../../schemas/etax/return-package.js";
import type { EtaxProcedureMapping } from "../../../schemas/etax/mapping.js";
import { etaxError } from "../../../schemas/etax/errors.js";
import { loadProcedureMapping } from "./xml-mapper.js";

function readPayloadPath(payload: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = payload;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function requireString(payload: unknown, sourcePath: string, label: string): string {
  const value = readPayloadPath(payload, sourcePath);
  if (typeof value !== "string" || value.trim() === "") {
    throw etaxError({
      code: "ETAX_XML_FIELD_MISSING",
      blocked: "SPEC_BLOCKED",
      field: sourcePath,
      message: `Required payload field ${sourcePath} (${label}) is missing or empty`,
    });
  }
  return value.trim();
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function fieldByLocalName(mapping: EtaxProcedureMapping, localName: string): string | undefined {
  return mapping.fields.find((row) => row.xmlLocalName === localName)?.sourcePath;
}

/**
 * Build official KSK2 instance XML from a registered envelope + field map.
 * Element local names must come from the mapping (sourced from e-tax19 / e-tax10).
 * Missing required payload values fail closed — values are never invented.
 */
export function generateOfficialXml(pkg: ReturnPackage): string {
  const mapping = loadProcedureMapping(pkg.procedureCode);
  if (!mapping) {
    throw etaxError({
      code: "ETAX_XML_GENERATOR_SPEC_BLOCKED",
      blocked: "SPEC_BLOCKED",
      rule: "ksk2-field-map",
      message: `No KSK2 field mapping for procedure ${pkg.procedureCode}. Unpack e-tax10/e-tax11 and register spec/mappings/${pkg.procedureCode}.yaml. Refusing to invent XML.`,
    });
  }
  if (!mapping.envelope) {
    throw etaxError({
      code: "ETAX_XML_GENERATOR_SPEC_BLOCKED",
      blocked: "SPEC_BLOCKED",
      rule: "ksk2-envelope",
      message: `Mapping ${pkg.procedureCode} is present but official instance serialization is not bound to a KSK2 envelope. Refusing to invent XML.`,
    });
  }
  return buildDataEnvelopeXml(pkg, mapping);
}

function buildDataEnvelopeXml(pkg: ReturnPackage, mapping: EtaxProcedureMapping): string {
  const env = mapping.envelope!;
  const payload = pkg.payload;

  const zeimushoCdPath = fieldByLocalName(mapping, "zeimusho_CD") ?? "it.zeimushoCd";
  const zeimushoNmPath = fieldByLocalName(mapping, "zeimusho_NM") ?? "it.zeimushoNm";
  const nozeishaIdPath = fieldByLocalName(mapping, "NOZEISHA_ID") ?? "it.nozeishaId";
  const nozeishaNmPath = fieldByLocalName(mapping, "NOZEISHA_NM") ?? "it.nozeishaNm";
  const nozeishaAdrPath = fieldByLocalName(mapping, "NOZEISHA_ADR") ?? "it.nozeishaAdr";
  const procedureCdPath = fieldByLocalName(mapping, "procedure_CD") ?? "it.procedureCd";

  const zeimushoCd = requireString(payload, zeimushoCdPath, "税務署番号");
  const zeimushoNm = requireString(payload, zeimushoNmPath, "税務署名");
  const nozeishaId = requireString(payload, nozeishaIdPath, "利用者識別番号");
  const nozeishaNm = requireString(payload, nozeishaNmPath, "氏名・名称");
  const nozeishaAdr = requireString(payload, nozeishaAdrPath, "納税者所在地");
  const procedureCd = requireString(payload, procedureCdPath, "手続きコード");

  if (procedureCd !== env.procedureElement && procedureCd !== mapping.procedureCode) {
    throw etaxError({
      code: "ETAX_XML_PROCEDURE_MISMATCH",
      blocked: "SPEC_BLOCKED",
      field: procedureCdPath,
      message: `procedure_CD ${procedureCd} does not match mapping procedure ${mapping.procedureCode} / envelope ${env.procedureElement}`,
    });
  }

  let sakuseiDay = new Date().toISOString().slice(0, 10);
  if (env.sakuseiDaySource) {
    sakuseiDay = requireString(payload, env.sakuseiDaySource, "作成日");
  }

  const form = env.requiredForms[0];
  if (!form) {
    throw etaxError({
      code: "ETAX_XML_ENVELOPE_NO_FORM",
      blocked: "SPEC_BLOCKED",
      message: "Envelope requiredForms is empty",
    });
  }

  // All local names below are taken from official RHO0010 / HOA110 / ITdefinition XSD.
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<DATA xmlns="${env.targetNamespace}" xmlns:gen="${env.generalNamespace}" xmlns:rdf="${env.rdfNamespace}" id="data1">`,
    `  <${env.procedureElement} id="proc1" VR="${escapeXml(env.procedureVersion)}">`,
    `    <CATALOG id="cat1">`,
    `      <rdf:Description rdf:about="urn:orgos:etax:${escapeXml(mapping.procedureCode)}"/>`,
    `    </CATALOG>`,
    `    <CONTENTS id="cont1">`,
    `      <IT id="it1" VR="${escapeXml(env.itVersion)}">`,
    `        <ZEIMUSHO ID="z1">`,
    `          <gen:zeimusho_CD>${escapeXml(zeimushoCd)}</gen:zeimusho_CD>`,
    `          <gen:zeimusho_NM>${escapeXml(zeimushoNm)}</gen:zeimusho_NM>`,
    `        </ZEIMUSHO>`,
    `        <NOZEISHA_ID ID="n1">${escapeXml(nozeishaId)}</NOZEISHA_ID>`,
    `        <NOZEISHA_NM ID="n2">${escapeXml(nozeishaNm)}</NOZEISHA_NM>`,
    `        <NOZEISHA_ADR ID="n3">${escapeXml(nozeishaAdr)}</NOZEISHA_ADR>`,
    `        <TETSUZUKI ID="t1">`,
    `          <procedure_CD>${escapeXml(procedureCd)}</procedure_CD>`,
    `        </TETSUZUKI>`,
    `      </IT>`,
    `      <${form.element} VR="${escapeXml(form.version)}" softNM="${escapeXml(env.softNM)}" sakuseiNM="${escapeXml(env.sakuseiNM)}" sakuseiDay="${escapeXml(sakuseiDay)}"/>`,
    `    </CONTENTS>`,
    `  </${env.procedureElement}>`,
    `</DATA>`,
    ``,
  ];
  return lines.join("\n");
}
