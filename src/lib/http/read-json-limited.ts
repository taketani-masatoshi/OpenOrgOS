import type { IncomingMessage } from "node:http";

export class PayloadTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`request body exceeds ${maxBytes} bytes`);
    this.name = "PayloadTooLargeError";
  }
}

export class InvalidJsonError extends Error {
  constructor(message = "invalid JSON body") {
    super(message);
    this.name = "InvalidJsonError";
  }
}

/** Read and parse JSON with a hard byte cap (DoS / memory guard). */
export async function readJsonLimited(
  req: IncomingMessage,
  maxBytes = 64 * 1024,
): Promise<unknown> {
  const declared = req.headers?.["content-length"];
  if (declared) {
    const n = Number.parseInt(String(declared), 10);
    if (Number.isFinite(n) && n > maxBytes) {
      req.resume?.();
      throw new PayloadTooLargeError(maxBytes);
    }
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      req.resume?.();
      throw new PayloadTooLargeError(maxBytes);
    }
    chunks.push(buf);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new InvalidJsonError();
  }
}
