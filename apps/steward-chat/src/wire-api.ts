import type { TenantSummary } from "@wire-console/api";

export async function fetchWireTenants(): Promise<TenantSummary[]> {
  const res = await fetch("/console/v1/tenants", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`tenants ${res.status}`);
  }
  const body = (await res.json()) as { ok: boolean; tenants: TenantSummary[] };
  return body.tenants;
}
