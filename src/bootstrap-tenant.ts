/** Parse --tenant before other modules resolve DATA_DIR / DOCS_DIR. */
const args = process.argv;
const idx = args.indexOf("--tenant");
if (idx >= 0 && args[idx + 1]) {
  process.env.STEWARD_TENANT = args[idx + 1];
}
