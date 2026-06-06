import { loadProperties } from "../lib/data.js";
import type { PropertyType } from "../../cursor/schemas/index.js";
import { formatCurrency } from "../lib/utils.js";

export function runPropertiesList(options: { type?: string }): void {
  let properties = loadProperties();

  if (options.type) {
    properties = properties.filter((p) => p.type === options.type);
  }

  if (properties.length === 0) {
    console.log("物件が見つかりません。");
    return;
  }

  console.log(
    "ID".padEnd(10) +
      "Name".padEnd(30) +
      "Type".padEnd(10) +
      "Location".padEnd(30) +
      "Price"
  );
  console.log("-".repeat(90));

  for (const p of properties) {
    console.log(
      p.id.padEnd(10) +
        p.name.slice(0, 28).padEnd(30) +
        p.type.padEnd(10) +
        p.location.slice(0, 28).padEnd(30) +
        (p.acquisition_price ? formatCurrency(p.acquisition_price) : "-")
    );
  }
}

export function runPropertiesShow(id: string): void {
  const property = loadProperties().find((p) => p.id === id);

  if (!property) {
    console.error(`物件 ${id} が見つかりません。`);
    process.exit(1);
  }

  console.log(JSON.stringify(property, null, 2));
}

export const PROPERTY_TYPES: PropertyType[] = ["rental", "hotel", "mixed"];
