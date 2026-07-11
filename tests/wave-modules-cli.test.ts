// @catalog-ids: professional_services, saas_subscription, property_management, software_outsourcing, real_estate_brokerage, venture_capital, membership, staffing, ecommerce, event_operations
import { beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { listModuleCliBundles } from "../src/lib/module-cli.js";
import { getModuleSeedDir, loadModuleManifest } from "../src/lib/modules.js";
import { validateSkillRegistryFiles } from "../src/lib/skill-registry.js";
import { readYamlFile } from "../src/lib/utils.js";
import {
  brokerageDealsFileSchema,
  ecommerceOrdersFileSchema,
  eventOpsEventsFileSchema,
  eventOpsRunOfShowFileSchema,
  membershipMembersFileSchema,
  membershipPlansFileSchema,
  pmServiceRequestsFileSchema,
  psProjectsFileSchema,
  saasPlansFileSchema,
  saasSubscriptionsFileSchema,
  staffingAssignmentsFileSchema,
  swMilestonesFileSchema,
  swSowContractsFileSchema,
  vcFundsFileSchema,
  vcPortfolioFileSchema,
} from "../schemas/business-modules.js";
import { runProfessionalServicesShow } from "../steward/modules/professional_services/cli/lib.js";
import { runSaasSubscriptionShow } from "../steward/modules/saas_subscription/cli/lib.js";
import { runPropertyManagementShow } from "../steward/modules/property_management/cli/lib.js";
import { runSoftwareOutsourcingShow } from "../steward/modules/software_outsourcing/cli/lib.js";
import { runRealEstateBrokerageShow } from "../steward/modules/real_estate_brokerage/cli/lib.js";
import { runVentureCapitalShow } from "../steward/modules/venture_capital/cli/lib.js";
import { runMembershipShow } from "../steward/modules/membership/cli/lib.js";
import { runStaffingShow } from "../steward/modules/staffing/cli/lib.js";
import { runEcommerceShow } from "../steward/modules/ecommerce/cli/lib.js";
import { runEventOperationsShow } from "../steward/modules/event_operations/cli/lib.js";

const WAVE_MODULE_IDS = [
  "professional_services",
  "saas_subscription",
  "property_management",
  "software_outsourcing",
  "real_estate_brokerage",
  "venture_capital",
  "membership",
  "staffing",
  "ecommerce",
  "event_operations",
] as const;

function captureJsonShow(run: (opts: { json?: boolean }) => void): Record<string, unknown> {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  run({ json: true });
  const raw = spy.mock.calls[0]?.[0];
  spy.mockRestore();
  expect(typeof raw).toBe("string");
  return JSON.parse(String(raw));
}

describe("Wave 1–3 module CLI", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("registers all wave modules on operations CLI", () => {
    const ids = listModuleCliBundles().map((b) => b.moduleId);
    for (const id of WAVE_MODULE_IDS) {
      expect(ids).toContain(id);
    }
  });

  it("has manifest and co-located skill registry for each wave module", () => {
    expect(validateSkillRegistryFiles()).toEqual([]);
    for (const id of WAVE_MODULE_IDS) {
      const manifest = loadModuleManifest(id);
      expect(manifest?.id).toBe(id);
    }
  });

  it("Wave 1 show loads seed data on mal tenant", () => {
    const ps = captureJsonShow(runProfessionalServicesShow);
    expect(ps.module).toBe("professional_services");
    expect(ps.total).toBeGreaterThan(0);

    const saas = captureJsonShow(runSaasSubscriptionShow);
    expect(saas.module).toBe("saas_subscription");
    expect(saas.plans).toBeGreaterThan(0);

    const pm = captureJsonShow(runPropertyManagementShow);
    expect(pm.module).toBe("property_management");
    expect(pm.open_requests).toBeGreaterThanOrEqual(0);
  });

  it("Wave 2 show loads seed data on mal tenant", () => {
    const sw = captureJsonShow(runSoftwareOutsourcingShow);
    expect(sw.module).toBe("software_outsourcing");
    expect(sw.milestones).toBeGreaterThan(0);

    const brokerage = captureJsonShow(runRealEstateBrokerageShow);
    expect(brokerage.module).toBe("real_estate_brokerage");
    expect(brokerage.deals).toBeGreaterThan(0);

    const vc = captureJsonShow(runVentureCapitalShow);
    expect(vc.module).toBe("venture_capital");
    expect(vc.portfolio_companies).toBeGreaterThan(0);
  });

  it("Wave 3 show loads seed data on mal tenant", () => {
    const membership = captureJsonShow(runMembershipShow);
    expect(membership.module).toBe("membership");
    expect(membership.members).toBeGreaterThan(0);

    const staffing = captureJsonShow(runStaffingShow);
    expect(staffing.module).toBe("staffing");
    expect(staffing.assignments).toBeGreaterThan(0);

    const ecommerce = captureJsonShow(runEcommerceShow);
    expect(ecommerce.module).toBe("ecommerce");
    expect(ecommerce.orders).toBeGreaterThan(0);

    const events = captureJsonShow(runEventOperationsShow);
    expect(events.module).toBe("event_operations");
    expect(events.events).toBeGreaterThan(0);
  });

  it("business-modules schemas parse wave seed files", () => {
    readYamlFile(join(getModuleSeedDir("professional_services"), "projects.yaml"), psProjectsFileSchema);
    readYamlFile(join(getModuleSeedDir("saas_subscription"), "plans.yaml"), saasPlansFileSchema);
    readYamlFile(
      join(getModuleSeedDir("saas_subscription"), "subscriptions.yaml"),
      saasSubscriptionsFileSchema
    );
    readYamlFile(
      join(getModuleSeedDir("property_management"), "service-requests.yaml"),
      pmServiceRequestsFileSchema
    );
    readYamlFile(join(getModuleSeedDir("software_outsourcing"), "milestones.yaml"), swMilestonesFileSchema);
    readYamlFile(
      join(getModuleSeedDir("software_outsourcing"), "sow-contracts.yaml"),
      swSowContractsFileSchema
    );
    readYamlFile(join(getModuleSeedDir("real_estate_brokerage"), "deals.yaml"), brokerageDealsFileSchema);
    readYamlFile(join(getModuleSeedDir("venture_capital"), "funds.yaml"), vcFundsFileSchema);
    readYamlFile(join(getModuleSeedDir("venture_capital"), "portfolio.yaml"), vcPortfolioFileSchema);
    readYamlFile(join(getModuleSeedDir("membership"), "members.yaml"), membershipMembersFileSchema);
    readYamlFile(join(getModuleSeedDir("membership"), "plans.yaml"), membershipPlansFileSchema);
    readYamlFile(join(getModuleSeedDir("staffing"), "assignments.yaml"), staffingAssignmentsFileSchema);
    readYamlFile(join(getModuleSeedDir("ecommerce"), "orders.yaml"), ecommerceOrdersFileSchema);
    readYamlFile(join(getModuleSeedDir("event_operations"), "events.yaml"), eventOpsEventsFileSchema);
    readYamlFile(
      join(getModuleSeedDir("event_operations"), "run_of_show.yaml"),
      eventOpsRunOfShowFileSchema
    );
  });
});