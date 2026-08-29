import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  moduleMessageRegistrySchema,
  moduleMessageSchema,
  type ModuleMessage,
} from "../../../schemas/module-message.js";
import { getCatalogAgent } from "../agent-catalog.js";
import { CAP, evaluateCapability, grantedCapabilitiesFromSecurity } from "../module-capability.js";
import { loadModuleManifest, resolveModuleSecurity } from "../modules.js";
import { tenantDataPath } from "../tenant.js";
import { readYamlFile, writeYamlFile } from "../utils.js";

export function moduleMessagesDir(): string {
  return tenantDataPath("org", "module-messages");
}

export function moduleMessagesRegistryPath(): string {
  return join(moduleMessagesDir(), "registry.yaml");
}

export function moduleMessageFilePath(messageId: string): string {
  return join(moduleMessagesDir(), `${messageId}.yaml`);
}

function ensureModuleMessagesDir(): void {
  const dir = moduleMessagesDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function loadModuleMessageRegistry() {
  const path = moduleMessagesRegistryPath();
  if (!existsSync(path)) {
    return moduleMessageRegistrySchema.parse({ version: 1, messages: [] });
  }
  return readYamlFile(path, moduleMessageRegistrySchema);
}

export function saveModuleMessage(message: ModuleMessage): string {
  ensureModuleMessagesDir();
  const parsed = moduleMessageSchema.parse(message);
  const filePath = moduleMessageFilePath(parsed.message_id);
  writeYamlFile(filePath, parsed);
  const registry = loadModuleMessageRegistry();
  const without = registry.messages.filter((m) => m.message_id !== parsed.message_id);
  registry.messages = [...without, parsed];
  writeYamlFile(moduleMessagesRegistryPath(), registry);
  return filePath;
}

export function loadModuleMessage(messageId: string): ModuleMessage | null {
  const filePath = moduleMessageFilePath(messageId);
  if (!existsSync(filePath)) return null;
  return readYamlFile(filePath, moduleMessageSchema);
}

function coreAgentRelayAllowed(fromId: string, toId: string): boolean {
  const coreAllow: Record<string, string[]> = {
    integration: ["finance", "operations", "compliance", "secretary", "executive_steward"],
    finance: ["integration", "secretary"],
    operations: ["integration", "secretary"],
    compliance: ["integration", "secretary"],
    secretary: ["integration", "executive_steward"],
  };
  return coreAllow[fromId]?.includes(toId) ?? false;
}

export function assertModuleMessageRelayAllowed(message: ModuleMessage): void {
  if (message.confidentiality !== "L0" && message.confidentiality !== "L1") {
    throw new Error("module message confidentiality must be L0 or L1");
  }
  if (/[0-9]{10,}|@/.test(message.payload_summary)) {
    throw new Error("payload_summary must not contain L2-like values");
  }

  const toEntry = getCatalogAgent(message.to.id);
  if (message.to.kind === "module" && !loadModuleManifest(message.to.id)) {
    throw new Error(`message target module incomplete or missing: ${message.to.id}`);
  }
  if (message.to.kind === "agent" && !toEntry) {
    throw new Error(`unknown message target agent: ${message.to.id}`);
  }

  const fromModule = message.from.kind === "module" ? message.from.id : resolveModuleId(message.from.id);
  if (fromModule) {
    const security = resolveModuleSecurity(fromModule);
    const granted = grantedCapabilitiesFromSecurity(security);
    const required = CAP.agentRelay(message.to.id);
    const decision = evaluateCapability({
      granted,
      required,
      trustClass: security.trust_class,
    });
    if (decision === "deny") {
      throw new Error(`agent_relay denied: ${message.from.id} → ${message.to.id}`);
    }
    return;
  }

  if (message.from.kind === "agent" || message.from.kind === "integration") {
    if (!coreAgentRelayAllowed(message.from.id, message.to.id)) {
      throw new Error(`core relay not allowed: ${message.from.id} → ${message.to.id}`);
    }
    return;
  }

  throw new Error(`unsupported message sender: ${message.from.id}`);
}

function resolveModuleId(agentOrModuleId: string): string | undefined {
  const entry = getCatalogAgent(agentOrModuleId);
  if (entry?.binds_modules?.[0]) return entry.binds_modules[0];
  if (loadModuleManifest(agentOrModuleId)) return agentOrModuleId;
  return undefined;
}

export function appendModuleMessage(message: ModuleMessage): string {
  assertModuleMessageRelayAllowed(message);
  return saveModuleMessage(message);
}

export function listPendingModuleMessagesFor(targetId: string): ModuleMessage[] {
  const registry = loadModuleMessageRegistry();
  return registry.messages.filter(
    (m) => m.to.id === targetId && (m.status === "pending" || m.status === "delivered"),
  );
}

export function parseModuleMessageYaml(raw: string): ModuleMessage {
  return moduleMessageSchema.parse(YAML.parse(raw));
}

export function resetModuleMessagesForTests(): void {
  const dir = moduleMessagesDir();
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}
