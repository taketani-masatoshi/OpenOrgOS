import { createPublicKey, type KeyObject, verify } from "node:crypto";

interface JwksDocument {
  keys: Record<string, unknown>[];
}

let jwksByKid = new Map<string, KeyObject>();
let defaultPublicKey: KeyObject | undefined;
let preloadPromise: Promise<void> | null = null;

function ingestJwks(doc: JwksDocument): void {
  jwksByKid = new Map();
  defaultPublicKey = undefined;
  for (const raw of doc.keys) {
    const kid = typeof raw.kid === "string" ? raw.kid : undefined;
    const key = createPublicKey({ key: raw, format: "jwk" });
    if (kid) jwksByKid.set(kid, key);
    defaultPublicKey ??= key;
  }
}

export async function preloadOidcJwks(): Promise<void> {
  if (preloadPromise) return preloadPromise;
  preloadPromise = (async () => {
    const inline = process.env.WIRE_CONSOLE_OIDC_JWKS_JSON;
    if (inline?.trim()) {
      ingestJwks(JSON.parse(inline) as JwksDocument);
      return;
    }
    const url = process.env.WIRE_CONSOLE_OIDC_JWKS_URL;
    if (!url) return;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`OIDC JWKS fetch failed: HTTP ${res.status}`);
    }
    ingestJwks((await res.json()) as JwksDocument);
  })();
  return preloadPromise;
}

export function resetOidcJwksForTests(): void {
  jwksByKid = new Map();
  defaultPublicKey = undefined;
  preloadPromise = null;
}

export function hasOidcJwks(): boolean {
  return jwksByKid.size > 0 || defaultPublicKey != null;
}

export function verifyRs256Signature(signed: string, signature: Buffer, kid?: string): boolean {
  const key =
    (kid ? jwksByKid.get(kid) : undefined) ??
    defaultPublicKey ??
    (jwksByKid.size === 1 ? jwksByKid.values().next().value : undefined);
  if (!key) return false;
  return verify("RSA-SHA256", Buffer.from(signed), key, signature);
}
