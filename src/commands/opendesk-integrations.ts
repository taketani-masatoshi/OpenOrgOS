/**
 * CLI actions for `orgos integrations opendesk`.
 * Path: src/commands/opendesk-integrations.ts
 */
import { getInstallRoot } from "../lib/orgos-paths.js";
import { inspectDockerImage, runCompose } from "../lib/integrations/opendesk-compose.js";
import { currentOxInclusion, effectiveOxInclusion, probeOpendeskImages } from "../lib/integrations/opendesk-probe.js";
import { verifyOpendeskPorts } from "../lib/integrations/opendesk-verify.js";

function printComposeFailure(stderr: string): void {
  console.error(stderr.trim() || "docker compose failed");
  process.exit(1);
}

export function runOpendeskUp(opts: { groupware?: boolean }): void {
  const args = ["up", "-d"];
  if (opts.groupware) args.unshift("--profile", "groupware");
  const result = runCompose(args);
  if (result.status !== 0) printComposeFailure(result.stderr);
  console.log(result.stdout.trim() || "opendesk verify stack is up");
}

export function runOpendeskDown(): void {
  const result = runCompose(["down"]);
  if (result.status !== 0) printComposeFailure(result.stderr);
  console.log(result.stdout.trim() || "opendesk verify stack is down");
}

export async function runOpendeskProbe(opts: { json?: boolean }): Promise<void> {
  const result = await probeOpendeskImages({
    inspect: async (image) => inspectDockerImage(image),
    root: getInstallRoot(),
    write: true,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`OX inclusion: ${effectiveOxInclusion(result)}`);
  console.log(`  ${result.ox.image}: ${result.ox.pulled ? "public" : result.ox.reason}`);
  for (const image of result.core) {
    console.log(`  ${image.image}: ${image.pulled ? "public" : image.reason}`);
  }
}

export async function runOpendeskVerify(opts: { json?: boolean }): Promise<void> {
  const inclusion = currentOxInclusion();
  const report = await verifyOpendeskPorts({ oxInclusion: inclusion });
  if (opts.json) {
    console.log(JSON.stringify({ ox_inclusion: inclusion, ...report }, null, 2));
  } else {
    for (const [name, result] of Object.entries(report)) {
      console.log(`  ${result.ok ? "✓" : "○"} ${name}: ${result.reason}`);
    }
  }
  const required = [report.matrix, report.nextcloud, report.keycloak];
  if (required.some((item) => !item.ok)) process.exit(1);
  if (inclusion === "confirmed_live" && !report.ox.ok) process.exit(1);
}
