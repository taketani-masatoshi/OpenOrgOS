import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, rmSync, statSync } from "node:fs";
import { setTenantId } from "../src/lib/tenant.js";
import {
  buildEsignSecretsSnapshot,
  esignSecretsFilePath,
  resetEsignSecretsHydrationForTest,
  saveEsignSecrets,
} from "../src/lib/pdf-esign/esign-secrets-store.js";

const TOKEN = "sidecar-token-abcdef0123456789";
const ENV_KEYS = [
  "ORGOS_SIVA_BASE_URL",
  "ORGOS_SIVA_MODE",
  "ORGOS_DIGIDOC_SIDECAR_URL",
  "ORGOS_DIGIDOC_SIDECAR_TOKEN",
  "ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK",
] as const;

describe("esign endpoint store", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    setTenantId("_fixture-books");
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    resetEsignSecretsHydrationForTest();
    rmSync(esignSecretsFilePath(), { force: true });
  });

  afterEach(() => {
    rmSync(esignSecretsFilePath(), { force: true });
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    resetEsignSecretsHydrationForTest();
  });

  it("stores endpoints 0600 and reports the token masked only", () => {
    saveEsignSecrets({
      ORGOS_SIVA_BASE_URL: "http://127.0.0.1:8080",
      ORGOS_SIVA_MODE: "live",
      ORGOS_DIGIDOC_SIDECAR_URL: "http://127.0.0.1:9090",
      ORGOS_DIGIDOC_SIDECAR_TOKEN: TOKEN,
      ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK: "1",
    });

    expect(statSync(esignSecretsFilePath()).mode & 0o777).toBe(0o600);
    expect(readFileSync(esignSecretsFilePath(), "utf8")).toContain(TOKEN);

    const snapshot = buildEsignSecretsSnapshot();
    expect(JSON.stringify(snapshot)).not.toContain(TOKEN);
    expect(snapshot.sidecar_token_configured).toBe(true);
    expect(snapshot.siva_base_url).toBe("http://127.0.0.1:8080");
    expect(snapshot.allow_http_loopback).toBe(true);
  });

  it("lets deploy env win over the stored value", () => {
    saveEsignSecrets({ ORGOS_SIVA_BASE_URL: "http://127.0.0.1:8080" });
    process.env.ORGOS_SIVA_BASE_URL = "https://siva.example.internal";
    resetEsignSecretsHydrationForTest();

    expect(buildEsignSecretsSnapshot().siva_base_url).toBe(
      "https://siva.example.internal",
    );
  });
});
