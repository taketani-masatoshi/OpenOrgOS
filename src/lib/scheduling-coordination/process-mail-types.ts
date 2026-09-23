export interface ProcessScheduleMailResult {
  mail_id: string;
  case_id?: string;
  action: "linked" | "updated" | "skipped" | "unlinked";
  reason?: string;
}
