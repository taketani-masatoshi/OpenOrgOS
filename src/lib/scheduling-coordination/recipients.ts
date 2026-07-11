import type { SchedulingCase, SchedulingParticipant } from "../../../schemas/executive/scheduling-cases.js";
import type { SchedulingDraftKind } from "./draft-text.js";

export interface SchedulingRecipients {
  to: string;
  cc?: string;
  targetParticipant?: SchedulingParticipant;
}

function emails(participants: SchedulingParticipant[]): string[] {
  return participants.map((p) => p.email).filter(Boolean) as string[];
}

export function resolveSchedulingRecipients(
  caseRow: SchedulingCase,
  kind: SchedulingDraftKind,
  targetParticipantId?: string
): SchedulingRecipients {
  const externals = caseRow.participants.filter((p) => p.role === "external" && p.email);
  const internals = caseRow.participants.filter((p) => p.role === "internal" && p.email);
  const target = targetParticipantId
    ? caseRow.participants.find((p) => p.id === targetParticipantId)
    : undefined;

  if (target?.role === "external" && target.email) {
    return {
      to: target.email,
      cc:
        kind === "reminder"
          ? undefined
          : emails(internals).length
            ? emails(internals).join(", ")
            : undefined,
      targetParticipant: target,
    };
  }

  if (kind === "reminder") {
    const pending = caseRow.participants.filter((p) => p.response === "pending" && p.email);
    if (pending.length === 1 && pending[0]!.email) {
      return { to: pending[0]!.email, targetParticipant: pending[0] };
    }
  }

  if (kind === "proposal") {
    return {
      to: externals.length === 1 ? emails(externals)[0]! : "",
      cc: emails(internals).length ? emails(internals).join(", ") : undefined,
    };
  }

  if (kind === "confirm") {
    return {
      to: externals.length === 1 ? emails(externals)[0]! : "",
      cc: emails(internals).length ? emails(internals).join(", ") : undefined,
    };
  }

  return {
    to: emails(externals).join(", "),
    cc: emails(internals).length ? emails(internals).join(", ") : undefined,
  };
}

export function listReminderTargets(caseRow: SchedulingCase): SchedulingParticipant[] {
  const eligible = new Set(caseRow.reminder_targets);
  return caseRow.participants.filter(
    (p) => p.response === "pending" && p.email && eligible.has(p.id)
  );
}
