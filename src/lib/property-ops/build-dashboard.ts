/**
 * Compose Property Operations Dashboard (Bancho / Kamezawa).
 * Path: src/lib/property-ops/build-dashboard.ts
 * ADR: docs/adr/0072-property-ops-dashboard.md
 *
 * L1 only — no guest names, secrets, policy numbers, or document bodies.
 */
import { existsSync } from "node:fs";
import {
  propertyOpsDashboardSchema,
  type PropertyOpsBulletinRow,
  type PropertyOpsCard,
  type PropertyOpsDashboard,
  type PropertyOpsDueRow,
  type PropertyOpsInsuranceRow,
  type PropertyOpsPermitRow,
} from "../../../schemas/property-ops-dashboard.js";
import { permitRegistryFileSchema } from "../../../schemas/jp-permit-registry.js";
import type { Property } from "../../../schemas/property.js";
import {
  computeStayMetrics,
  defaultHospitalityPropertyId,
  listHospitalityOpsDue,
  loadStays,
} from "../../../steward/modules/hospitality/cli/ops-lib.js";
import { validateGuestRegister } from "../../../steward/modules/hospitality/cli/guest-register.js";
import { computeRentalPlanMetrics } from "../../../steward/modules/rental/cli/plan-metrics.js";
import {
  loadProperties,
  loadPropertyRevenuePlan,
} from "../data.js";
import { loadRiskInsurance } from "../extension-sot.js";
import { loadEnabledModulesSafe } from "../modules.js";
import { loadModuleDataFile } from "../module-business-data.js";
import { listTasks } from "../tasks/store.js";
import { getTenantId, resolveTenantPath } from "../tenant.js";
import { currentDate, daysBetween, readYamlFile } from "../utils.js";
import { facilityPublicSchema } from "../../../schemas/operations.js";
import { buildTodayContext } from "../steward-chat/today-context.js";

function companyNameSafe(): string {
  try {
    return buildTodayContext().company_name;
  } catch {
    return getTenantId();
  }
}

function modulePropertyMap(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const mod of loadEnabledModulesSafe()) {
    if (!mod.enabled || !mod.property_ids?.length) continue;
    for (const pid of mod.property_ids) {
      const cur = map.get(pid) ?? [];
      if (!cur.includes(mod.id)) cur.push(mod.id);
      map.set(pid, cur);
    }
  }
  return map;
}

function hospitalityPropertyIds(): Set<string> {
  const ids = new Set<string>();
  for (const mod of loadEnabledModulesSafe()) {
    if (mod.enabled && mod.id === "hospitality") {
      for (const id of mod.property_ids ?? []) ids.add(id);
    }
  }
  if (ids.size === 0) ids.add(defaultHospitalityPropertyId());
  return ids;
}

function loadFacilityForProperty(propertyId: string) {
  const mod = loadEnabledModulesSafe().find(
    (m) =>
      m.enabled &&
      m.operations_public &&
      m.property_ids?.includes(propertyId),
  );
  if (!mod?.operations_public) return undefined;
  try {
    const path = resolveTenantPath(mod.operations_public);
    if (!existsSync(path)) return undefined;
    const pub = readYamlFile(path, facilityPublicSchema);
    if (pub.property_id !== propertyId) return undefined;
    return pub;
  } catch {
    return undefined;
  }
}

function insuranceForProperty(
  property: Property,
  today: string,
): PropertyOpsInsuranceRow[] {
  const file = loadRiskInsurance();
  const policies = file?.policies ?? [];
  const nameHint = property.name.slice(0, 2);
  const matched = policies.filter((p) => {
    const blob = `${p.id} ${p.name}`.toLowerCase();
    return (
      blob.includes(property.id.toLowerCase()) ||
      blob.includes(nameHint.toLowerCase()) ||
      (property.type === "hotel" && /旅館|宿|hotel|kamezawa|亀沢/.test(blob)) ||
      (property.type === "rental" && /賃貸|番町|bancho|rent/.test(blob))
    );
  });
  // No all-policy fallback — unmatched properties show empty insurance.
  const rows = matched.map((p) => {
    let severity: "p0" | "p1" | "p2" | undefined;
    if (p.renews_on) {
      const days = daysBetween(today, p.renews_on);
      if (days < 0) severity = "p0";
      else if (days <= 30) severity = "p0";
      else if (days <= 90) severity = "p1";
      else severity = "p2";
    }
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      renews_on: p.renews_on,
      severity,
    };
  });
  return rows;
}

