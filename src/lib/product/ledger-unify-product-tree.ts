/**
 * Product SoT for ledger/tax lanes lives on this branch until merged to Core tip.
 * Parallel worktrees may exist for history; they are not the scoring tip.
 *
 * 更に厳格: complete requires files to exist AND be git-tracked (?? is incomplete).
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { getInstallRoot } from "../orgos-paths.js";

const REQUIRED_RELATIVE = [
  "src/lib/finance/filing/official-receipt.ts",
  "src/lib/finance/sole-prop-local-tax.ts",
  "src/lib/finance/sole-prop-consumption-tax.ts",
  "src/lib/finance/consumption-tax-return-rows.ts",
  "src/lib/product/tax-lines-read-model.ts",
  "schemas/finance/consumption-tax-return-map.ts",
  "src/lib/product/ledger-provision.ts",
  "src/lib/finance/ledger/companies-act-score.ts",
  "src/lib/finance/corporate-local-tax.ts",
] as const;

export type LedgerUnifyProductTreeStatus = {
  root: string;
  complete: boolean;
  missing: string[];
  untracked: string[];
};

function isGitTracked(root: string, relativePath: string): boolean {
  const result = spawnSync("git", ["ls-files", "--error-unmatch", "--", relativePath], {
    cwd: root,
    encoding: "utf-8",
  });
  return result.status === 0;
}

export function ledgerUnifyProductTreeStatus(
  root = getInstallRoot(),
): LedgerUnifyProductTreeStatus {
  const missing: string[] = [];
  const untracked: string[] = [];
  for (const rel of REQUIRED_RELATIVE) {
    if (!existsSync(join(root, rel))) {
      missing.push(rel);
      continue;
    }
    if (!isGitTracked(root, rel)) untracked.push(rel);
  }
  return {
    root,
    complete: missing.length === 0 && untracked.length === 0,
    missing,
    untracked,
  };
}

export function isLedgerUnifyProductTreeComplete(root = getInstallRoot()): boolean {
  return ledgerUnifyProductTreeStatus(root).complete;
}
