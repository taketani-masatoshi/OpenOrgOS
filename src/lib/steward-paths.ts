import { join } from "node:path";
import { ROOT_DIR } from "./tenant.js";

/** Layer A — steward/core/（常時コア Agent · Skill · ルーティング） */
export const STEWARD_CORE_DIR = join(ROOT_DIR, "steward", "core");
export const STEWARD_AGENTS_DIR = join(STEWARD_CORE_DIR, "agents");
export const STEWARD_SKILLS_DIR = join(STEWARD_CORE_DIR, "skills");
export const STEWARD_ROUTING_DIR = join(STEWARD_CORE_DIR, "routing");
export const STEWARD_ORCHESTRATORS_DIR = join(STEWARD_CORE_DIR, "orchestrators");

/** Layer B — steward/modules/ · steward/jurisdiction-packs/ */
export const STEWARD_MODULES_DIR = join(ROOT_DIR, "steward", "modules");
export const JURISDICTION_PACKS_DIR = join(ROOT_DIR, "steward", "jurisdiction-packs");

/** Layer C — steward/platform/（Phase 2/3 webhook · cloud agent） */
export const STEWARD_PLATFORM_DIR = join(ROOT_DIR, "steward", "platform");
export const WEBHOOK_REGISTRY_PATH = join(STEWARD_PLATFORM_DIR, "webhook", "registry.yaml");
export const CLOUD_AGENT_CONFIG_PATH = join(STEWARD_PLATFORM_DIR, "agent", "cloud.yaml");
export const PROTOCOL_REGISTRY_PATH = join(STEWARD_PLATFORM_DIR, "protocol", "registry.yaml");

/** Index only — pack pin · country list */
export const JURISDICTIONS_DIR = join(ROOT_DIR, "steward", "jurisdictions");

export const CORE_SKILL_REGISTRY_PATH = join(STEWARD_SKILLS_DIR, "registry.yaml");
export const ROUTING_REGISTRY_PATH = join(STEWARD_ROUTING_DIR, "registry.yaml");
