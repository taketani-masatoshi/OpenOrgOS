import { isModuleEnabled, loadModuleDataFile } from "../../../../src/lib/module-business-data.js";
import {
  isMenuItemAvailable,
  restaurantMenuFileSchema,
  restaurantTablesFileSchema,
  UNCATEGORISED_LABEL,
  UNZONED_LABEL,
  type RestaurantMenuItem,
  type RestaurantTable,
} from "./schema.js";

export const MODULE_ID = "restaurant";

const PERCENT = 100;

function loadMenu() {
  return loadModuleDataFile(MODULE_ID, "menu.yaml", restaurantMenuFileSchema);
}

function loadTables() {
  return loadModuleDataFile(MODULE_ID, "tables.yaml", restaurantTablesFileSchema);
}

interface ZoneCapacityView {
  zone: string;
  tables: number;
  seats: number;
}

interface MenuCategoryView {
  category: string;
  items: number;
  available: number;
  min_price_yen?: number;
  max_price_yen?: number;
  food_cost_pct?: number;
}

interface SeatingView {
  zones: ZoneCapacityView[];
  tables_total: number;
  seats_total: number;
  categories: MenuCategoryView[];
  menu_available: number;
}

function zoneOf(table: RestaurantTable): string {
  return table.zone ?? UNZONED_LABEL;
}

function categoryOf(item: RestaurantMenuItem): string {
  return item.category ?? UNCATEGORISED_LABEL;
}

function buildZoneCapacity(tables: RestaurantTable[]): ZoneCapacityView[] {
  const zones = [...new Set(tables.map(zoneOf))].sort((a, b) => a.localeCompare(b));
  return zones.map((zone) => {
    const own = tables.filter((table) => zoneOf(table) === zone);
    return {
      zone,
      tables: own.length,
      seats: own.reduce((total, table) => total + table.seats, 0),
    };
  });
}

function foodCostPct(items: RestaurantMenuItem[]): number | undefined {
  const priced = items.filter((item) => item.cost_yen !== undefined && item.price_yen);
  if (!priced.length) return undefined;
  const revenue = priced.reduce((total, item) => total + (item.price_yen ?? 0), 0);
  const cost = priced.reduce((total, item) => total + (item.cost_yen ?? 0), 0);
  return revenue > 0 ? (cost / revenue) * PERCENT : undefined;
}

function buildMenuCategory(category: string, items: RestaurantMenuItem[]): MenuCategoryView {
  const prices = items
    .map((item) => item.price_yen)
    .filter((price): price is number => price !== undefined);
  return {
    category,
    items: items.length,
    available: items.filter(isMenuItemAvailable).length,
    min_price_yen: prices.length ? Math.min(...prices) : undefined,
    max_price_yen: prices.length ? Math.max(...prices) : undefined,
    food_cost_pct: foodCostPct(items),
  };
}

/** Seat capacity by zone plus the on-sale menu grouped by category. */
export function buildSeatingView(
  tables: RestaurantTable[],
  items: RestaurantMenuItem[]
): SeatingView {
  const categories = [...new Set(items.map(categoryOf))].sort((a, b) => a.localeCompare(b));
  return {
    zones: buildZoneCapacity(tables),
    tables_total: tables.length,
    seats_total: tables.reduce((total, table) => total + table.seats, 0),
    categories: categories.map((category) =>
      buildMenuCategory(
        category,
        items.filter((item) => categoryOf(item) === category)
      )
    ),
    menu_available: items.filter(isMenuItemAvailable).length,
  };
}

export function runRestaurantShow(opts: { json?: boolean }): void {
  const menu = loadMenu();
  const tables = loadTables();
  const summary = {
    module: MODULE_ID,
    enabled: isModuleEnabled(MODULE_ID),
    tables: tables?.data.tables.length ?? 0,
    seats: tables?.data.tables.reduce((total, table) => total + table.seats, 0) ?? 0,
    menu_items: menu?.data.items.length ?? 0,
    menu_available: menu?.data.items.filter(isMenuItemAvailable).length ?? 0,
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# restaurant\n`);
  console.log(`tables: ${summary.tables} · seats: ${summary.seats}`);
  console.log(`menu items: ${summary.menu_items} · available: ${summary.menu_available}`);
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

export function runRestaurantValidate(): void {
  const issues: string[] = [];
  if (!isModuleEnabled(MODULE_ID)) issues.push("module not enabled");
  const menu = loadMenu();
  const tables = loadTables();
  if (!menu) issues.push("menu.yaml missing");
  if (!tables) issues.push("tables.yaml missing");
  if (menu) {
    for (const id of collectDuplicateIds(menu.data.items.map((item) => item.id))) {
      issues.push(`menu.yaml: duplicate item id ${id}`);
    }
    for (const item of menu.data.items) {
      if (item.price_yen === undefined) issues.push(`${item.id}: price_yen missing`);
    }
  }
  if (tables) {
    for (const id of collectDuplicateIds(tables.data.tables.map((table) => table.id))) {
      issues.push(`tables.yaml: duplicate table id ${id}`);
    }
  }

  if (issues.length) {
    console.error("✗ restaurant:");
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }
  console.log("✓ restaurant — menu/tables OK");
}

function formatPriceRange(category: MenuCategoryView): string {
  if (category.min_price_yen === undefined || category.max_price_yen === undefined) {
    return "価格未設定";
  }
  const min = `¥${category.min_price_yen.toLocaleString()}`;
  if (category.min_price_yen === category.max_price_yen) return min;
  return `${min}–¥${category.max_price_yen.toLocaleString()}`;
}

function printSeating(view: SeatingView): void {
  console.log("# Restaurant — seating capacity & on-sale menu\n");
  console.log(`tables: ${view.tables_total} · seats: ${view.seats_total}\n`);
  console.log("## Zones");
  for (const zone of view.zones) {
    console.log(`- ${zone.zone} · ${zone.tables} tables · ${zone.seats} seats`);
  }
  if (!view.zones.length) console.log("- (no table recorded)");
  console.log("\n## Menu by category");
  for (const category of view.categories) {
    const cost =
      category.food_cost_pct === undefined
        ? "food cost 未算出（cost_yen なし）"
        : `food cost ${category.food_cost_pct.toFixed(1)}%`;
    console.log(
      `- ${category.category} · ${category.available}/${category.items} available · ${formatPriceRange(category)} · ${cost}`
    );
  }
  if (!view.categories.length) console.log("- (no menu item recorded)");
  console.log(
    "\nNote: turnover per table needs covers/reservations data, which this seed contract does not carry."
  );
}

export function runRestaurantSeating(opts: { json?: boolean }): void {
  const tables = loadTables();
  if (!tables) {
    console.error("tables.yaml not found");
    process.exit(1);
  }
  const menu = loadMenu();
  const view = buildSeatingView(tables.data.tables, menu?.data.items ?? []);
  if (opts.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  printSeating(view);
}