function permitsForProperty(propertyId: string): PropertyOpsPermitRow[] {
  try {
    const loaded = loadModuleDataFile(
      "jp_permit_registry",
      "permit-registry.yaml",
      permitRegistryFileSchema,
    );
    const permits = loaded?.data.permits ?? [];
    return permits
      .filter((p) => p.property_id === propertyId)
      .map((p) => {
        let severity: "p0" | "p1" | "p2" | undefined;
        if (p.status !== "active") severity = "p1";
        if (p.expires_on) {
          const days = daysBetween(currentDate(), p.expires_on);
          if (days < 0) severity = "p0";
          else if (days <= 90) severity = "p1";
        }
        return {
          id: p.id,
          permit_type_id: p.permit_type_id,
          status: p.status,
          issued_on: p.issued_on,
          expires_on: p.expires_on,
          severity,
        };
      });
  } catch {
    return [];
  }
}

function bulletinsForProperty(
  propertyId: string,
  docsRoot?: string,
): PropertyOpsBulletinRow[] {
  const facility = loadFacilityForProperty(propertyId);
  const rows: PropertyOpsBulletinRow[] = [];
  const docs = facility?.guest_docs;
  if (docs) {
    const entries: Array<[string, string | undefined]> = [
      ["house_rules", docs.house_rules_en],
      ["local_guide", docs.local_guide_en],
      ["welcome_sheet", docs.welcome_sheet],
    ];
    for (const [id, path] of entries) {
      if (!path) continue;
      const abs = resolveTenantPath(path);
      rows.push({
        id,
        label: id,
        path,
        present: existsSync(abs),
        href: "/stays/",
      });
    }
  }
  const noticeCandidates = [
    "templates/guest-facing/緊急時連絡・避難.md",
    "templates/guest-facing/house-rules.md",
    "templates/compliance/火災保険更新チェック.csv",
  ];
  if (docsRoot) {
    for (const rel of noticeCandidates) {
      const path = `${docsRoot.replace(/\/$/, "")}/${rel}`;
      const abs = resolveTenantPath(path);
      if (!existsSync(abs) && !rows.some((r) => r.path === path)) {
        // still list if parent templates dir exists
        const parent = resolveTenantPath(docsRoot);
        if (!existsSync(parent)) continue;
      }
      if (rows.some((r) => r.path === path)) continue;
      rows.push({
        id: rel.split("/").pop() ?? rel,
        label: rel.split("/").pop() ?? rel,
        path,
        present: existsSync(abs),
        href: "/stays/",
      });
    }
  }
  return rows.slice(0, 8);
}

function dueForProperty(
  propertyId: string,
  hospitalityIds: Set<string>,
  today: string,
): PropertyOpsDueRow[] {
  if (!hospitalityIds.has(propertyId)) {
    // rental: surface open executive tasks as due-like rows
    return listTasks()
      .filter((t) => t.property_id === propertyId)
      .slice(0, 12)
      .map((t) => ({
        id: t.id,
        kind: "task",
        title: t.title,
        due_on: t.due ?? today,
        severity:
          t.priority === "p0" ? "p0" : t.priority === "p1" ? "p1" : "p2",
        href: "/secretary/workbench/",
      }));
  }

  const stays = (() => {
    try {
      return loadStays().stays;
    } catch {
      return [];
    }
  })();
  const stayProp = new Map(stays.map((s) => [s.id, s.property_id]));

  const tenantHospitalityId = defaultHospitalityPropertyId();
  const items: PropertyOpsDueRow[] = [];
  try {
    for (const d of listHospitalityOpsDue(today)) {
      let belongs = false;
      if (d.kind === "tax" || d.kind === "register" || d.kind === "nights_cap") {
        // Tenant-level hospitality due → default hospitality property only.
        belongs = propertyId === tenantHospitalityId;
      } else if (
        d.kind === "stay" ||
        d.kind === "cleaning" ||
        d.kind === "damage" ||
        d.kind === "id_doc"
      ) {
        const stayId =
          /STAY-\d{4}-\d+/i.exec(d.id)?.[0] ??
          /STAY-\d{4}-\d+/i.exec(d.title)?.[0];
        const pid = stayId ? stayProp.get(stayId) : undefined;
        belongs = pid === propertyId;
      }
      if (!belongs) continue;
      items.push({
        id: d.id,
        kind: d.kind,
        title: d.title,
        due_on: d.due_on,
        severity: d.severity,
        href: d.kind === "tax" ? "/?tax=1" : "/stays/",
      });
    }
  } catch {
    /* hospitality optional */
  }

  for (const t of listTasks().filter((x) => x.property_id === propertyId)) {
    items.push({
      id: t.id,
      kind: "task",
      title: t.title,
      due_on: t.due ?? today,
      severity: t.priority === "p0" ? "p0" : t.priority === "p1" ? "p1" : "p2",
      href: "/secretary/workbench/",
    });
  }

  return items
    .sort((a, b) => {
      const rank: Record<"p0" | "p1" | "p2", number> = { p0: 0, p1: 1, p2: 2 };
      const pr = rank[a.severity] - rank[b.severity];
      if (pr !== 0) return pr;
      return a.due_on.localeCompare(b.due_on);
    })
    .slice(0, 20);
}

