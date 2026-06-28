#!/usr/bin/env node
import { runThreeOrgWireDemo } from "./lib/three-org-wire-demo.js";

runThreeOrgWireDemo().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
