/**
 * Deterministic GVP reporting due-date helpers.
 */
import {
  GVP_REPORT_LEAD_DAYS,
  type MedicalDeviceAeSeriousness,
} from "../../../schemas/jp-medical-device.js";

export function addCalendarDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function gvpReportDueOn(
  receivedOn: string,
  seriousness: MedicalDeviceAeSeriousness
): string {
  return addCalendarDays(receivedOn, GVP_REPORT_LEAD_DAYS[seriousness]);
}
