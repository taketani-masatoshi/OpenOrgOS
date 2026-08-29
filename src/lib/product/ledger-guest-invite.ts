import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getWorkspaceRoot } from "../orgos-paths.js";
import { getClock } from "../runtime-context.js";

const inviteSchema = z.object({
  version: z.literal(1),
  invites: z.array(
    z.object({
      token: z.string(),
      tenant_id: z.string(),
      email: z.string(),
      operator_id: z.string(),
      expires_at: z.string(),
      created_at: z.string(),
      used_at: z.string().optional(),
    }),
  ),
});

function invitesPath(): string {
  return join(getWorkspaceRoot(), "product-fleet", "guest-invites.yaml");
}

function loadInvites() {
  const path = invitesPath();
  if (!existsSync(path)) {
    return inviteSchema.parse({ version: 1, invites: [] });
  }
  return inviteSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}

function saveInvites(file: ReturnType<typeof loadInvites>): void {
  mkdirSync(join(getWorkspaceRoot(), "product-fleet"), { recursive: true });
  writeFileSync(invitesPath(), YAML.stringify(file), "utf-8");
}

function signToken(payload: string): string {
  const secret =
    process.env.ORGOS_LEDGER_GUEST_INVITE_SECRET?.trim() ?? "dev-guest-invite";
  return createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
}

export function createGuestInviteToken(input: {
  tenantId: string;
  email: string;
  operatorId: string;
  expiresAt: string;
}): { token: string; setup_path: string } {
  const raw = randomBytes(16).toString("hex");
  const token = `${raw}.${signToken(`${input.tenantId}:${input.email}:${raw}`)}`;
  const file = loadInvites();
  file.invites.push({
    token,
    tenant_id: input.tenantId,
    email: input.email.trim().toLowerCase(),
    operator_id: input.operatorId,
    expires_at: input.expiresAt,
    created_at: getClock().now().toISOString(),
  });
  saveInvites(file);
  return { token, setup_path: `/guest-setup?token=${encodeURIComponent(token)}` };
}

export function resolveGuestInviteToken(token: string) {
  const file = loadInvites();
  const row = file.invites.find((invite) => invite.token === token);
  if (!row) return null;
  if (row.used_at) return { ...row, valid: false, reason: "used" as const };
  if (Date.parse(row.expires_at) < Date.now()) {
    return { ...row, valid: false, reason: "expired" as const };
  }
  const [raw, sig] = token.split(".");
  if (!raw || !sig) return null;
  const expected = signToken(`${row.tenant_id}:${row.email}:${raw}`);
  if (sig !== expected) return null;
  return { ...row, valid: true as const };
}

export function buildGuestSetupSnapshot(token: string) {
  const invite = resolveGuestInviteToken(token);
  if (!invite) {
    return { ok: false as const, error: "invalid guest invite token" };
  }
  if (!invite.valid) {
    return {
      ok: false as const,
      error:
        invite.reason === "expired"
          ? "guest invite expired"
          : "guest invite already used",
    };
  }
  return {
    ok: true as const,
    tenant_id: invite.tenant_id,
    email: invite.email,
    operator_id: invite.operator_id,
    expires_at: invite.expires_at,
  };
}

export function markGuestInviteUsed(token: string): void {
  const file = loadInvites();
  const index = file.invites.findIndex((invite) => invite.token === token);
  if (index < 0) return;
  file.invites[index] = {
    ...file.invites[index]!,
    used_at: getClock().now().toISOString(),
  };
  saveInvites(file);
}
