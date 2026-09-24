import {
  auditCliMutation,
  requireCliDataWrite,
  setCliOperatorContext,
} from "../console-auth/cli-operator.js";
import { authenticateOperator } from "../console-auth/operator-rbac.js";
import {
  answerCeoInline,
  applyCeoInlineAnswerSideEffects,
  loadCeoInlineQueue,
} from "../correspondence/ceo-inline-question.js";
import { approveAndSendSchedulingProposals } from "./approve-send-proposals.js";
import { injectAndProcessScheduleAcceptReply } from "./inject-schedule-reply-mail.js";
import {
  assertSchedulingRehearsalComplete,
  type RehearsalAssertionReport,
} from "./rehearsal-assertions.js";
import { openSchedulingCase, proposeSchedulingCaseSlots } from "./case-mutations.js";
import {
  collectOperationalReadinessIssues,
  ensureOperatorAuthEnv,
} from "./operational-readiness.js";
import { withRehearsalMailOverlayAsync } from "./rehearsal-mail-overlay.js";
import { formatSchedulingCaseSummary } from "./draft-text.js";
import { advanceSchedulingWorkflow } from "./workflow.js";
import { findSchedulingCase } from "./store.js";
import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";

export interface SchedulingRehearsalParticipant {
  name: string;
  email: string;
}

export interface SchedulingRehearsalOptions {
  full?: boolean;
  dryRunSmtp?: boolean;
  operatorId?: string;
  title?: string;
  participants?: SchedulingRehearsalParticipant[];
  from?: string;
  to?: string;
  setupOnly?: boolean;
  skipValidate?: boolean;
  json?: boolean;
}

export interface SchedulingRehearsalResult {
  ok: boolean;
  case_id?: string;
  ceo_question_id?: string;
  processed_mail_ids?: string[];
  readiness?: ReturnType<typeof collectOperationalReadinessIssues>;
  assertions?: RehearsalAssertionReport;
  steps: string[];
  error?: string;
}

const DEFAULT_PARTICIPANTS: SchedulingRehearsalParticipant[] = [
  { name: "テストA", email: "test-a@scheduling.mal" },
  { name: "テストB", email: "test-b@scheduling.mal" },
];

function prepareOperatorContext(operatorId: string): void {
  ensureOperatorAuthEnv(operatorId);
  const auth = authenticateOperator({
    operatorId,
    key: process.env.ORGOS_OPERATOR_KEY,
  });
  if ("error" in auth) {
    throw new Error(auth.error);
  }
  setCliOperatorContext(auth);
}

function createCase(opts: SchedulingRehearsalOptions): SchedulingCase {
  requireCliDataWrite({ command: "executive scheduling rehearsal", permission: "scheduling:write" });
  const caseRow = openSchedulingCase({
    title: opts.title ?? "CLIフルリハーサル",
    participants: opts.participants ?? DEFAULT_PARTICIPANTS,
    searchFrom: opts.from ?? "2026-07-16",
    searchTo: opts.to ?? "2026-07-28",
    actor: "cli",
  });
  auditCliMutation("executive scheduling rehearsal", caseRow.id);
  return caseRow;
}

function proposeCase(caseId: string): SchedulingCase {
  requireCliDataWrite({ command: "executive scheduling rehearsal", permission: "scheduling:write" });
  return proposeSchedulingCaseSlots({ id: caseId });
}

async function answerCeoForCase(caseId: string, operatorId: string): Promise<string> {
  const question = loadCeoInlineQueue().questions.find(
    (q) => q.scheduling_case_id === caseId && q.status === "pending"
  );
  if (!question) throw new Error(`No pending CEO question for ${caseId}`);

  requireCliDataWrite({ command: "executive scheduling rehearsal", permission: "escalate:plan" });
  const updated = answerCeoInline(question.id, { schedule_ceo_choice: "はい（確定・通知送信）" }, operatorId);
  await applyCeoInlineAnswerSideEffects(updated);
  return question.id;
}

export async function runSchedulingRehearsalCore(
  opts: SchedulingRehearsalOptions
): Promise<SchedulingRehearsalResult> {
  const operatorId = opts.operatorId ?? "OP-001";
  const steps: string[] = [];
  const processedMailIds: string[] = [];

  const readiness = collectOperationalReadinessIssues({
    repairApprovals: true,
    ensureMailConfig: true,
    syncOperatorKeys: true,
    repairOperatorKeys: true,
  });
  steps.push("doctor-repair");

  prepareOperatorContext(operatorId);
  steps.push("operator-auth");

  if (opts.setupOnly || !opts.full) {
    return { ok: readiness.ready, readiness, steps };
  }

  const runFlow = async (): Promise<SchedulingRehearsalResult> => {
    const created = createCase(opts);
    steps.push(`new:${created.id}`);

    const proposed = proposeCase(created.id);
    steps.push(`propose:${proposed.proposed_slots.length}`);

    const sentDrafts = await approveAndSendSchedulingProposals({
      caseId: created.id,
      operatorId,
      dryRun: true,
      command: "executive scheduling rehearsal",
    });
    steps.push(`approve-send:${sentDrafts.length}`);

    const participants = opts.participants ?? DEFAULT_PARTICIPANTS;
    for (const [index, participant] of participants.entries()) {
      const mailId = `MSG-REH-${index}-${participant.email.replace(/[^a-z0-9]/gi, "-")}-${Date.now()}`;
      await injectAndProcessScheduleAcceptReply({
        caseId: created.id,
        participantName: participant.name,
        participantEmail: participant.email,
        mailId,
      });
      processedMailIds.push(mailId);
      steps.push(`process-mail:${participant.email}`);
    }

    const afterReplies = findSchedulingCase(created.id);
    if (afterReplies?.next_action === "ceo_confirm") {
      advanceSchedulingWorkflow(created.id);
      steps.push("advance:ceo_confirm");
    }

    const ceoId = await answerCeoForCase(created.id, operatorId);
    steps.push(`ceo-answer:${ceoId}`);

    const assertions = assertSchedulingRehearsalComplete({
      caseId: created.id,
      processedMailIds,
      runValidate: opts.skipValidate !== true,
    });
    if (!assertions.ok) {
      const failed = assertions.checks.filter((c) => !c.ok).map((c) => c.id);
      throw new Error(`Rehearsal assertions failed: ${failed.join(", ")}`);
    }
    steps.push("assertions:ok");

    return {
      ok: true,
      case_id: created.id,
      ceo_question_id: ceoId,
      processed_mail_ids: processedMailIds,
      readiness,
      assertions,
      steps,
    };
  };

  if (opts.dryRunSmtp !== false) {
    return withRehearsalMailOverlayAsync(runFlow);
  }
  return runFlow();
}

export function formatRehearsalSummary(result: SchedulingRehearsalResult): string {
  if (!result.case_id) {
    return result.readiness?.ready
      ? "✓ Scheduling rehearsal setup ready"
      : "✗ Scheduling rehearsal setup incomplete";
  }
  const caseRow = findSchedulingCase(result.case_id);
  const lines = [caseRow ? formatSchedulingCaseSummary(caseRow) : `✓ ${result.case_id} closed`];
  if (result.assertions) {
    lines.push("", "Assertions:");
    for (const check of result.assertions.checks) {
      lines.push(`  ${check.ok ? "✓" : "✗"} ${check.id}: ${check.detail}`);
    }
  }
  return lines.join("\n");
}
