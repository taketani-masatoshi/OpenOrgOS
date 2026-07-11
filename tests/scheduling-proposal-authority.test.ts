import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { processScheduleMailEntry } from "../src/lib/scheduling-coordination/process-mail.js";
import {
  ensureSchedulingCorrespondenceDrafts,
  maybeAutoSendAuthorizedProposals,
} from "../src/lib/scheduling-coordination/lifecycle.js";
import { findSchedulingCase, upsertSchedulingCase } from "../src/lib/scheduling-coordination/store.js";
import {
  clearOperatorsRegistryCacheForTests,
  loadOperatorRegistry,
  saveOperatorRegistry,
} from "../src/lib/org/operators.js";
import {
  cleanupSchedulingTenant,
  schedulingCase,
  schedulingTriage,
  seedSchedulingTenant,
} from "./helpers/scheduling-fixture.js";

const tenantId = "test-scheduling-proposal-authority";

describe("scheduling proposal send authority", () => {
  beforeEach(() => {
    seedSchedulingTenant(tenantId);
  });

  afterEach(() => {
    clearOperatorsRegistryCacheForTests();
    cleanupSchedulingTenant(tenantId);
  });

  it("clears stale authority and skips auto-send when the approver operator is disabled", async () => {
    const initial = upsertSchedulingCase({
      ...schedulingCase("SCH-2026-801", 2),
      status: "proposing",
      proposal_revision: 1,
      counter_round: 1,
      proposal_send_authority: {
        operator_id: "ceo-test",
        approver_name: "Test CEO",
        covers_up_to_revision: 0,
      },
    });
    ensureSchedulingCorrespondenceDrafts(initial.id, "proposal");

    const registry = loadOperatorRegistry()!;
    saveOperatorRegistry({
      ...registry,
      operators: registry.operators.map((operator) =>
        operator.operator_id === "ceo-test"
          ? { ...operator, status: "disabled" as const }
          : operator
      ),
    });
    clearOperatorsRegistryCacheForTests();

    const result = await maybeAutoSendAuthorizedProposals(initial.id);
    expect(result?.proposal_send_authority).toBeUndefined();
    expect(
      result?.correspondence.filter(
        (record) => record.kind === "proposal" && record.proposal_revision === 1
      )
    ).toHaveLength(2);
    expect(
      result?.correspondence
        .filter((record) => record.kind === "proposal" && record.proposal_revision === 1)
        .every((record) => !record.sent_at)
    ).toBe(true);
    expect(result?.status).toBe("proposing");
  });

  it("does not delegate reproposal at the third counter even with stored authority", async () => {
    const initial = upsertSchedulingCase({
      ...schedulingCase("SCH-2026-802", 2),
      status: "awaiting_responses",
      counter_round: 2,
      proposal_revision: 2,
      proposal_send_authority: {
        operator_id: "ceo-test",
        approver_name: "Test CEO",
        covers_up_to_revision: 2,
      },
      participants: schedulingCase("SCH-2026-802", 2).participants.map((participant) => ({
        ...participant,
        response: "counter" as const,
      })),
    });

    await processScheduleMailEntry(
      schedulingTriage({
        id: "MSG-COUNTER-3",
        caseId: initial.id,
        from: "Alice <alice@example.com>",
        fixture: "counter-slot.eml",
      })
    );

    const updated = findSchedulingCase(initial.id)!;
    expect(updated.counter_round).toBe(3);
    expect(updated.exception_reason).toBe("schedule_counter_limit");
    expect(updated.next_action).toBe("ceo_confirm");
    expect(updated.proposal_send_authority).toBeDefined();
    expect(
      updated.correspondence.filter(
        (record) => record.kind === "proposal" && record.proposal_revision === 3
      )
    ).toHaveLength(0);
  });
});
