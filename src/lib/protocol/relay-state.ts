import { existsSync } from "node:fs";
import { relayStateSchema, type RelayState } from "../../../schemas/protocol/relay-state.js";
import { getRelayStateYamlPath } from "./paths.js";
import { readYamlFile, writeYamlFile } from "../utils.js";

export function loadRelayState(): RelayState {
  const path = getRelayStateYamlPath();
  if (!existsSync(path)) {
    return relayStateSchema.parse({ cycles: 0, history: [] });
  }
  return readYamlFile(path, relayStateSchema);
}

export function saveRelayState(state: RelayState): void {
  writeYamlFile(getRelayStateYamlPath(), state);
}
