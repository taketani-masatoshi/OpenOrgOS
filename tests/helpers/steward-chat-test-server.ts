import {
  startStewardChatServerAsync,
  type StewardChatServerHandle,
  type StewardChatServerOptions,
} from "../../src/lib/steward-chat/server.js";

/** Bind Steward Chat on an ephemeral port — avoids Wire/Hub port collisions in tiered runs. */
export async function startStewardChatForTest(
  opts: Omit<StewardChatServerOptions, "port"> = {}
): Promise<StewardChatServerHandle> {
  return startStewardChatServerAsync({ host: "127.0.0.1", port: 0, ...opts });
}
