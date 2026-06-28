/** Parse --tenant before other modules resolve getDataDir() / getDocsDir(). */
import { setTenantEnv } from "./lib/orgos-cli.js";

const args = process.argv;
const idx = args.indexOf("--tenant");
if (idx >= 0 && args[idx + 1]) {
  setTenantEnv(args[idx + 1]!);
}
