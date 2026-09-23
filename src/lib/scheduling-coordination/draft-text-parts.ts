import type {
  SchedulingCase,
  SchedulingParticipant,
} from "../../../schemas/executive/scheduling-cases.js";
import type { CorrespondenceStyle } from "../correspondence/style-resolve.js";

export type DraftTextParts = {
  caseRow: SchedulingCase;
  targetParticipant?: SchedulingParticipant;
  subjectBase: string;
  tone: { proposalClosing?: string; reminderClosing?: string; confirmClosing?: string };
  style: CorrespondenceStyle;
  en: boolean;
  slots: string;
  greeting: string;
  opener: string;
  selfIntro: string;
  signature: string;
  formatLabel?: string;
  purposeLine: string;
  cost?: string;
  access?: string;
};
