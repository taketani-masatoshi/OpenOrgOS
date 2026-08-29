import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { aiaRunRecordSchema, type AiaRunRecord } from "../../../schemas/aia-runtime.js";
import { tenantDataPath } from "../tenant.js";
import { writeYamlFile } from "../utils.js";

const aiaQueueFileSchema = z.object({
  schema: z.literal("orgos.aia.queue.v1"),
  runs: z.array(aiaRunRecordSchema).default([]),
  queue_order: z.array(z.string()).default([]),
});

export type AiaQueueFile = z.output<typeof aiaQueueFileSchema>;

export function aiaQueuePath(): string {
  return tenantDataPath("org", "aia-queue.yaml");
}

export function loadAiaQueueFile(): AiaQueueFile {
  const path = aiaQueuePath();
  if (!existsSync(path)) {
    return { schema: "orgos.aia.queue.v1", runs: [], queue_order: [] };
  }
  return aiaQueueFileSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}

export function saveAiaQueueFile(file: AiaQueueFile): string {
  const path = aiaQueuePath();
  mkdirSync(dirname(path), { recursive: true });
  const parsed = aiaQueueFileSchema.parse(file);
  writeYamlFile(path, parsed);
  return path;
}

export function persistAiaQueueState(runs: Map<string, AiaRunRecord>, queueOrder: string[]): void {
  saveAiaQueueFile({
    schema: "orgos.aia.queue.v1",
    runs: [...runs.values()],
    queue_order: [...queueOrder],
  });
}

export function hydrateAiaQueueState(): {
  runs: Map<string, AiaRunRecord>;
  queueOrder: string[];
} {
  const file = loadAiaQueueFile();
  const runs = new Map<string, AiaRunRecord>();
  for (const run of file.runs) {
    runs.set(run.run_id, run);
  }
  const queueOrder = file.queue_order.filter((id) => {
    const run = runs.get(id);
    return run?.state === "queued";
  });
  return { runs, queueOrder };
}
