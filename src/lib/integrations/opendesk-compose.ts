/**
 * docker compose control for the openDesk verify stack.
 * Path: src/lib/integrations/opendesk-compose.ts
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { getInstallRoot } from "../orgos-paths.js";

export function opendeskComposeFile(root = getInstallRoot()): string {
  return join(root, "deploy/opendesk-verify/docker-compose.yaml");
}

export function runCompose(
  args: string[],
  root = getInstallRoot(),
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("docker", ["compose", "-f", opendeskComposeFile(root), ...args], {
    encoding: "utf-8",
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr || result.error?.message || "",
  };
}

export function inspectDockerImage(image: string): { ok: boolean; reason: string } {
  const result = spawnSync("docker", ["manifest", "inspect", image], { encoding: "utf-8" });
  if (result.status === 0) return { ok: true, reason: "public manifest" };
  const detail = (result.stderr || result.error?.message || "inspect failed").trim();
  return { ok: false, reason: detail.slice(0, 240) };
}
