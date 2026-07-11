import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  answerCeoInline,
  applyCeoInlineAnswerSideEffects,
  loadCeoInlineQueue,
} from "../src/lib/correspondence/ceo-inline-question.js";
import { ensureSchedulingCeoConfirmQuestion } from "../src/lib/scheduling-coordination/ceo-confirm.js";
import { applyNextAction } from "../src/lib/scheduling-coordination/next-action.js";
import { findSchedulingCase, upsertSchedulingCase } from "../src/lib/scheduling-coordination/store.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  cleanupSchedulingTenant,
  schedulingCase,
  seedSchedulingTenant,
} from "./helpers/scheduling-fixture.js";

const tenantId = "test-scheduling-ceo";

describe("scheduling CEO decisions", () => {
  beforeEach(() => seedSchedulingTenant(tenantId));
  afterEach(() => cleanupSchedulingTenant(tenantId));

  it("persists CEO rejection as an explicit reproposal and consumes one queue item", async () => {
    const base = schedulingCase("SCH-2026-704", 2);
    const awaiting = upsertSchedulingCase(
      applyNextAction({
        ...base,
        participants: base.participants.map((participant) => ({
          ...participant,
          response: "accept",
          accepted_slot_id: "SLOT-001",
        })),
      })
    );
    const question = ensureSchedulingCeoConfirmQuestion(awaiting)!;
    const answered = answerCeoInline(
      question.id,
      { schedule_ceo_choice: "再提案" },
      "ceo-test"
    );
    await applyCeoInlineAnswerSideEffects(answered);

    expect(findSchedulingCase(awaiting.id)).toMatchObject({
      status: "proposing",
      proposed_slots: [],
    });
    expect(findSchedulingCase(awaiting.id)?.ceo_question_id).toBeUndefined();
    expect(loadCeoInlineQueue().questions.filter((item) => item.id === question.id)).toHaveLength(1);
    const raw = YAML.parse(
      readFileSync(join(getDataDir(), "executive", "ceo-inline-questions.yaml"), "utf-8")
    );
    expect(raw.questions.find((item: { id: string }) => item.id === question.id).status).toBe(
      "answered"
    );
  });
});
