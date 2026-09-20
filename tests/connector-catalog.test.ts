import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONNECTOR_PROVIDERS } from "../schemas/connectors.js";
import {
  catalogEntry,
  connectorCatalog,
  connectorsInClass,
  orderedConnectorProviders,
} from "../src/lib/integrations/connector-catalog.js";
import { effectiveOxInclusion } from "../src/lib/integrations/opendesk-probe.js";

describe("connector catalog", () => {
  it("lists every provider once, sovereign first", () => {
    const providers = connectorCatalog().map((entry) => entry.provider);
    expect(providers).toEqual([...CONNECTOR_PROVIDERS]);
    expect(orderedConnectorProviders().slice(0, 4)).toEqual(["matrix", "nextcloud", "ox", "keycloak"]);
    expect(connectorsInClass("sovereign").every((entry) => entry.connectorClass === "sovereign")).toBe(true);
    expect(connectorsInClass("compat").map((entry) => entry.provider)).toEqual([
      "gmail",
      "slack",
      "asana",
      "gdrive",
      "m365",
    ]);
  });

  it("keeps Big Tech as compat egress and OX as a stub until probe", () => {
    expect(catalogEntry("slack").inclusion).toBe("compat_egress");
    expect(catalogEntry("gmail").inclusion).toBe("compat_egress");
    expect(catalogEntry("gdrive").inclusion).toBe("compat_egress");
    expect(catalogEntry("m365").inclusion).toBe("compat_egress");
    expect(catalogEntry("matrix").inclusion).toBe("confirmed_live");
    expect(catalogEntry("ox").inclusion).toBe("stub_unconfirmed");
    const compose = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../deploy/opendesk-verify/docker-compose.yaml"),
      "utf8",
    );
    expect(catalogEntry("matrix").verifyImage).toBe("matrixdotorg/synapse:v1.161.0");
    expect(catalogEntry("nextcloud").verifyImage).toBe("nextcloud:34.0.4");
    expect(catalogEntry("keycloak").verifyImage).toBe("quay.io/keycloak/keycloak:26.3.5");
    for (const provider of ["matrix", "nextcloud", "keycloak"] as const) {
      const image = catalogEntry(provider).verifyImage ?? "";
      expect(image).not.toMatch(/:(latest|stable)$/);
      expect(compose).toContain(`image: ${image}`);
    }
    expect(
      effectiveOxInclusion({
        probed_at: "2026-09-19T00:00:00.000Z",
        ox: { image: "ox", pulled: false, reason: "no manifest" },
        core: [],
      }),
    ).toBe("stub_unconfirmed");
  });
});
