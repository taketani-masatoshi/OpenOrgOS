import type { AgentId } from "../../../../schemas/classification.js";
import type {
  ControlDefinition,
  ControlMaturity,
  EffectiveControl,
} from "../../../../schemas/control-framework.js";
import { listEffectiveRegulations } from "../../regulations.js";
import { loadApplicableIsoIds } from "../standards/tenant.js";
import { loadControlMaps } from "./maps.js";
import { loadTenantControlStatus } from "./tenant-store.js";

const MATURITY_ORDER: ControlMaturity[] = ["L0", "L1", "L2", "L3", "L4"];

export function maturityRank(level: ControlMaturity): number {
  return MATURITY_ORDER.indexOf(level);
}

export function isMaturityBelow(current: ControlMaturity, target: ControlMaturity): boolean {
  return maturityRank(current) < maturityRank(target);
}

function isControlIsoInScope(control: ControlDefinition, enabledIso: string[]): boolean {
  return control.iso_refs.some((ref) => enabledIso.includes(ref.standard));
}

function isControlRegInScope(control: ControlDefinition, effectiveRegIds: Set<string>): boolean {
  return (
    control.reg_refs.length === 0 || control.reg_refs.some((ref) => effectiveRegIds.has(ref.reg_id))
  );
}

export function listEffectiveControls(): EffectiveControl[] {
  const enabledIso = loadApplicableIsoIds();
  const effectiveRegIds = new Set(
    listEffectiveRegulations()
      .filter((regulation) => regulation.effective)
      .map((regulation) => regulation.id)
  );
  const statusMap = loadTenantControlStatus();
  return loadControlMaps(enabledIso).map((control) => {
    const status = statusMap.get(control.id);
    return {
      ...control,
      in_scope:
        isControlIsoInScope(control, enabledIso) && isControlRegInScope(control, effectiveRegIds),
      tenant_maturity: status?.maturity ?? "L0",
      last_reviewed: status?.last_reviewed,
      notes: status?.notes,
    };
  });
}

export function controlsForAgent(agentId: AgentId): EffectiveControl[] {
  return listEffectiveControls().filter(
    (control) =>
      control.in_scope &&
      (control.primary_agent === agentId || control.secondary_agents?.includes(agentId))
  );
}
