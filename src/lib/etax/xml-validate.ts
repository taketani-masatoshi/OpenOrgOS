import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { etaxError } from "../../../schemas/etax/errors.js";
import { sha256Digest } from "./hash.js";

const DOCTYPE_OR_ENTITY = /<!DOCTYPE/i;
const ENTITY_DECL = /<!ENTITY/i;
const ENCODING_DECL = /encoding\s*=\s*["']([^"']+)["']/i;

export function xmlLintAvailable(): boolean {
  const result = spawnSync("xmllint", ["--version"], { encoding: "utf8" });
  if (result.error) return false;
  return result.status === 0 || (result.stderr?.includes("libxml") ?? false);
}

export function rejectUnsafeXml(xml: string): void {
  if (DOCTYPE_OR_ENTITY.test(xml) || ENTITY_DECL.test(xml)) {
    throw etaxError({
      code: "ETAX_XML_XXE_REJECTED",
      rule: "xxe",
      message: "XML with DOCTYPE or ENTITY is rejected (XXE fail-closed)",
    });
  }
  const decl = xml.match(ENCODING_DECL);
  if (decl && decl[1] && decl[1].toLowerCase().replaceAll("_", "-") !== "utf-8") {
    throw etaxError({
      code: "ETAX_XML_ENCODING_REJECTED",
      rule: "utf-8",
      message: `XML encoding must be UTF-8, got ${decl[1]}`,
    });
  }
}

function withTempXml<T>(xml: string, fn: (xmlPath: string, dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "orgos-etax-xml-"));
  try {
    const xmlPath = join(dir, "instance.xml");
    writeFileSync(xmlPath, xml, "utf-8");
    return fn(xmlPath, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runXmllint(args: string[]): { ok: boolean; output: string } {
  const result = spawnSync("xmllint", args, {
    encoding: "utf8",
    timeout: 20_000,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.error) {
    throw etaxError({
      code: "ETAX_XMLLINT_UNAVAILABLE",
      blocked: "SPEC_BLOCKED",
      message: `xmllint is required for XSD validation: ${result.error.message}`,
    });
  }
  return { ok: result.status === 0, output };
}

export function assertWellFormedXml(xml: string): void {
  rejectUnsafeXml(xml);
  if (!xmlLintAvailable()) {
    throw etaxError({
      code: "ETAX_XMLLINT_UNAVAILABLE",
      blocked: "SPEC_BLOCKED",
      message: "xmllint is not available; refusing to claim well-formedness",
    });
  }
  const { ok, output } = withTempXml(xml, (xmlPath) => runXmllint(["--noout", "--nonet", xmlPath]));
  if (!ok) {
    throw etaxError({
      code: "ETAX_XML_NOT_WELLFORMED",
      message: output || "XML is not well-formed",
    });
  }
}

export function validateXmlAgainstXsd(
  xml: string,
  xsdPath: string
): { ok: true } | { ok: false; output: string } {
  rejectUnsafeXml(xml);
  if (!xmlLintAvailable()) {
    throw etaxError({
      code: "ETAX_XMLLINT_UNAVAILABLE",
      blocked: "SPEC_BLOCKED",
      message: "xmllint is not available; XSD validation is SPEC_BLOCKED",
    });
  }
  return withTempXml(xml, (xmlPath) => {
    const result = runXmllint(["--noout", "--nonet", "--schema", xsdPath, xmlPath]);
    return result.ok ? { ok: true as const } : { ok: false as const, output: result.output };
  });
}

export function xmlContentHash(xml: string | Buffer): `sha256:${string}` {
  return sha256Digest(typeof xml === "string" ? Buffer.from(xml, "utf-8") : xml);
}
