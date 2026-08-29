import {
  daysUntil,
  isModuleEnabled,
  loadModuleDataFile,
} from "../../../../src/lib/module-business-data.js";
import {
  clinicAppointmentsFileSchema,
  clinicDepartmentsFileSchema,
  type ClinicAppointment,
  type ClinicDepartment,
} from "./schema.js";

export const MODULE_ID = "clinic";

/** Statuses that still hold a slot — cancelled / no_show release it. */
const BOOKED_STATUSES = new Set(["confirmed", "scheduled", "rescheduled"]);
const ACTIVE_STATUS = "active";
const UNRESOLVED_DEPARTMENT = "(unknown department)";

function loadAppointments(): { appointments: ClinicAppointment[]; asOf?: string } | null {
  const file = loadModuleDataFile(MODULE_ID, "appointments.yaml", clinicAppointmentsFileSchema);
  if (!file) return null;
  return { appointments: file.data.appointments, asOf: file.data.as_of };
}

function loadDepartments(): ClinicDepartment[] | null {
  const file = loadModuleDataFile(MODULE_ID, "departments.yaml", clinicDepartmentsFileSchema);
  return file ? file.data.departments : null;
}

function isActive(department: ClinicDepartment): boolean {
  return (department.status ?? ACTIVE_STATUS) === ACTIVE_STATUS;
}

/** The ledger `as_of` anchors "upcoming"; today is the fallback. */
function ledgerDate(asOf?: string): string {
  return asOf ?? new Date().toISOString().slice(0, 10);
}

function isUpcoming(appointment: ClinicAppointment, from: string): boolean {
  if (!BOOKED_STATUSES.has(appointment.status)) return false;
  return appointment.date !== undefined && appointment.date >= from;
}

function departmentNames(departments: ClinicDepartment[]): Map<string, string> {
  return new Map(departments.map((department) => [department.id, department.name]));
}

interface UpcomingAppointment {
  id: string;
  date: string;
  time: string | null;
  patient_id: string | null;
  department_id: string | null;
  department: string;
  status: string;
  days_until: number;
}

function resolveUpcoming(
  appointments: ClinicAppointment[],
  departments: ClinicDepartment[],
  from: string
): UpcomingAppointment[] {
  const names = departmentNames(departments);
  return appointments
    .filter((appointment) => isUpcoming(appointment, from))
    .map((appointment) => ({
      id: appointment.id,
      date: appointment.date as string,
      time: appointment.time ?? null,
      patient_id: appointment.patient_id ?? null,
      department_id: appointment.department_id ?? null,
      department: appointment.department_id
        ? (names.get(appointment.department_id) ?? UNRESOLVED_DEPARTMENT)
        : UNRESOLVED_DEPARTMENT,
      status: appointment.status,
      days_until: daysUntil(appointment.date as string, new Date(`${from}T00:00:00Z`)),
    }))
    .sort((a, b) => `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`));
}

export function runClinicShow(opts: { json?: boolean }): void {
  const ledger = loadAppointments();
  const departments = loadDepartments() ?? [];
  const appointments = ledger?.appointments ?? [];
  const from = ledgerDate(ledger?.asOf);
  const active = departments.filter(isActive);

  const summary = {
    module: MODULE_ID,
    enabled: isModuleEnabled(MODULE_ID),
    as_of: ledger?.asOf ?? null,
    appointments: appointments.length,
    upcoming: appointments.filter((appointment) => isUpcoming(appointment, from)).length,
    departments: departments.length,
    active_departments: active.length,
    slots_per_day: active.reduce((total, department) => total + (department.slots_per_day ?? 0), 0),
  };

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# clinic\n`);
  console.log(
    `appointments: ${summary.appointments} · upcoming (from ${from}): ${summary.upcoming}`
  );
  console.log(
    `departments: ${summary.departments} · active: ${summary.active_departments} · slots/day: ${summary.slots_per_day}`
  );
}

export function runClinicValidate(): void {
  const issues: string[] = [];
  const ledger = loadAppointments();
  const departments = loadDepartments();

  if (!ledger) issues.push("appointments.yaml missing");
  if (!departments) issues.push("departments.yaml missing");

  const known = new Set((departments ?? []).map((department) => department.id));
  for (const appointment of ledger?.appointments ?? []) {
    if (!appointment.department_id) {
      issues.push(`${appointment.id}: department_id missing`);
      continue;
    }
    if (!known.has(appointment.department_id)) {
      issues.push(`${appointment.id}: unknown department_id ${appointment.department_id}`);
    }
  }

  if (issues.length) {
    console.error("✗ clinic:");
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }

  console.log(
    `✓ clinic — ${ledger?.appointments.length ?? 0} appointments · ${departments?.length ?? 0} departments OK`
  );
  if (!isModuleEnabled(MODULE_ID)) {
    console.log("note: module not enabled in this tenant — catalog seed validated");
  }
}

export function runClinicAppointments(opts: { json?: boolean }): void {
  const ledger = loadAppointments();
  const departments = loadDepartments();
  if (!ledger || !departments) {
    console.error("clinic: appointments.yaml / departments.yaml not found");
    process.exit(1);
    return;
  }

  const from = ledgerDate(ledger.asOf);
  const rows = resolveUpcoming(ledger.appointments, departments, from);

  if (opts.json) {
    console.log(JSON.stringify({ module: MODULE_ID, from, appointments: rows }, null, 2));
    return;
  }

  console.log(`# Upcoming appointments (from ${from})\n`);
  if (!rows.length) {
    console.log("(no booked appointments on or after the ledger date)");
    return;
  }
  for (const row of rows) {
    const time = row.time ? ` ${row.time}` : "";
    const patient = row.patient_id ? ` · patient ${row.patient_id}` : "";
    console.log(
      `- ${row.id} · ${row.date}${time} · ${row.department} (${row.department_id ?? "—"})${patient} · ${row.status} (${row.days_until}d)`
    );
  }
  console.log(`\n${rows.length} booked appointment(s)`);
}
