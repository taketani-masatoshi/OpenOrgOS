#!/usr/bin/env node
/**
 * etax-host — JSON-RPC over stdio for NTA COM (Windows) or honest unbound mode.
 *
 * Methods: health, signToReport, send, getResponse
 * PIN is never accepted as a JSON param — OS / NTA dialog only.
 *
 * Env:
 *   ORGOS_ETAX_HOST_MODE=unbound|com|stub
 *     unbound (default off win32 or when COM missing): health reports unbound
 *     stub: test-only labeled responses (not NTA)
 *     com: attempt ActiveX via winax when available
 */

import { createHash } from "node:crypto";
import { createInterface } from "node:readline";

const MODE = (process.env.ORGOS_ETAX_HOST_MODE ?? "").trim() || defaultMode();

function defaultMode() {
  if (process.env.ORGOS_ETAX_HOST_STUB === "1") return "stub";
  if (process.platform === "win32") return "com";
  return "unbound";
}

function sha256Digest(data) {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function respondError(id, code, message) {
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`,
  );
}

/** @type {null | { signer: unknown, comm: unknown }} */
let comHandles = null;

async function tryLoadCom() {
  if (comHandles) return comHandles;
  if (process.platform !== "win32" || MODE !== "com") return null;
  try {
    // Optional dependency — operators install winax on Windows hosts with NTA modules.
    // Method arity follows catalog names only; if COM throws, stay unbound (do not invent).
    const winax = await import("winax");
    const ActiveXObject = winax.default?.Object ?? winax.Object ?? winax.default;
    if (!ActiveXObject) return null;
    const signer = new ActiveXObject("nta.CLCXtxSigner");
    const comm = new ActiveXObject("nta.CLCCommunication");
    comHandles = { signer, comm };
    return comHandles;
  } catch {
    return null;
  }
}

async function health() {
  const com = await tryLoadCom();
  if (MODE === "stub") {
    return {
      ok: true,
      platform: process.platform,
      signatureBound: true,
      transportBound: true,
      methods: ["SignToReport", "Send", "GetResponse"],
      detail: "ORGOS_ETAX_HOST_MODE=stub — not NTA",
    };
  }
  if (com) {
    return {
      ok: true,
      platform: process.platform,
      signatureBound: true,
      transportBound: true,
      methods: ["SignToReport", "Send", "GetResponse"],
      detail: "COM nta.CLCXtxSigner + nta.CLCCommunication",
    };
  }
  return {
    ok: false,
    platform: process.platform,
    signatureBound: false,
    transportBound: false,
    methods: ["SignToReport", "Send", "GetResponse"],
    detail:
      process.platform === "win32"
        ? "COM modules not loadable (install NTA CLXtxSigner/CLCommunication + winax)"
        : "etax-host unbound off Windows — Darwin/CI keeps hostBound false",
  };
}

async function signToReport(params) {
  const documentHash = params.documentHash;
  const document = Buffer.from(String(params.documentBase64 ?? ""), "base64");
  const live = sha256Digest(document);
  if (live !== documentHash) {
    throw new Error("documentHash mismatch");
  }
  const com = await tryLoadCom();
  if (com?.signer) {
    try {
      // PIN via OS dialog inside SignToReport — do not pass PIN here.
      // Argument shape is provisional pending e-tax05 sample verification on operator Windows.
      const signed = com.signer.SignToReport(document.toString("binary"));
      return {
        certificateId: String(com.signer.CertificateId ?? "nta-com-certificate"),
        certificateValid: true,
        signingTime: new Date().toISOString(),
        signatureHash: sha256Digest(Buffer.from(String(signed))),
        method: "SignToReport",
        moduleId: "CLXtxSigner.dll",
      };
    } catch (error) {
      throw new Error(
        `COM SignToReport failed (verify e-tax05 sample arity on this host): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  if (MODE === "stub") {
    return {
      certificateId: "stub-certificate-not-nta",
      certificateValid: true,
      signingTime: new Date().toISOString(),
      signatureHash: sha256Digest(`STUB-SIGN|${documentHash}`),
      method: "SignToReport",
      moduleId: "stub",
    };
  }
  throw new Error("SignToReport unavailable: host unbound");
}

async function send(params) {
  const documentHash = params.documentHash;
  const document = Buffer.from(String(params.documentBase64 ?? ""), "base64");
  if (sha256Digest(document) !== documentHash) {
    throw new Error("documentHash mismatch");
  }
  const com = await tryLoadCom();
  if (com?.comm) {
    try {
      // CreateRequest / Send — request id from COM only. Arity provisional (e-tax04 sample).
      const requestId = String(com.comm.Send(document.toString("binary")));
      if (requestId === "XU00S010") {
        throw new Error("refusing sample login request id XU00S010 as filing id");
      }
      return {
        ok: true,
        requestId,
        transportStatus: "sent",
        message: "COM Send",
      };
    } catch (error) {
      throw new Error(
        `COM Send failed (verify e-tax04 sample arity on this host): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  if (MODE === "stub") {
    const requestId = `host:stub:${String(params.submissionId ?? "x").slice(0, 20)}`;
    return {
      ok: true,
      requestId,
      transportStatus: "sent",
      message: "Stub Send — not NTA",
    };
  }
  throw new Error("Send unavailable: host unbound");
}

async function getResponse(params) {
  const com = await tryLoadCom();
  if (com?.comm) {
    try {
      const xml = String(com.comm.GetResponse(params.requestId ?? ""));
      return {
        requestId: params.requestId,
        receiptXml: xml,
        receivedAt: new Date().toISOString(),
        responseHash: sha256Digest(xml),
        status: "RECEIVED_BY_ETAX",
      };
    } catch (error) {
      throw new Error(
        `COM GetResponse failed (verify e-tax04 sample arity on this host): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  if (MODE === "stub") {
    const receiptNumber = `HOST-STUB-${String(params.submissionId ?? "x").slice(-8)}`;
    const receiptXml = `<?xml version="1.0"?><UMB00000><UMB00050>${receiptNumber}</UMB00050></UMB00000>`;
    return {
      requestId: params.requestId,
      receiptXml,
      receiptNumber,
      receivedAt: new Date().toISOString(),
      responseHash: sha256Digest(receiptXml),
      status: "RECEIVED_BY_ETAX",
    };
  }
  throw new Error("GetResponse unavailable: host unbound");
}

const handlers = {
  health: async () => health(),
  signToReport: async (p) => signToReport(p ?? {}),
  send: async (p) => send(p ?? {}),
  getResponse: async (p) => getResponse(p ?? {}),
};

const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const id = msg.id;
  const method = msg.method;
  try {
    const handler = handlers[method];
    if (!handler) {
      respondError(id, -32601, `Method not found: ${method}`);
      return;
    }
    const result = await handler(msg.params);
    respond(id, result);
  } catch (error) {
    respondError(id, -32000, error instanceof Error ? error.message : String(error));
  }
});
