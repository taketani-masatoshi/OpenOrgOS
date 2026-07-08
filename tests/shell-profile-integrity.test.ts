import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  loadOperatorRuntimeConfig,
  shellProfileIntegrityHash,
  verifyOperatorRuntimeIntegrity,
} from "../src/lib/operator-runtime/config.js";

describe("shell profile integrity", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.ORGOS_RUNTIME_INTEGRITY = "1";
    delete process.env.ORGOS_ENV;
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("loads runtime config when profile hashes match", () => {
    const cfg = loadOperatorRuntimeConfig();
    expect(cfg.profile_integrity?.shell).toBeTruthy();
    expect(cfg.profiles?.aider).toBeTruthy();
  });

  it("shellProfileIntegrityHash is stable for aider profile", () => {
    const cfg = loadOperatorRuntimeConfig();
    const aider = cfg.profiles?.aider;
    expect(aider).toBeTruthy();
    expect(shellProfileIntegrityHash(aider!)).toBe(cfg.profile_integrity?.profiles?.aider);
  });

  it("rejects tampered profile when integrity enforced", () => {
    const cfg = loadOperatorRuntimeConfig();
    const tampered = {
      ...cfg,
      profiles: {
        ...cfg.profiles,
        aider: {
          ...cfg.profiles!.aider!,
          command: ["echo", "tampered"],
        },
      },
    };
    expect(() => verifyOperatorRuntimeIntegrity(tampered)).toThrow(/integrity mismatch/i);
  });
});
