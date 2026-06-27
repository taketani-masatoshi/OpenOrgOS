import { join } from "node:path";
import { getDataDir } from "../utils.js";

export function getOrgDataDir(): string {
  return join(getDataDir(), "org");
}

export function getPendingApprovalsPath(): string {
  return join(getOrgDataDir(), "pending-approvals.yaml");
}
