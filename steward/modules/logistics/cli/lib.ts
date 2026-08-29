import {
  daysUntil,
  isModuleEnabled,
  loadModuleDataFile,
} from "../../../../src/lib/module-business-data.js";
import {
  logisticsShipmentsFileSchema,
  logisticsWarehousesFileSchema,
  SHIPMENT_STATUS_IN_TRANSIT,
  WAREHOUSE_STATUS_ACTIVE,
  type LogisticsShipment,
  type LogisticsWarehouse,
} from "./schema.js";

export const MODULE_ID = "logistics";

/** Origin id used when a shipment leaves from a warehouse that is not in the ledger. */
const UNKNOWN_WAREHOUSE_LABEL = "(unknown warehouse)";

function loadWarehouses() {
  return loadModuleDataFile(MODULE_ID, "warehouses.yaml", logisticsWarehousesFileSchema);
}

function loadShipments() {
  return loadModuleDataFile(MODULE_ID, "shipments.yaml", logisticsShipmentsFileSchema);
}

interface ShipmentSlaView {
  id: string;
  shipper_id?: string;
  destination?: string;
  scheduled_date?: string;
  days_to_sla?: number;
  overdue: boolean;
}

interface WarehouseLaneView {
  warehouse_id: string;
  warehouse_name: string;
  in_transit: ShipmentSlaView[];
  overdue: number;
}

function toShipmentSlaView(shipment: LogisticsShipment): ShipmentSlaView {
  const daysToSla = shipment.scheduled_date ? daysUntil(shipment.scheduled_date) : undefined;
  return {
    id: shipment.id,
    shipper_id: shipment.shipper_id,
    destination: shipment.destination,
    scheduled_date: shipment.scheduled_date,
    days_to_sla: daysToSla,
    overdue: daysToSla !== undefined && daysToSla < 0,
  };
}

function isInTransit(shipment: LogisticsShipment): boolean {
  return shipment.status === SHIPMENT_STATUS_IN_TRANSIT;
}

/** In-transit shipments with their SLA dates, grouped by the origin warehouse. */
export function buildWarehouseLanes(
  warehouses: LogisticsWarehouse[],
  shipments: LogisticsShipment[],
  warehouseFilter?: string
): WarehouseLaneView[] {
  const known = new Map(warehouses.map((w) => [w.id, w.name]));
  const origins = [...new Set(shipments.filter(isInTransit).map((s) => s.origin))];
  return origins
    .filter((origin) => !warehouseFilter || origin === warehouseFilter)
    .sort((a, b) => a.localeCompare(b))
    .map((origin) => {
      const inTransit = shipments
        .filter((s) => isInTransit(s) && s.origin === origin)
        .map(toShipmentSlaView);
      return {
        warehouse_id: origin,
        warehouse_name: known.get(origin) ?? UNKNOWN_WAREHOUSE_LABEL,
        in_transit: inTransit,
        overdue: inTransit.filter((s) => s.overdue).length,
      };
    });
}

export function runLogisticsShow(opts: { json?: boolean }): void {
  const warehouses = loadWarehouses();
  const shipments = loadShipments();
  const inTransit = shipments?.data.shipments.filter(isInTransit) ?? [];
  const summary = {
    module: MODULE_ID,
    enabled: isModuleEnabled(MODULE_ID),
    warehouses: warehouses?.data.warehouses.length ?? 0,
    warehouses_active:
      warehouses?.data.warehouses.filter((w) => w.status === WAREHOUSE_STATUS_ACTIVE).length ?? 0,
    shipments: shipments?.data.shipments.length ?? 0,
    in_transit: inTransit.length,
    sla_overdue: inTransit.filter((s) => toShipmentSlaView(s).overdue).length,
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# logistics\n`);
  console.log(
    `warehouses: ${summary.warehouses} · active: ${summary.warehouses_active}`
  );
  console.log(
    `shipments: ${summary.shipments} · in transit: ${summary.in_transit} · SLA overdue: ${summary.sla_overdue}`
  );
}

function collectDuplicateIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}

function checkShipmentIntegrity(
  warehouses: LogisticsWarehouse[],
  shipments: LogisticsShipment[]
): string[] {
  const issues: string[] = [];
  const warehouseIds = new Set(warehouses.map((w) => w.id));
  for (const shipment of shipments) {
    if (!warehouseIds.has(shipment.origin)) {
      issues.push(`${shipment.id}: unknown origin warehouse ${shipment.origin}`);
    }
    if (isInTransit(shipment) && !shipment.scheduled_date) {
      issues.push(`${shipment.id}: in_transit without scheduled_date (no SLA reference)`);
    }
  }
  return issues;
}

export function runLogisticsValidate(): void {
  const issues: string[] = [];
  if (!isModuleEnabled(MODULE_ID)) issues.push("module not enabled");
  const warehouses = loadWarehouses();
  const shipments = loadShipments();
  if (!warehouses) issues.push("warehouses.yaml missing");
  if (!shipments) issues.push("shipments.yaml missing");
  if (warehouses) {
    for (const id of collectDuplicateIds(warehouses.data.warehouses.map((w) => w.id))) {
      issues.push(`warehouses.yaml: duplicate warehouse id ${id}`);
    }
  }
  if (shipments) {
    for (const id of collectDuplicateIds(shipments.data.shipments.map((s) => s.id))) {
      issues.push(`shipments.yaml: duplicate shipment id ${id}`);
    }
  }
  if (warehouses && shipments) {
    issues.push(...checkShipmentIntegrity(warehouses.data.warehouses, shipments.data.shipments));
  }

  if (issues.length) {
    console.error("✗ logistics:");
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }
  console.log("✓ logistics — warehouses/shipments OK");
}

function formatShipment(shipment: ShipmentSlaView): string {
  const target = shipment.destination ?? "行先未設定";
  const shipper = shipment.shipper_id ? ` · shipper ${shipment.shipper_id}` : "";
  if (shipment.days_to_sla === undefined) return `${shipment.id} → ${target}${shipper} · SLA 未設定`;
  const sla = shipment.overdue
    ? `${Math.abs(shipment.days_to_sla)}d overdue`
    : `${shipment.days_to_sla}d left`;
  return `${shipment.id} → ${target}${shipper} · due ${shipment.scheduled_date} (${sla})`;
}

function printWarehouseLanes(lanes: WarehouseLaneView[]): void {
  console.log("# Logistics — in-transit shipments by warehouse\n");
  if (!lanes.length) {
    console.log(`(no shipment with status ${SHIPMENT_STATUS_IN_TRANSIT})`);
    return;
  }
  for (const lane of lanes) {
    console.log(`## ${lane.warehouse_id} ${lane.warehouse_name}`);
    console.log(`   in transit: ${lane.in_transit.length} · SLA overdue: ${lane.overdue}`);
    for (const shipment of lane.in_transit) console.log(`   - ${formatShipment(shipment)}`);
    console.log("");
  }
}

export function runLogisticsInTransit(opts: { warehouse?: string; json?: boolean }): void {
  const shipments = loadShipments();
  if (!shipments) {
    console.error("shipments.yaml not found");
    process.exit(1);
  }
  const warehouses = loadWarehouses();
  const lanes = buildWarehouseLanes(
    warehouses?.data.warehouses ?? [],
    shipments.data.shipments,
    opts.warehouse
  );
  if (opts.json) {
    console.log(JSON.stringify(lanes, null, 2));
    return;
  }
  printWarehouseLanes(lanes);
}
