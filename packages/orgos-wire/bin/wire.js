#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const r = spawnSync("orgos", ["wire", ...args], { stdio: "inherit" });
process.exit(r.status ?? 1);
