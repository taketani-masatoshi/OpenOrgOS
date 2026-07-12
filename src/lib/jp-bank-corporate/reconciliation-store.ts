import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  reconciliationEventFileSchema,
  type ReconciliationEvent,
  type ReconciliationEventFile,
} from "../../../schemas/jp-bank-corporate.js";
import { getDataDir, writeYamlFile } from "../utils.js";

export function reconciliationEventPath(): string {
  return join(getDataDir(), "finance", "reconciliation-events.yaml");
}

export function loadReconciliationEventFile(): ReconciliationEventFile {
  const path = reconciliationEventPath();
  if (!existsSync(path)) {
    return reconciliationEventFileSchema.parse({
      version: "1",
      currency: "JPY",
      events: [],
    });
  }
  return reconciliationEventFileSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}

export function appendReconciliationEvents(incoming: ReconciliationEvent[]): {
  file: ReconciliationEventFile;
  added: number;
} {
  const file = loadReconciliationEventFile();
  const ids = new Set(file.events.map((event) => event.id));
  const additions = incoming.filter((event) => {
    if (ids.has(event.id)) return false;
    ids.add(event.id);
    return true;
  });
  const next = reconciliationEventFileSchema.parse({
    ...file,
    events: [...file.events, ...additions],
  });
  if (additions.length > 0) {
    writeYamlFile(reconciliationEventPath(), next);
  }
  return { file: next, added: additions.length };
}
