import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getWorkspaceRoot } from "../orgos-paths.js";
import { getClock } from "../runtime-context.js";

const storeSchema = z.object({
  version: z.literal(1),
  event_ids: z.array(z.string()),
});

const MAX_EVENTS = 500;

function storePath(): string {
  return join(getWorkspaceRoot(), "product-fleet", "stripe-webhook-events.yaml");
}

function loadStore() {
  const path = storePath();
  if (!existsSync(path)) {
    return storeSchema.parse({ version: 1, event_ids: [] });
  }
  return storeSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}

function saveStore(file: ReturnType<typeof loadStore>): void {
  mkdirSync(join(getWorkspaceRoot(), "product-fleet"), { recursive: true });
  writeFileSync(storePath(), YAML.stringify(file), "utf-8");
}

export function isStripeWebhookEventProcessed(eventId: string): boolean {
  const id = eventId.trim();
  if (!id) return false;
  return loadStore().event_ids.includes(id);
}

export function markStripeWebhookEventProcessed(eventId: string): void {
  const id = eventId.trim();
  if (!id) return;
  const file = loadStore();
  if (file.event_ids.includes(id)) return;
  file.event_ids.push(id);
  if (file.event_ids.length > MAX_EVENTS) {
    file.event_ids = file.event_ids.slice(-MAX_EVENTS);
  }
  saveStore(file);
}

export function resetStripeWebhookIdempotencyForTests(): void {
  saveStore({ version: 1, event_ids: [] });
}

export function stripeWebhookIdempotencyCheckedAt(): string | undefined {
  const path = storePath();
  if (!existsSync(path)) return undefined;
  return getClock().now().toISOString();
}
