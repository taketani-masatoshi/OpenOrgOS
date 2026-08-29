import { existsSync } from "node:fs";
import { permitRegistryFileSchema } from "../../../../schemas/jp-permit-registry.js";
import { getModuleDataDir } from "../../../../src/lib/module-business-data.js";
import { currentDate, readYamlFile } from "../../../../src/lib/utils.js";
import { loadStays, stayNights } from "./ops-lib.js";

const MINPAKU_CAP = 180;
const WARN_THRESHOLD = 150;

export type NightsCapResult = {
  year: string;
  occupied_nights: number;
  cap_applies: boolean;
  cap: number | null;
  remaining: number | null;
  permit_kind: "ryokan" | "minpaku" | "unknown";
  severity: "ok" | "warn" | "over";
};

function loadActivePermitTypeIds(): Set<string> {
  const path = `${getModuleDataDir("jp_permit_registry")}/permit-registry.yaml`;
  if (!existsSync(path)) return new Set();
  try {
    const doc = readYamlFile(path, permitRegistryFileSchema);
    return new Set(
      doc.permits.filter((p) => p.status === "active").map((p) => p.permit_type_id)
    );
  } catch {
    return new Set();
  }
}

function activeRyokanPermit(active: Set<string>): boolean {
  return [...active].some((id) => id.startsWith("pt-ryokan-"));
}

function activeMinpakuPermit(active: Set<string>): boolean {
  return active.has("pt-minpaku-notification");
}

export function computeNightsCap(year = currentDate().slice(0, 4)): NightsCapResult {
  const stays = loadStays().stays.filter(
    (s) =>
      s.check_in.startsWith(year) &&
      s.status !== "cancelled" &&
      s.status !== "no_show"
  );
  let occupied = 0;
  for (const stay of stays) occupied += stayNights(stay);

  const active = loadActivePermitTypeIds();
  const ryokan = activeRyokanPermit(active);
  const minpaku = activeMinpakuPermit(active);

  if (ryokan) {
    return {
      year,
      occupied_nights: occupied,
      cap_applies: false,
      cap: null,
      remaining: null,
      permit_kind: "ryokan",
      severity: "ok",
    };
  }

  if (minpaku) {
    const remaining = MINPAKU_CAP - occupied;
    return {
      year,
      occupied_nights: occupied,
      cap_applies: true,
      cap: MINPAKU_CAP,
      remaining,
      permit_kind: "minpaku",
      severity: occupied > MINPAKU_CAP ? "over" : occupied >= WARN_THRESHOLD ? "warn" : "ok",
    };
  }

  return {
    year,
    occupied_nights: occupied,
    cap_applies: false,
    cap: null,
    remaining: null,
    permit_kind: "unknown",
    severity: "ok",
  };
}
