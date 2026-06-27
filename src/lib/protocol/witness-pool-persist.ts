import {
  witnessPoolConfigSchema,
  type WitnessHubEntry,
  type WitnessPoolConfig,
} from "../../../schemas/protocol/witness-pool.js";
import { writeYamlFile } from "../utils.js";
import { getWitnessPoolYamlPath } from "./paths.js";

export interface WriteWitnessPoolConfigInput {
  hubs: WitnessHubEntry[];
  quorum?: WitnessPoolConfig["quorum"];
  register_on?: WitnessPoolConfig["register_on"];
  wire_governance_policy?: WitnessPoolConfig["wire_governance_policy"];
}

export function writeWitnessPoolConfig(input: WriteWitnessPoolConfigInput): {
  path: string;
  hubs: WitnessHubEntry[];
} {
  const config = witnessPoolConfigSchema.parse({
    enabled: true,
    quorum: input.quorum ?? { mode: "any_of_n" },
    register_on: input.register_on ?? "both",
    hubs: input.hubs,
    wire_governance_policy: input.wire_governance_policy,
  });
  const path = getWitnessPoolYamlPath();
  writeYamlFile(path, config);
  return { path, hubs: input.hubs };
}
