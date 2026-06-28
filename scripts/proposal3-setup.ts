#!/usr/bin/env node
/**
 * Proposal 3 setup — PKI init + print daemon install hints.
 */
import { runProtocolTlsInitProposal3 } from "../src/commands/protocol.js";
import { ROOT_DIR } from "../src/lib/tenant.js";
import { join } from "node:path";

runProtocolTlsInitProposal3({});

console.log("\n--- 常駐デーモン（開発） ---");
console.log("  Org C API:  npm run proposal3:org-c-api");
console.log("  MAL relay:  npm run proposal3:party-relay -- mal");
console.log("  SW relay:   npm run proposal3:party-relay -- southwood");
console.log("\n--- systemd（Linux · Org C サーバ） ---");
console.log(`  sudo cp ${join(ROOT_DIR, "deploy/proposal3/systemd/steward-org-c-api.service")} /etc/systemd/system/`);
console.log(`  sudo cp ${join(ROOT_DIR, "deploy/proposal3/env/org-c-api.generated.env")} /etc/steward/org-c-api.env`);
console.log("  sudo systemctl enable --now steward-org-c-api");
console.log("\n--- launchd（macOS · Mac mini 当事者） ---");
console.log(`  cp ${join(ROOT_DIR, "deploy/proposal3/launchd/com.steward.party-relay.plist")} ~/Library/LaunchAgents/`);
console.log("  launchctl load ~/Library/LaunchAgents/com.steward.party-relay.plist");
