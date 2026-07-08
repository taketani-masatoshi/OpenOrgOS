import { removeWireConsoleWitnessPoolConfig } from "../tests/helpers/wire-console-witness-fixture.js";
import { resetWireConsoleTestTenant } from "../tests/helpers/wire-console-test-fixture.js";

export default async function globalTeardown(): Promise<void> {
  resetWireConsoleTestTenant();
  removeWireConsoleWitnessPoolConfig();
}
