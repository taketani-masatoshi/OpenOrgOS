import { validateAll } from "../lib/data.js";

export function runValidate(): void {
  const result = validateAll();

  if (result.ok) {
    console.log("✓ All data files are valid.");
    process.exit(0);
  }

  console.error("✗ Validation failed:");
  for (const err of result.errors) {
    console.error(`  ${err.file}: ${err.message}`);
  }
  process.exit(1);
}
