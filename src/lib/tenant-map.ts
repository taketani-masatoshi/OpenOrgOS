import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getTenantDir, getTenantId, resolveTenantPath } from "./tenant.js";
import { getInstallRoot, getSchemasDir } from "./orgos-paths.js";
import { loadEnabledModules, listCatalogModuleIds, STEWARD_MODULES_DIR } from "./modules.js";
import { readYamlFile } from "./utils.js";

export interface PathMapping {
  logical: string;
  absolute: string;
  scope: "tenant" | "framework";
}

export function listTenantPathMappings(): PathMapping[] {
  const tenantId = getTenantId();
  const tenantDir = getTenantDir();
  const rows: PathMapping[] = [
    { logical: `tenants/${tenantId}/`, absolute: tenantDir, scope: "tenant" },
    {
      logical: "data/company.yaml",
      absolute: resolveTenantPath("data/company.yaml"),
      scope: "tenant",
    },
    {
      logical: "data/ops-config.yaml",
      absolute: resolveTenantPath("data/ops-config.yaml"),
      scope: "tenant",
    },
    {
      logical: "data/classification-registry.yaml",
      absolute: resolveTenantPath("data/classification-registry.yaml"),
      scope: "tenant",
    },
    {
      logical: "data/dependency-graph.yaml",
      absolute: resolveTenantPath("data/dependency-graph.yaml"),
      scope: "tenant",
    },
    { logical: "modules.yaml", absolute: join(tenantDir, "modules.yaml"), scope: "tenant" },
  ];

  for (const modId of listCatalogModuleIds()) {
    rows.push({
      logical: `steward/modules/${modId}/`,
      absolute: join(STEWARD_MODULES_DIR, modId),
      scope: "framework",
    });
  }

  rows.push(
    { logical: "src/", absolute: join(getInstallRoot(), "src"), scope: "framework" },
    { logical: "schemas/", absolute: getSchemasDir(), scope: "framework" }
  );

  return rows;
}

export function resolveLogicalPath(logical: string): PathMapping {
  const normalized = logical.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized.startsWith("steward/modules/")) {
    const rest = normalized.slice("steward/modules/".length).replace(/\/$/, "");
    const modId = rest.split("/")[0] ?? rest;
    return {
      logical: normalized,
      absolute: join(STEWARD_MODULES_DIR, modId),
      scope: "framework",
    };
  }
  if (normalized.startsWith("data/") || normalized.startsWith("docs/")) {
    return {
      logical: normalized,
      absolute: resolveTenantPath(normalized),
      scope: "tenant",
    };
  }
  if (
    normalized === "modules.yaml" ||
    normalized === "regulations.yaml" ||
    normalized === "standards.yaml"
  ) {
    return {
      logical: normalized,
      absolute: join(getTenantDir(), normalized),
      scope: "tenant",
    };
  }
  return {
    logical: normalized,
    absolute: join(getInstallRoot(), normalized),
    scope: "framework",
  };
}

const graphNodeSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  category: z.string().optional(),
});

const graphEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
});

const dependencyGraphSchema = z.object({
  version: z.string().optional(),
  description: z.string().optional(),
  nodes: z.array(graphNodeSchema).default([]),
  edges: z.array(graphEdgeSchema).default([]),
});

export interface MapTreeNode {
  logical: string;
  absolute: string;
  scope: "tenant" | "framework";
  children?: MapTreeNode[];
}

export function loadTenantDependencyGraph() {
  const path = join(getTenantDir(), "data", "dependency-graph.yaml");
  if (!existsSync(path)) return { nodes: [], edges: [] };
  return readYamlFile(path, dependencyGraphSchema);
}

export function buildTenantMapTree(): MapTreeNode[] {
  const tenantId = getTenantId();
  const tenantDir = getTenantDir();
  const graph = loadTenantDependencyGraph();
  const enabled = loadEnabledModules();

  const moduleChildren: MapTreeNode[] = enabled.map((m) => ({
    logical: `modules.yaml → ${m.id}`,
    absolute: join(tenantDir, "modules.yaml"),
    scope: "tenant" as const,
    children: [
      ...(m.property_ids ?? []).map((pid) => ({
        logical: `data/properties/${pid}.yaml`,
        absolute: resolveTenantPath(`data/properties/${pid}.yaml`),
        scope: "tenant" as const,
      })),
      ...(m.billing
        ? Object.keys(m.billing).map((pid) => ({
            logical: `billing.${pid}.docs_base`,
            absolute: resolveTenantPath(m.billing![pid]!.docs_base),
            scope: "tenant" as const,
          }))
        : []),
    ],
  }));

  const graphChildren: MapTreeNode[] = graph.nodes.map((n) => ({
    logical: n.id,
    absolute:
      n.id.startsWith("data/") || n.id.startsWith("docs/")
        ? resolveTenantPath(n.id)
        : join(tenantDir, n.id),
    scope: "tenant" as const,
  }));

  return [
    {
      logical: `tenants/${tenantId}/`,
      absolute: tenantDir,
      scope: "tenant",
      children: [
        {
          logical: "data/",
          absolute: join(tenantDir, "data"),
          scope: "tenant",
          children: graphChildren.filter((n) => n.logical.startsWith("data/")),
        },
        {
          logical: "modules (enabled)",
          absolute: join(tenantDir, "modules.yaml"),
          scope: "tenant",
          children: moduleChildren,
        },
      ],
    },
  ];
}

export function formatMapTree(nodes: MapTreeNode[], indent = 0): string {
  const lines: string[] = [];
  for (const n of nodes) {
    const prefix = "  ".repeat(indent);
    lines.push(`${prefix}${n.logical} → ${n.absolute}`);
    if (n.children?.length) {
      lines.push(formatMapTree(n.children, indent + 1));
    }
  }
  return lines.join("\n");
}
