import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { etaxCertifiedProductAdapter, type EtaxReceipt, type EtaxSigner, type EtaxTransport, type EtaxXsdValidator } from "./etax.js";

const execFileAsync = promisify(execFile);
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

export type CertifiedCommand = {
  executable: string;
  executableSha256: string;
  certificationEvidencePath: string;
  certificationEvidenceSha256: string;
};

function assertCertifiedCommand(command: CertifiedCommand): void {
  if (!isAbsolute(command.executable) || command.executable.includes("\0") || !existsSync(command.executable)) {
    throw new Error("certified adapter executable must be an existing absolute path");
  }
  if (sha256(readFileSync(command.executable)) !== command.executableSha256) throw new Error("certified adapter executable hash mismatch");
  if (!isAbsolute(command.certificationEvidencePath) || !existsSync(command.certificationEvidencePath) ||
      sha256(readFileSync(command.certificationEvidencePath)) !== command.certificationEvidenceSha256) {
    throw new Error("adapter certification evidence missing or hash mismatch");
  }
}

const blockedChildEnv = /^(PATH|LD_PRELOAD|LD_LIBRARY_PATH|DYLD_.*|NODE_OPTIONS|NODE_DEBUG)$/i;
const secretChildEnv = /PIN|PASSWORD|SECRET|TOKEN|PRIVATE/i;

export function buildEtaxChildEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  for (const key of Object.keys(extra)) {
    if (secretChildEnv.test(key)) throw new Error("e-Tax child environment contains a forbidden secret variable name");
  }
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? "" };
  for (const [key, value] of Object.entries(extra)) {
    if (blockedChildEnv.test(key)) continue;
    env[key] = value;
  }
  return env;
}

function assertSafeToolPath(path: string, label: string): void {
  if (!path || path.includes("\0") || path.startsWith("-")) throw new Error(`unsafe e-Tax ${label} path`);
}

export function commandEtaxXsdValidator(command: CertifiedCommand): EtaxXsdValidator {
  assertCertifiedCommand(command);
  const validate: EtaxXsdValidator = ({ xmlPath, xsdPath }) => {
    assertCertifiedCommand(command);
    assertSafeToolPath(xmlPath, "XML");
    assertSafeToolPath(xsdPath, "XSD");
    try {
      execFileSync(command.executable, ["--noout", "--schema", xsdPath, xmlPath], {
        stdio: "pipe", timeout: 60_000, env: buildEtaxChildEnv({}),
      });
      return { valid: true, validatorName: basename(command.executable), validatorVersion: command.executableSha256.slice(0, 16) };
    } catch (error) {
      return { valid: false, validatorName: basename(command.executable), validatorVersion: command.executableSha256.slice(0, 16),
        errors: [error instanceof Error ? error.message : String(error)] };
    }
  };
  Object.assign(validate, { [etaxCertifiedProductAdapter]: true });
  return validate;
}

export class CommandEtaxSigner implements EtaxSigner {
  readonly certified = true;
  readonly [etaxCertifiedProductAdapter] = true;
  readonly name: string;
  constructor(private readonly command: CertifiedCommand, private readonly certificateFingerprintSha256: string) {
    assertCertifiedCommand(command);
    if (!/^[a-f0-9]{64}$/.test(certificateFingerprintSha256)) throw new Error("invalid certificate fingerprint");
    this.name = basename(command.executable);
  }
  async sign(input: { payloadPath: string; payloadSha256: string }) {
    assertCertifiedCommand(this.command);
    assertSafeToolPath(input.payloadPath, "payload");
    const signaturePath = `${input.payloadPath}.${input.payloadSha256.slice(0, 16)}.xmlsig`;
    await execFileAsync(this.command.executable, ["sign", "--input", input.payloadPath, "--output", signaturePath], {
      env: buildEtaxChildEnv({}), timeout: 120_000, maxBuffer: 1024 * 1024,
    });
    if (!existsSync(signaturePath)) throw new Error("e-Tax signature module did not create signature output");
    return { algorithm: "external-etax-signature-module", certificateFingerprintSha256: this.certificateFingerprintSha256, signaturePath };
  }
}

type ModuleResult = { requestId: string; status?: "not_found" | "unknown"; receipt?: Omit<EtaxReceipt, "xtx"> & { xtxBase64?: string } };

export class CommandEtaxTransport implements EtaxTransport {
  readonly certified = true;
  readonly [etaxCertifiedProductAdapter] = true;
  readonly name: string;
  constructor(private readonly command: CertifiedCommand, private readonly environment: Record<string, string>) {
    buildEtaxChildEnv(environment);
    assertCertifiedCommand(command);
    this.name = basename(command.executable);
  }
  private async invoke(operation: "send" | "lookup", body: unknown): Promise<ModuleResult> {
    assertCertifiedCommand(this.command);
    const dir = mkdtempSync(join(tmpdir(), "orgos-etax-module-"));
    const requestPath = join(dir, "request.json");
    writeFileSync(requestPath, JSON.stringify(body), { encoding: "utf8", mode: 0o600 });
    try {
      const { stdout } = await execFileAsync(this.command.executable, [operation, "--request", requestPath], {
        env: buildEtaxChildEnv(this.environment), timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
      });
      return JSON.parse(stdout) as ModuleResult;
    } finally {
      try { unlinkSync(requestPath); } catch { /* best effort secure cleanup */ }
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort secure cleanup */ }
    }
  }
  async send(input: Parameters<EtaxTransport["send"]>[0]) {
    const result = await this.invoke("send", input);
    if (!result.requestId) throw new Error("e-Tax module response missing requestId");
    return { requestId: result.requestId, receipt: decodeReceipt(result.receipt) };
  }
  async lookup(input: { requestId: string; idempotencyKey: string }) {
    const result = await this.invoke("lookup", input);
    if (result.status === "not_found" || result.status === "unknown") return { status: result.status } as const;
    const receipt = decodeReceipt(result.receipt);
    if (!receipt) return { status: "unknown" } as const;
    return { status: "found", receipt } as const;
  }
}

function decodeReceipt(receipt: ModuleResult["receipt"]): EtaxReceipt | undefined {
  if (!receipt) return undefined;
  const { xtxBase64, ...rest } = receipt;
  return { ...rest, xtx: xtxBase64 ? Buffer.from(xtxBase64, "base64") : undefined };
}