function financeForProperty(property: Property, today: string) {
  const period = today.slice(0, 7);
  if (property.type === "rental" || property.rental) {
    try {
      const plan = loadPropertyRevenuePlan();
      const metrics = computeRentalPlanMetrics(plan, property.id);
      return {
        monthly_revenue: metrics?.monthlyRevenue ?? property.rental?.monthly_rent ?? null,
        annual_revenue: metrics?.annualRevenue ?? null,
        noi: metrics?.noi ?? null,
        monthly_rent: property.rental?.monthly_rent ?? null,
        vacancy_rate: property.rental?.vacancy_rate ?? null,
      };
    } catch {
      return {
        monthly_rent: property.rental?.monthly_rent ?? null,
        vacancy_rate: property.rental?.vacancy_rate ?? null,
      };
    }
  }
  try {
    const m = computeStayMetrics(period, property.id);
    return {
      occupancy: m.occupancy,
      adr: m.adr,
      revpar: m.revpar,
      monthly_revenue: m.revenue_jpy,
      stay_count: m.stay_count,
    };
  } catch {
    return {
      occupancy: property.hotel?.occupancy_rate ?? null,
      adr: property.hotel?.adr ?? null,
    };
  }
}

function registerForProperty(propertyId: string, hospitalityIds: Set<string>) {
  if (!hospitalityIds.has(propertyId)) return undefined;
  // Guest register is tenant-level — surface only on the default hospitality property.
  if (propertyId !== defaultHospitalityPropertyId()) return undefined;
  try {
    const result = validateGuestRegister();
    const errors = result.issues.filter((i) => i.level === "error").length;
    return {
      row_count: result.rowCount,
      issue_count: result.issues.length,
      error_count: errors,
      ok: result.issues.length === 0,
      href: "/stays/",
    };
  } catch {
    return {
      row_count: 0,
      issue_count: 0,
      error_count: 0,
      ok: true,
      href: "/stays/",
    };
  }
}

function buildCard(
  property: Property,
  moduleIds: string[],
  hospitalityIds: Set<string>,
  today: string,
): PropertyOpsCard {
  const mod = loadEnabledModulesSafe().find(
    (m) => m.enabled && m.property_ids?.includes(property.id),
  );
  const due = dueForProperty(property.id, hospitalityIds, today);
  const facility = loadFacilityForProperty(property.id);
  const insurance = insuranceForProperty(property, today);
  const register = registerForProperty(property.id, hospitalityIds);
  const dueP0 = due.filter((d) => d.severity === "p0");
  const next_actions: PropertyOpsCard["next_actions"] = [];
  if (dueP0.length > 0) {
    next_actions.push({
      id: "due_p0",
      label: `P0 due → secretary`,
      href: "/secretary/workbench/",
    });
  }
  if (insurance.length === 0) {
    next_actions.push({
      id: "insurance",
      label: "Insurance unset — register via CLI/docs",
      href: "/properties/",
    });
  }
  if (register && !register.ok) {
    next_actions.push({
      id: "register",
      label: "Guest register issues",
      href: register.href,
    });
  }
  return {
    property_id: property.id,
    name: property.name,
    location: property.location,
    type: property.type,
    module_ids: moduleIds,
    due,
    due_p0: dueP0.length,
    insurance,
    permits: permitsForProperty(property.id),
    bulletins: bulletinsForProperty(property.id, mod?.docs_root),
    finance: financeForProperty(property, today),
    register,
    facility: facility
      ? {
          check_in: facility.check_in,
          check_out: facility.check_out,
          max_guests: facility.max_guests,
        }
      : undefined,
    open_tasks: listTasks().filter((t) => t.property_id === property.id).length,
    href: `/properties/?id=${encodeURIComponent(property.id)}`,
    next_actions,
  };
}

export function buildPropertyOpsDashboard(opts?: {
  propertyId?: string;
  today?: string;
}): PropertyOpsDashboard {
  const today = opts?.today?.trim() || currentDate();
  const propMap = modulePropertyMap();
  const hospitalityIds = hospitalityPropertyIds();
  let properties = loadProperties().filter((p) => propMap.has(p.id));
  if (opts?.propertyId) {
    properties = properties.filter((p) => p.id === opts.propertyId);
  }
  // Prefer Bancho then Kamezawa order for MAL
  properties = [...properties].sort((a, b) => a.id.localeCompare(b.id));

  const cards = properties.map((p) =>
    buildCard(p, propMap.get(p.id) ?? [], hospitalityIds, today),
  );

  return propertyOpsDashboardSchema.parse({
    ok: true,
    tenant: getTenantId(),
    report_date: today,
    company_name: companyNameSafe(),
    properties: cards,
  });
}
