import { isModuleEnabled, loadModuleDataFile } from "../../../../src/lib/module-business-data.js";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  retailSkusFileSchema,
  retailStoresFileSchema,
  SKU_STATUS_ACTIVE,
  STORE_STATUS_OPEN,
  type RetailSku,
  type RetailStore,
} from "./schema.js";

export const MODULE_ID = "retail_store";

const PERCENT = 100;
/** Group key for SKUs that are not bound to a store in skus.yaml. */
const UNASSIGNED_STORE_ID = "(unassigned)";

function loadStores() {
  return loadModuleDataFile(MODULE_ID, "stores.yaml", retailStoresFileSchema);
}

function loadSkus() {
  return loadModuleDataFile(MODULE_ID, "skus.yaml", retailSkusFileSchema);
}

interface SkuMarginView {
  id: string;
  name: string;
  price_yen?: number;
  cost_yen?: number;
  unit_margin_yen?: number;
  margin_pct?: number;
  stock_qty?: number;
  stock_at_cost_yen?: number;
  stock_at_retail_yen?: number;
  low_stock: boolean;
}

interface StoreMarginView {
  store_id: string;
  store_name: string;
  store_status?: string;
  skus: SkuMarginView[];
  stock_at_cost_yen: number;
  stock_at_retail_yen: number;
  potential_margin_yen: number;
  margin_pct?: number;
  low_stock_count: number;
}

function toSkuMarginView(sku: RetailSku, lowStockThreshold: number): SkuMarginView {
  const unitMargin =
    sku.price_yen !== undefined && sku.cost_yen !== undefined
      ? sku.price_yen - sku.cost_yen
      : undefined;
  const qty = sku.stock_qty;
  return {
    id: sku.id,
    name: sku.name,
    price_yen: sku.price_yen,
    cost_yen: sku.cost_yen,
    unit_margin_yen: unitMargin,
    margin_pct:
      unitMargin !== undefined && sku.price_yen
        ? (unitMargin / sku.price_yen) * PERCENT
        : undefined,
    stock_qty: qty,
    stock_at_cost_yen: qty !== undefined && sku.cost_yen !== undefined ? sku.cost_yen * qty : undefined,
    stock_at_retail_yen:
      qty !== undefined && sku.price_yen !== undefined ? sku.price_yen * qty : undefined,
    low_stock: qty !== undefined && qty <= lowStockThreshold,
  };
}

function sumBy(views: SkuMarginView[], pick: (view: SkuMarginView) => number | undefined): number {
  return views.reduce((total, view) => total + (pick(view) ?? 0), 0);
}

function toStoreMarginView(
  storeId: string,
  store: RetailStore | undefined,
  skus: SkuMarginView[]
): StoreMarginView {
  const atCost = sumBy(skus, (s) => s.stock_at_cost_yen);
  const atRetail = sumBy(skus, (s) => s.stock_at_retail_yen);
  return {
    store_id: storeId,
    store_name: store?.name ?? UNASSIGNED_STORE_ID,
    store_status: store?.status,
    skus,
    stock_at_cost_yen: atCost,
    stock_at_retail_yen: atRetail,
    potential_margin_yen: atRetail - atCost,
    margin_pct: atRetail > 0 ? ((atRetail - atCost) / atRetail) * PERCENT : undefined,
    low_stock_count: skus.filter((s) => s.low_stock).length,
  };
}

/** Active SKUs grouped by store with unit margin, stock value and low-stock flags. */
export function buildStoreMargins(
  stores: RetailStore[],
  skus: RetailSku[],
  opts: { storeFilter?: string; lowStockThreshold?: number } = {}
): StoreMarginView[] {
  const threshold = opts.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
  const byId = new Map(stores.map((store) => [store.id, store]));
  const active = skus.filter((sku) => sku.status === SKU_STATUS_ACTIVE);
  const groups = [...new Set(active.map((sku) => sku.store_id ?? UNASSIGNED_STORE_ID))];
  return groups
    .filter((storeId) => !opts.storeFilter || storeId === opts.storeFilter)
    .sort((a, b) => a.localeCompare(b))
    .map((storeId) =>
      toStoreMarginView(
        storeId,
        byId.get(storeId),
        active
          .filter((sku) => (sku.store_id ?? UNASSIGNED_STORE_ID) === storeId)
          .map((sku) => toSkuMarginView(sku, threshold))
      )
    );
}

