/**
 * Image probe for deploy/opendesk-verify. OX stays stub until a public CE
 * image can be inspected without registry credentials.
 * Path: src/lib/integrations/opendesk-probe.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { ConnectorInclusion, ConnectorProvider } from "../../../schemas/connectors.js";
import { getInstallRoot } from "../orgos-paths.js";
import { catalogEntry } from "./connector-catalog.js";

/** Candidates tried on 2026-09-19. None were pullable without credentials. */
export const OX_CANDIDATE_IMAGES = [
  "registry.opencode.de/bmi/opendesk/components/ox-app-suite:latest",
  "registry.opencode.de/zendis/opendesk/ox-appsuite:latest",
] as const;

const probeImageSchema = z.object({
  image: z.string(),
  pulled: z.boolean(),
  reason: z.string(),
});

export const probeResultSchema = z.object({
  probed_at: z.string(),
  ox: probeImageSchema,
  core: z.array(probeImageSchema),
});

export type ProbeResult = z.output<typeof probeResultSchema>;

export function probeResultPath(root = getInstallRoot()): string {
  return join(root, "deploy/opendesk-verify/probe-result.json");
}

export function loadProbeResult(root = getInstallRoot()): ProbeResult | null {
  const path = probeResultPath(root);
  if (!existsSync(path)) return null;
  try {
    return probeResultSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    return null;
  }
}

export function effectiveOxInclusion(result: ProbeResult | null): ConnectorInclusion {
  return result?.ox.pulled ? "confirmed_live" : "stub_unconfirmed";
}

export function currentOxInclusion(root = getInstallRoot()): ConnectorInclusion {
  return effectiveOxInclusion(loadProbeResult(root));
}

export interface ImageInspect {
  (image: string): Promise<{ ok: boolean; reason: string }>;
}

export async function probeOpendeskImages(input: {
  inspect: ImageInspect;
  now?: string;
  root?: string;
  write?: boolean;
}): Promise<ProbeResult> {
  const coreProviders: ConnectorProvider[] = ["matrix", "nextcloud", "keycloak"];
  const coreImages = coreProviders
    .map((provider) => catalogEntry(provider).verifyImage)
    .filter((image): image is string => Boolean(image));
  const core = [];
  for (const image of coreImages) {
    const inspected = await input.inspect(image);
    core.push({
      image,
      pulled: inspected.ok,
      reason: inspected.ok ? "public manifest" : inspected.reason,
    });
  }

  let ox: { image: string; pulled: boolean; reason: string } = {
    image: OX_CANDIDATE_IMAGES[0],
    pulled: false,
    reason: "no candidate",
  };
  for (const image of OX_CANDIDATE_IMAGES) {
    const inspected = await input.inspect(image);
    ox = {
      image,
      pulled: inspected.ok,
      reason: inspected.ok ? "public manifest" : inspected.reason,
    };
    if (inspected.ok) break;
  }

  const result = probeResultSchema.parse({
    probed_at: input.now ?? new Date().toISOString(),
    ox,
    core,
  });
  if (input.write !== false && input.root) {
    const path = probeResultPath(input.root);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
  }
  return result;
}
