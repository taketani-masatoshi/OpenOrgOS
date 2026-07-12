import {
  formatWireLiveVerifyReport,
  runWireLiveVerify,
} from "../lib/protocol/wire-live-verify.js";

export interface WireLiveVerifyCommandOptions {
  tenant?: string;
  publicBaseUrl?: string;
  roundtrip?: boolean;
  strictEmailWire?: boolean;
  json?: boolean;
  noEvidence?: boolean;
}

export async function runWireLiveVerifyCommand(
  opts: WireLiveVerifyCommandOptions = {}
): Promise<void> {
  const tenant = opts.tenant ?? process.env.ORGOS_TENANT ?? "mal";
  const roundtrip =
    opts.roundtrip === true || process.env.ORGOS_LIVE_VERIFY_ROUNDTRIP === "1";
  const strictEmailWire =
    opts.strictEmailWire === true ||
    process.env.ORGOS_LIVE_VERIFY_STRICT_EMAIL === "1";
  const result = await runWireLiveVerify({
    tenant,
    publicBaseUrl: opts.publicBaseUrl,
    writeEvidence: !opts.noEvidence,
    roundtrip,
    strictEmailWire,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatWireLiveVerifyReport(result));
  }
  if (!result.ok) process.exit(1);
}