export function runRetailStoreShow(opts: { json?: boolean }): void {
  const stores = loadStores();
  const skus = loadSkus();
  const active = skus?.data.skus.filter((s) => s.status === SKU_STATUS_ACTIVE) ?? [];
  const summary = {
    module: MODULE_ID,
    enabled: isModuleEnabled(MODULE_ID),
    stores: stores?.data.stores.length ?? 0,
    stores_open: stores?.data.stores.filter((s) => s.status === STORE_STATUS_OPEN).length ?? 0,
    skus: skus?.data.skus.length ?? 0,
    skus_active: active.length,
    low_stock: active.filter(
      (s) => s.stock_qty !== undefined && s.stock_qty <= DEFAULT_LOW_STOCK_THRESHOLD
    ).length,
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# retail_store\n`);
  console.log(`stores: ${summary.stores} · open: ${summary.stores_open}`);
  console.log(
    `skus: ${summary.skus} · active: ${summary.skus_active} · low stock (≤${DEFAULT_LOW_STOCK_THRESHOLD}): ${summary.low_stock}`
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

function checkSkuIntegrity(stores: RetailStore[], skus: RetailSku[]): string[] {
  const issues: string[] = [];
  const storeIds = new Set(stores.map((store) => store.id));
  for (const sku of skus) {
    if (sku.store_id && !storeIds.has(sku.store_id)) {
      issues.push(`${sku.id}: unknown store_id ${sku.store_id}`);
    }
    if (sku.status !== SKU_STATUS_ACTIVE) continue;
    if (sku.price_yen === undefined || sku.cost_yen === undefined) {
      issues.push(`${sku.id}: active sku without price_yen/cost_yen (margin not derivable)`);
    }
  }
  return issues;
}

export function runRetailStoreValidate(): void {
  const issues: string[] = [];
  if (!isModuleEnabled(MODULE_ID)) issues.push("module not enabled");
  const stores = loadStores();
  const skus = loadSkus();
  if (!stores) issues.push("stores.yaml missing");
  if (!skus) issues.push("skus.yaml missing");
  if (stores) {
    for (const id of collectDuplicateIds(stores.data.stores.map((s) => s.id))) {
      issues.push(`stores.yaml: duplicate store id ${id}`);
    }
  }
  if (skus) {
    for (const id of collectDuplicateIds(skus.data.skus.map((s) => s.id))) {
      issues.push(`skus.yaml: duplicate sku id ${id}`);
    }
  }
  if (stores && skus) issues.push(...checkSkuIntegrity(stores.data.stores, skus.data.skus));

  if (issues.length) {
    console.error("✗ retail_store:");
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }
  console.log("✓ retail_store — stores/skus OK");
}

function yen(value: number): string {
  return `¥${Math.round(value).toLocaleString()}`;
}

function formatSku(sku: SkuMarginView, threshold: number): string {
  const price = sku.price_yen === undefined ? "価格未設定" : yen(sku.price_yen);
  const margin =
    sku.unit_margin_yen === undefined
      ? "margin 未算出"
      : `margin ${yen(sku.unit_margin_yen)}${sku.margin_pct === undefined ? "" : ` (${sku.margin_pct.toFixed(1)}%)`}`;
  const stock =
    sku.stock_qty === undefined
      ? "stock 未設定"
      : `stock ${sku.stock_qty}${sku.low_stock ? ` ⚠ low ≤${threshold}` : ""}`;
  return `${sku.id} ${sku.name} · ${price} · ${margin} · ${stock}`;
}

function printStoreMargins(rows: StoreMarginView[], threshold: number): void {
  console.log("# Retail store — margin & stock by store\n");
  if (!rows.length) {
    console.log(`(no sku with status ${SKU_STATUS_ACTIVE})`);
    return;
  }
  for (const row of rows) {
    const status = row.store_status ? ` · ${row.store_status}` : "";
    console.log(`## ${row.store_id} ${row.store_name}${status}`);
    console.log(
      `   stock at cost ${yen(row.stock_at_cost_yen)} · at retail ${yen(row.stock_at_retail_yen)} · potential margin ${yen(row.potential_margin_yen)}${row.margin_pct === undefined ? "" : ` (${row.margin_pct.toFixed(1)}%)`}`
    );
    console.log(`   skus: ${row.skus.length} · low stock: ${row.low_stock_count}`);
    for (const sku of row.skus) console.log(`   - ${formatSku(sku, threshold)}`);
    console.log("");
  }
}

export function runRetailStoreMargin(opts: {
  store?: string;
  lowStock?: number;
  json?: boolean;
}): void {
  const skus = loadSkus();
  if (!skus) {
    console.error("skus.yaml not found");
    process.exit(1);
  }
  const threshold = opts.lowStock ?? DEFAULT_LOW_STOCK_THRESHOLD;
  const stores = loadStores();
  const rows = buildStoreMargins(stores?.data.stores ?? [], skus.data.skus, {
    storeFilter: opts.store,
    lowStockThreshold: threshold,
  });
  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  printStoreMargins(rows, threshold);
}
