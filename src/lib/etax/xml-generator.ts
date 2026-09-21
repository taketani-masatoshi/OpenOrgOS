import type { ReturnPackage } from "../../../schemas/etax/return-package.js";
import type { EtaxFormMap, EtaxProcedureMapping } from "../../../schemas/etax/mapping.js";
import { ELTAX_PACKAGE_SCHEMA } from "../../../schemas/efiling/filing.js";
import { etaxError } from "../../../schemas/etax/errors.js";
import { gregorianToEtaxYmd } from "./era-date.js";
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
  const payloadRecord = pkg.payload;
  if (
    payloadRecord &&
    typeof payloadRecord === "object" &&
    (payloadRecord as { schema?: string }).schema === ELTAX_PACKAGE_SCHEMA
  ) {
    throw etaxError({
      code: "ETAX_XML_ELTAX_REJECTED",
      blocked: "SPEC_BLOCKED",
      message: "eLTAX package cannot be prepared as official e-Tax XML",
    });
  }
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

  const formMap = (mapping.forms ?? []).find((row) => row.element === form.element);
  const teishutsu = renderTeishutsuDay(payload, formMap);
  const formBody = renderFormElement(form, env, sakuseiDay, formMap, payload);

  // All local names below are taken from official RHO0010 / HOA110 / ITdefinition XSD.
  const optionalItLocals = new Set([
    "NOZEISHA_ZIP",
    "NOZEISHA_TEL",
    "NOZEISHA_NM_KN",
    "DAIHYO_NM",
    "DAIHYO_ADR",
    "KAZEI_KIKAN_FROM",
    "KAZEI_KIKAN_TO",
    "JIGYO_NENDO_FROM",
    "JIGYO_NENDO_TO",
    "KESSAN_DAY",
  ]);
  const optionalItLines: string[] = [];
  for (const field of mapping.fields) {
    if (field.required) continue;
    if (!optionalItLocals.has(field.xmlLocalName)) continue;
    const value = readPayloadPath(payload, field.sourcePath);
    if (typeof value !== "string" || value.trim() === "") continue;
    optionalItLines.push(
      `        <${field.xmlLocalName} ID="o${optionalItLines.length + 1}">${escapeXml(value.trim())}</${field.xmlLocalName}>`
    );
  }

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
    ...(teishutsu ? [teishutsu] : []),
    `        <NOZEISHA_ID ID="n1">${escapeXml(nozeishaId)}</NOZEISHA_ID>`,
    `        <NOZEISHA_NM ID="n2">${escapeXml(nozeishaNm)}</NOZEISHA_NM>`,
    `        <NOZEISHA_ADR ID="n3">${escapeXml(nozeishaAdr)}</NOZEISHA_ADR>`,
    ...optionalItLines,
    `        <TETSUZUKI ID="t1">`,
    `          <procedure_CD>${escapeXml(procedureCd)}</procedure_CD>`,
    `        </TETSUZUKI>`,
    `      </IT>`,
    formBody,
    `    </CONTENTS>`,
    `  </${env.procedureElement}>`,
    `</DATA>`,
    ``,
  ];
  return lines.join("\n");
}

function renderTeishutsuDay(
  payload: unknown,
  formMap: EtaxFormMap | undefined
): string | undefined {
  const field = formMap?.fields.find(
    (row) => row.kind === "idref" && row.idref === "TEISYUTSU_DAY"
  );
  if (!field) return undefined;
  const raw = readPayloadPath(payload, field.sourcePath);
  if (typeof raw !== "string" || raw.trim() === "") {
    if (field.required) {
      throw etaxError({
        code: "ETAX_XML_FIELD_MISSING",
        blocked: "SPEC_BLOCKED",
        field: field.sourcePath,
        message: `Required form field ${field.sourcePath} (${field.xmlLocalName}) is missing or empty`,
      });
    }
    return undefined;
  }
  const ymd = gregorianToEtaxYmd(raw);
  return [
    `        <TEISYUTSU_DAY ID="TEISYUTSU_DAY">`,
    `          <gen:era>${ymd.era}</gen:era>`,
    `          <gen:yy>${ymd.yy}</gen:yy>`,
    `          <gen:mm>${ymd.mm}</gen:mm>`,
    `          <gen:dd>${ymd.dd}</gen:dd>`,
    `        </TEISYUTSU_DAY>`,
  ].join("\n");
}

function renderFormElement(
  form: { element: string; version: string },
  env: { softNM: string; sakuseiNM: string },
  sakuseiDay: string,
  formMap: EtaxFormMap | undefined,
  payload: unknown
): string {
  if (!formMap || formMap.fields.length === 0) {
    throw etaxError({
      code: "ETAX_XML_FORM_BODY_UNREGISTERED",
      blocked: "SPEC_BLOCKED",
      field: form.element,
      message: `Refusing an empty ${form.element} tag. Register form body fields from the official XSD before generating.`,
    });
  }
  for (const field of formMap.fields) {
    if (!field.required) continue;
    const raw = readPayloadPath(payload, field.sourcePath);
    if (typeof raw !== "string" || raw.trim() === "") {
      throw etaxError({
        code: "ETAX_XML_FIELD_MISSING",
        blocked: "SPEC_BLOCKED",
        field: field.sourcePath,
        message: `Required form field ${field.sourcePath} (${field.xmlLocalName}) is missing or empty`,
      });
    }
  }
  const sections = new Map<string, string[]>();
  for (const field of formMap.fields) {
    const [parent, leaf] = field.xmlPath.split(".");
    if (!parent || !leaf) {
      throw etaxError({
        code: "ETAX_XML_FORM_PATH",
        blocked: "SPEC_BLOCKED",
        field: field.xmlPath,
        message: `Form field xmlPath must be parent.leaf, got ${field.xmlPath}`,
      });
    }
    const rows = sections.get(parent) ?? [];
    rows.push(`          <${leaf} IDREF="${escapeXml(field.idref)}"/>`);
    sections.set(parent, rows);
  }
  const body = [...sections.entries()].flatMap(([parent, leaves]) => [
    `        <${parent}>`,
    ...leaves,
    `        </${parent}>`,
  ]);
  return [
    `      <${form.element} VR="${escapeXml(form.version)}" softNM="${escapeXml(env.softNM)}" sakuseiNM="${escapeXml(env.sakuseiNM)}" sakuseiDay="${escapeXml(sakuseiDay)}">`,
    ...body,
    `      </${form.element}>`,
  ].join("\n");
}

/** Fail closed for forms or fields that are not in the registered mapping. */
export function assertRegisteredFormField(
  procedureCode: string,
  formId: string,
  xmlLocalName?: string
): void {
  const mapping = loadProcedureMapping(procedureCode);
  const form = mapping?.forms?.find((row) => row.formId === formId);
  if (!form) {
    throw etaxError({
      code: "ETAX_XML_FORM_UNREGISTERED",
      blocked: "SPEC_BLOCKED",
      field: formId,
      message: `Form ${formId} is not registered for ${procedureCode}. Refusing to invent fields.`,
    });
  }
  if (!xmlLocalName) return;
  const field = form.fields.find((row) => row.xmlLocalName === xmlLocalName);
  if (!field) {
    throw etaxError({
      code: "ETAX_XML_FIELD_UNREGISTERED",
      blocked: "SPEC_BLOCKED",
      field: xmlLocalName,
      message: `Field ${xmlLocalName} is not registered on ${formId}. Refusing to invent a value.`,
    });
  }
}
