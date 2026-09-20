/**
 * JSON-RPC/stdio client for the Windows etax-host process.
 * PIN stays on the NTA module / OS dialog — never sent as a host param.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getInstallRoot } from "../orgos-paths.js";
import { etaxError } from "../../../schemas/etax/errors.js";

export const ETAX_HOST_FORBIDDEN_REQUEST_IDS = ["XU00S010"] as const;

export type EtaxHostHealth = {
  ok: boolean;
  platform: string;
  signatureBound: boolean;
  transportBound: boolean;
  methods: string[];
  detail?: string;
};

export type EtaxHostSignResult = {
  certificateId: string;
  certificateValid: boolean;
  signingTime: string;
  signatureHash: string;
  method: string;
  moduleId?: string;
};

export type EtaxHostSendResult = {
  ok: boolean;
  requestId: string;
  transportStatus: "sent" | "rejected" | "error";
  message: string;
};

export type EtaxHostReceiptResult = {
  requestId?: string;
  receiptXml?: string;
  receiptNumber?: string;
  receivedAt?: string;
  responseHash: string;
  status: "RECEIVED_BY_ETAX" | "REJECTED_BY_ETAX" | "PENDING";
};

export interface EtaxHostClient {
  health(): Promise<EtaxHostHealth>;
  signToReport(input: {
    document: Buffer;
    documentHash: string;
  }): Promise<EtaxHostSignResult>;
  send(input: {
    submissionId: string;
    document: Buffer;
    documentHash: string;
    signatureHash: string;
  }): Promise<EtaxHostSendResult>;
  getResponse(input: {
    submissionId: string;
    requestId?: string;
  }): Promise<EtaxHostReceiptResult>;
  close(): void;
}

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
};

function assertAllowedRequestId(requestId: string): void {
  if ((ETAX_HOST_FORBIDDEN_REQUEST_IDS as readonly string[]).includes(requestId)) {
    throw etaxError({
      code: "ETAX_HOST_FORBIDDEN_REQUEST_ID",
      blocked: "SPEC_BLOCKED",
      field: "requestId",
      message: `Host returned forbidden sample request id ${requestId}. Filing IDs must come from the official interface, not login samples.`,
    });
  }
}

export function defaultEtaxHostCommand(): { command: string; args: string[] } {
  const override = process.env.ORGOS_ETAX_HOST_CMD?.trim();
  if (override) {
    const parts = override.split(/\s+/).filter(Boolean);
    return { command: parts[0]!, args: parts.slice(1) };
  }
  const script = join(getInstallRoot(), "tools/etax-host/etax-host.mjs");
  if (existsSync(script)) {
    return { command: process.execPath, args: [script] };
  }
  throw etaxError({
    code: "ETAX_HOST_BINARY_MISSING",
    blocked: "SPEC_BLOCKED",
    message: `etax-host entry missing (${script}). Set ORGOS_ETAX_HOST_CMD or install tools/etax-host.`,
  });
}

export class StdioEtaxHostClient implements EtaxHostClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private rl: ReturnType<typeof createInterface> | null = null;

  constructor(private readonly launch = defaultEtaxHostCommand) {}

  private ensureStarted(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;
    const { command, args } = this.launch();
    this.child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });
    this.rl = createInterface({ input: this.child.stdout });
    this.rl.on("line", (line) => this.onLine(line));
    this.child.stderr.on("data", () => {
      /* host may log non-secret diagnostics; do not echo PIN */
    });
    this.child.on("exit", () => {
      for (const [, p] of this.pending) {
        p.reject(new Error("etax-host exited"));
      }
      this.pending.clear();
      this.child = null;
      this.rl = null;
    });
    return this.child;
  }

  private onLine(line: string): void {
    let msg: JsonRpcResponse;
    try {
      msg = JSON.parse(line) as JsonRpcResponse;
    } catch {
      return;
    }
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    if (msg.error) {
      pending.reject(new Error(msg.error.message));
      return;
    }
    pending.resolve(msg.result);
  }

  private call(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const child = this.ensureStarted();
    const id = this.nextId++;
    const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify(req)}\n`, (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  async health(): Promise<EtaxHostHealth> {
    return (await this.call("health")) as EtaxHostHealth;
  }

  async signToReport(input: {
    document: Buffer;
    documentHash: string;
  }): Promise<EtaxHostSignResult> {
    const result = (await this.call("signToReport", {
      documentBase64: input.document.toString("base64"),
      documentHash: input.documentHash,
    })) as EtaxHostSignResult;
    return result;
  }

  async send(input: {
    submissionId: string;
    document: Buffer;
    documentHash: string;
    signatureHash: string;
  }): Promise<EtaxHostSendResult> {
    const result = (await this.call("send", {
      submissionId: input.submissionId,
      documentBase64: input.document.toString("base64"),
      documentHash: input.documentHash,
      signatureHash: input.signatureHash,
    })) as EtaxHostSendResult;
    assertAllowedRequestId(result.requestId);
    return result;
  }

  async getResponse(input: {
    submissionId: string;
    requestId?: string;
  }): Promise<EtaxHostReceiptResult> {
    const result = (await this.call("getResponse", {
      submissionId: input.submissionId,
      requestId: input.requestId,
    })) as EtaxHostReceiptResult;
    if (result.requestId) assertAllowedRequestId(result.requestId);
    return result;
  }

  close(): void {
    if (this.child) {
      this.child.stdin.end();
      this.child.kill();
      this.child = null;
    }
  }
}

/** In-process host for unit tests (not NTA). */
export class StubEtaxHostClient implements EtaxHostClient {
  constructor(
    private readonly opts: {
      signatureBound?: boolean;
      transportBound?: boolean;
      requestId?: string;
      receiptNumber?: string;
      receiptXml?: string;
    } = {},
  ) {}

  async health(): Promise<EtaxHostHealth> {
    return {
      ok: true,
      platform: process.platform,
      signatureBound: this.opts.signatureBound ?? true,
      transportBound: this.opts.transportBound ?? true,
      methods: ["SignToReport", "Send", "GetResponse"],
      detail: "stub host for tests — not NTA COM",
    };
  }

  async signToReport(input: {
    document: Buffer;
    documentHash: string;
  }): Promise<EtaxHostSignResult> {
    const { createHash } = await import("node:crypto");
    const signatureHash = `sha256:${createHash("sha256")
      .update(`STUB-SIGN|${input.documentHash}`)
      .digest("hex")}`;
    return {
      certificateId: "stub-certificate-not-nta",
      certificateValid: true,
      signingTime: new Date().toISOString(),
      signatureHash,
      method: "SignToReport",
      moduleId: "stub-CLXtxSigner",
    };
  }

  async send(input: {
    submissionId: string;
    document: Buffer;
    documentHash: string;
    signatureHash: string;
  }): Promise<EtaxHostSendResult> {
    const requestId =
      this.opts.requestId ??
      `host:${input.submissionId.slice(0, 24)}`;
    assertAllowedRequestId(requestId);
    return {
      ok: true,
      requestId,
      transportStatus: "sent",
      message: "Stub host Send — not NTA transmission",
    };
  }

  async getResponse(input: {
    submissionId: string;
    requestId?: string;
  }): Promise<EtaxHostReceiptResult> {
    const { createHash } = await import("node:crypto");
    const receiptNumber = this.opts.receiptNumber ?? `HOST-STUB-${input.submissionId.slice(-8)}`;
    const receiptXml =
      this.opts.receiptXml ??
      `<?xml version="1.0"?><UMB00000><UMB00050>${receiptNumber}</UMB00050></UMB00000>`;
    return {
      requestId: input.requestId,
      receiptXml,
      receiptNumber,
      receivedAt: new Date().toISOString(),
      responseHash: `sha256:${createHash("sha256").update(receiptXml).digest("hex")}`,
      status: "RECEIVED_BY_ETAX",
    };
  }

  close(): void {}
}

let sharedClient: EtaxHostClient | null = null;

export function setEtaxHostClientForTests(client: EtaxHostClient | null): void {
  sharedClient = client;
}

export function getEtaxHostClient(): EtaxHostClient {
  if (sharedClient) return sharedClient;
  return new StdioEtaxHostClient();
}

export async function probeEtaxHostBound(): Promise<{
  reachable: boolean;
  health?: EtaxHostHealth;
  error?: string;
}> {
  try {
    const client = getEtaxHostClient();
    const health = await client.health();
    return { reachable: health.ok && health.signatureBound && health.transportBound, health };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
