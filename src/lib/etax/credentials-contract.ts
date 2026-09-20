/**
 * Tip credential layout contract (T-O4 / fix #6).
 * Does not invent secrets — only checks gitignore + example schema + no PIN in tracked YAML.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { getInstallRoot } from "../orgos-paths.js";
import { ETAX_SPEC_RELATIVE_DIR } from "./constants.js";

const PIN_LIKE =
  /^\s*(pin|password|passwd|passphrase|private[_-]?key|pkcs12|p12)\s*:/im;

export type CredentialContractResult = {
  ok: boolean;
  blockers: string[];
};

function walkTrackedYaml(dir: string): string[] {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    let names: string[];
    try {
      names = readdirSync(cur);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name === "node_modules" || name === "vendor" || name === ".git") continue;
      const p = join(cur, name);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) stack.push(p);
      else if (/\.ya?ml$/i.test(name) && !name.endsWith(".example")) out.push(p);
    }
  }
  return out;
}

export function evaluateCredentialLayoutContract(
  installRoot = getInstallRoot(),
): CredentialContractResult {
  const blockers: string[] = [];
  const gitignore = join(installRoot, ".gitignore");
  if (!existsSync(gitignore)) {
    blockers.push(".gitignore missing");
  } else {
    const text = readFileSync(gitignore, "utf-8");
    if (!text.includes("data/etax/") && !text.includes("tenants/*/data/etax/credentials/")) {
      blockers.push(".gitignore must cover data/etax/ credentials paths");
    }
    if (!text.includes("tenants/*/data/etax/credentials/")) {
      blockers.push(".gitignore missing tenants/*/data/etax/credentials/");
    }
  }

  const example = join(
    installRoot,
    "steward/jurisdiction-packs/JP/modules/jp_etax/seed/credentials.yaml.example",
  );
  if (!existsSync(example)) {
    blockers.push("credentials.yaml.example missing");
  } else {
    const raw = readFileSync(example, "utf-8");
    if (PIN_LIKE.test(raw)) {
      blockers.push("credentials.yaml.example must not define PIN/password fields");
    }
    const doc = YAML.parse(raw) as {
      environments?: { test?: { certificate_ref?: unknown }; production?: { certificate_ref?: unknown } };
    };
    if (!doc?.environments?.test || !doc?.environments?.production) {
      blockers.push("credentials.yaml.example must declare environments.test and environments.production");
    }
  }

  const trackedRoots = [
    join(installRoot, ETAX_SPEC_RELATIVE_DIR),
    join(installRoot, "steward/jurisdiction-packs/JP/modules/jp_etax"),
  ];
  for (const root of trackedRoots) {
    if (!existsSync(root)) continue;
    for (const file of walkTrackedYaml(root)) {
      const text = readFileSync(file, "utf-8");
      if (PIN_LIKE.test(text)) {
        blockers.push(`tracked YAML must not contain PIN/password keys: ${file.replace(installRoot + "/", "")}`);
      }
    }
  }

  return { ok: blockers.length === 0, blockers };
}
