/**
 * Proposal 3 / Wire relay setup — wraps tls init + deploy env + daemon smoke hint.
 */
export async function runWireSetup(opts?: { force?: boolean; json?: boolean }): Promise<void> {
  const { runProtocolTlsInitProposal3 } = await import("./protocol.js");
  runProtocolTlsInitProposal3({ force: opts?.force, json: opts?.json });
  if (opts?.json) return;
  console.log("\n--- Wire (Proposal 3) ---");
  console.log("  npm run proposal3:daemon-smoke   # pre-flight");
  console.log("  npm run proposal3:org-c-api");
  console.log("  npm run proposal3:party-relay -- <tenant>");
  console.log("  orgos wire console start");
  console.log("\nDocs: deploy/proposal3/README.md");
}

export async function runWireConsoleBuild(): Promise<void> {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync("npm", ["run", "wire-console:build"], {
    stdio: "inherit",
    shell: true,
    cwd: (await import("../lib/orgos-paths.js")).getInstallRoot(),
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log("✓ Wire Console SPA built");
}
