import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function readSeedYaml(seedDir: string, seedName: string): unknown {
  const candidates = [seedName];
  if (seedName.endsWith(".example")) {
    candidates.push(seedName.replace(/\.example$/, ""));
  } else if (seedName.endsWith(".yaml")) {
    candidates.push(`${seedName}.example`);
  }
  for (const name of candidates) {
    const path = join(seedDir, name);
    if (existsSync(path)) {
      return YAML.parse(readFileSync(path, "utf-8"));
    }
  }
  throw new Error(`seed file not found: ${seedName} under ${seedDir}`);
}

function readSeedText(seedDir: string, seedName: string): string {
  const path = join(seedDir, seedName);
  if (!existsSync(path)) throw new Error(`seed file not found: ${seedName}`);
  return readFileSync(path, "utf-8");
}

function entityAsOfSchema<T extends z.ZodTypeAny>(collectionKey: string, itemSchema: T) {
  return z
    .object({
      entity: z.string().min(1).optional(),
      as_of: isoDate.optional(),
      [collectionKey]: z.array(itemSchema).min(1),
    })
    .passthrough();
}

const clinicAppointmentsSchema = entityAsOfSchema(
  "appointments",
  z.object({
    id: z.string().min(1),
    patient_id: z.string().optional(),
    department_id: z.string().optional(),
    date: isoDate.optional(),
    status: z.string().min(1),
  })
);

const clinicDepartmentsSchema = entityAsOfSchema(
  "departments",
  z.object({ id: z.string().min(1), name: z.string().min(1), status: z.string().optional() })
);

export function validateClinicModuleSeeds(seedDir: string): void {
  clinicAppointmentsSchema.parse(readSeedYaml(seedDir, "appointments.yaml"));
  clinicDepartmentsSchema.parse(readSeedYaml(seedDir, "departments.yaml"));
}

const constructionSitesSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  sites: z
    .array(z.object({ id: z.string().min(1), name: z.string().min(1), status: z.string().min(1) }))
    .min(1),
});

const constructionPhasesSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  phases: z
    .array(
      z.object({
        id: z.string().min(1),
        site_id: z.string().min(1),
        name: z.string().min(1),
        status: z.string().min(1),
      })
    )
    .min(1),
});

export function validateConstructionModuleSeeds(seedDir: string): void {
  const sites = constructionSitesSchema.parse(readSeedYaml(seedDir, "sites.yaml"));
  const phases = constructionPhasesSchema.parse(readSeedYaml(seedDir, "phases.yaml"));
  const siteIds = new Set(sites.sites.map((s) => s.id));
  for (const phase of phases.phases) {
    if (!siteIds.has(phase.site_id)) {
      throw new Error(`phase ${phase.id} references unknown site_id ${phase.site_id}`);
    }
  }
}

const educationCoursesSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  courses: z
    .array(z.object({ id: z.string().min(1), name: z.string().min(1), status: z.string().min(1) }))
    .min(1),
});

const educationClassesSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  classes: z
    .array(
      z.object({
        id: z.string().min(1),
        course_id: z.string().min(1),
        name: z.string().min(1),
        status: z.string().min(1),
      })
    )
    .min(1),
});

export function validateEducationModuleSeeds(seedDir: string): void {
  const courses = educationCoursesSchema.parse(readSeedYaml(seedDir, "courses.yaml"));
  const classes = educationClassesSchema.parse(readSeedYaml(seedDir, "classes.yaml"));
  const courseIds = new Set(courses.courses.map((c) => c.id));
  for (const cls of classes.classes) {
    if (!courseIds.has(cls.course_id)) {
      throw new Error(`class ${cls.id} references unknown course_id ${cls.course_id}`);
    }
  }
}

const eventSpacesSchema = z.object({
  spaces: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        capacity: z.number().int().positive(),
        status: z.string().min(1),
      })
    )
    .min(1),
});

const eventBookingsSchema = z.object({
  bookings: z
    .array(
      z.object({
        id: z.string().min(1),
        space_id: z.string().min(1),
        date: isoDate,
        status: z.string().min(1),
      })
    )
    .min(1),
});

export function validateEventSpaceModuleSeeds(seedDir: string): void {
  const spaces = eventSpacesSchema.parse(readSeedYaml(seedDir, "spaces.yaml"));
  const bookings = eventBookingsSchema.parse(readSeedYaml(seedDir, "bookings.yaml"));
  const spaceIds = new Set(spaces.spaces.map((s) => s.id));
  for (const booking of bookings.bookings) {
    if (!spaceIds.has(booking.space_id)) {
      throw new Error(`booking ${booking.id} references unknown space_id ${booking.space_id}`);
    }
  }
}

const logisticsWarehousesSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  warehouses: z
    .array(z.object({ id: z.string().min(1), name: z.string().min(1), status: z.string().min(1) }))
    .min(1),
});

const logisticsShipmentsSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  shipments: z
    .array(
      z.object({
        id: z.string().min(1),
        origin: z.string().min(1),
        status: z.string().min(1),
      })
    )
    .min(1),
});

export function validateLogisticsModuleSeeds(seedDir: string): void {
  const warehouses = logisticsWarehousesSchema.parse(readSeedYaml(seedDir, "warehouses.yaml"));
  const shipments = logisticsShipmentsSchema.parse(readSeedYaml(seedDir, "shipments.yaml"));
  const warehouseIds = new Set(warehouses.warehouses.map((w) => w.id));
  for (const shipment of shipments.shipments) {
    if (!warehouseIds.has(shipment.origin)) {
      throw new Error(`shipment ${shipment.id} references unknown origin ${shipment.origin}`);
    }
  }
}

const retailStoresSchema = entityAsOfSchema(
  "stores",
  z.object({ id: z.string().min(1), name: z.string().min(1), status: z.string().min(1) })
);

const retailSkusSchema = entityAsOfSchema(
  "skus",
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    store_id: z.string().optional(),
    status: z.string().min(1),
  })
);

export function validateRetailStoreModuleSeeds(seedDir: string): void {
  retailStoresSchema.parse(readSeedYaml(seedDir, "stores.yaml"));
  retailSkusSchema.parse(readSeedYaml(seedDir, "skus.yaml"));
}

const jpDeclarationSeedSchema = z.object({
  schema_version: z.number().int().positive(),
  module_id: z.string().min(1),
  status: z.string().min(1),
});

const jpCarbonDeclarationSeedSchema = jpDeclarationSeedSchema.extend({
  module_id: z.literal("jp_carbon_neutral_2050"),
  baseline_year: z.number().int(),
  net_zero_year: z.literal(2050),
  interim_targets: z.array(z.object({ year: z.number().int(), reduction_pct: z.number() })).min(1),
});

const jpWomenDeclarationSeedSchema = jpDeclarationSeedSchema.extend({
  module_id: z.literal("jp_women_empowerment"),
  plan_type: z.string().min(1),
  plan_period: z.object({ from: isoDate, to: isoDate }),
});

const jpActionPlanSeedSchema = z.object({
  schema_version: z.number().int().positive(),
  module_id: z.string().min(1),
  as_of: isoDate,
  items: z.array(z.object({ id: z.string().min(1), title: z.string().min(1) })).min(1),
});

const jpPrivacyMetaSeedSchema = z.object({
  schema_version: z.number().int().positive(),
  module_id: z.literal("jp_privacy_policy"),
  status: z.string().min(1),
  version: z.string().min(1),
  regulation_ref: z.string().min(1),
});

function expectMinTemplateLength(body: string, min: number, label: string): void {
  if (body.trim().length < min) {
    throw new Error(`${label}: template body too short (${body.trim().length} < ${min})`);
  }
}

export function validateJpCarbonNeutral2050ModuleSeeds(seedDir: string): void {
  jpCarbonDeclarationSeedSchema.parse(readSeedYaml(seedDir, "declaration.yaml.example"));
  jpActionPlanSeedSchema.parse(readSeedYaml(seedDir, "action-plan.yaml.example"));
  expectMinTemplateLength(readSeedText(seedDir, "declaration-template.md.example"), 80, "declaration-template");
}

export function validateJpWomenEmpowermentModuleSeeds(seedDir: string): void {
  jpWomenDeclarationSeedSchema.parse(readSeedYaml(seedDir, "declaration.yaml.example"));
  jpActionPlanSeedSchema.parse(readSeedYaml(seedDir, "action-plan.yaml.example"));
  expectMinTemplateLength(readSeedText(seedDir, "declaration-template.md.example"), 80, "declaration-template");
}

export function validateJpPrivacyPolicyModuleSeeds(seedDir: string): void {
  jpPrivacyMetaSeedSchema.parse(readSeedYaml(seedDir, "policy-meta.yaml.example"));
  expectMinTemplateLength(readSeedText(seedDir, "privacy-policy-template.md.example"), 80, "privacy-policy-template");
}

export type CatalogSeedValidator = (seedDir: string) => void;

export const CATALOG_MODULE_SEED_VALIDATORS: Record<string, CatalogSeedValidator> = {
  clinic: validateClinicModuleSeeds,
  construction: validateConstructionModuleSeeds,
  education: validateEducationModuleSeeds,
  event_space: validateEventSpaceModuleSeeds,
  logistics: validateLogisticsModuleSeeds,
  retail_store: validateRetailStoreModuleSeeds,
  jp_carbon_neutral_2050: validateJpCarbonNeutral2050ModuleSeeds,
  jp_women_empowerment: validateJpWomenEmpowermentModuleSeeds,
  jp_privacy_policy: validateJpPrivacyPolicyModuleSeeds,
};
