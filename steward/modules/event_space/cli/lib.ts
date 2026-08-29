import { isModuleEnabled, loadModuleDataFile } from "../../../../src/lib/module-business-data.js";
import {
  eventSpaceBookingsFileSchema,
  eventSpaceSpacesFileSchema,
  type EventSpaceBooking,
  type EventSpaceSpace,
} from "./schema.js";

export const MODULE_ID = "event_space";

/** Statuses that occupy the room — cancelled / no_show release the slot. */
const BOOKED_STATUSES = new Set(["confirmed", "held"]);
const ACTIVE_STATUS = "active";
/** Standard bookable window per space-day (09:00–21:00) — utilization denominator. */
const BOOKABLE_HOURS_PER_DAY = 12;
const MINUTES_PER_HOUR = 60;
const PERCENT_SCALE = 100;
const ONE_DECIMAL = 10;

function loadSpaces(): EventSpaceSpace[] | null {
  const file = loadModuleDataFile(MODULE_ID, "spaces.yaml", eventSpaceSpacesFileSchema);
  return file ? file.data.spaces : null;
}

function loadBookings(): EventSpaceBooking[] | null {
  const file = loadModuleDataFile(MODULE_ID, "bookings.yaml", eventSpaceBookingsFileSchema);
  return file ? file.data.bookings : null;
}

function isBooked(booking: EventSpaceBooking): boolean {
  return BOOKED_STATUSES.has(booking.status);
}

function minutesSinceMidnight(clock: string): number {
  const [hours, minutes] = clock.split(":").map(Number);
  return hours * MINUTES_PER_HOUR + minutes;
}

/** Booked duration in hours; 0 when the slot has no usable start/end pair. */
export function bookingHours(booking: EventSpaceBooking): number {
  if (!booking.start_time || !booking.end_time) return 0;
  const span = minutesSinceMidnight(booking.end_time) - minutesSinceMidnight(booking.start_time);
  return span > 0 ? span / MINUTES_PER_HOUR : 0;
}

function round1(value: number): number {
  return Math.round(value * ONE_DECIMAL) / ONE_DECIMAL;
}

/** Distinct booked dates — the observation window every space is measured against. */
function bookingWindowDays(bookings: EventSpaceBooking[]): number {
  return new Set(bookings.filter(isBooked).map((booking) => booking.date)).size;
}

interface SpaceUtilization {
  space_id: string;
  space: string;
  status: string;
  bookings: number;
  booked_hours: number;
  bookable_hours: number;
  utilization_pct: number | null;
  revenue_yen: number | null;
}

function buildUtilization(
  spaces: EventSpaceSpace[],
  bookings: EventSpaceBooking[]
): SpaceUtilization[] {
  const windowDays = bookingWindowDays(bookings);
  const bookableHours = windowDays * BOOKABLE_HOURS_PER_DAY;

  return spaces
    .map((space) => {
      const own = bookings.filter((booking) => booking.space_id === space.id && isBooked(booking));
      const bookedHours = own.reduce((sum, booking) => sum + bookingHours(booking), 0);
      return {
        space_id: space.id,
        space: space.name,
        status: space.status,
        bookings: own.length,
        booked_hours: round1(bookedHours),
        bookable_hours: bookableHours,
        utilization_pct:
          bookableHours > 0
            ? round1((bookedHours / bookableHours) * PERCENT_SCALE)
            : null,
        revenue_yen:
          space.hourly_rate_yen === undefined
            ? null
            : Math.round(bookedHours * space.hourly_rate_yen),
      };
    })
    .sort((a, b) => a.space_id.localeCompare(b.space_id));
}

export function runEventSpaceShow(opts: { json?: boolean }): void {
  const spaces = loadSpaces() ?? [];
  const bookings = loadBookings() ?? [];
  const booked = bookings.filter(isBooked);

  const summary = {
    module: MODULE_ID,
    enabled: isModuleEnabled(MODULE_ID),
    spaces: spaces.length,
    active_spaces: spaces.filter((space) => space.status === ACTIVE_STATUS).length,
    bookings: bookings.length,
    booked: booked.length,
    booked_hours: round1(booked.reduce((sum, booking) => sum + bookingHours(booking), 0)),
    window_days: bookingWindowDays(bookings),
  };

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# event_space\n`);
  console.log(`spaces: ${summary.spaces} · active: ${summary.active_spaces}`);
  console.log(
    `bookings: ${summary.bookings} · booked: ${summary.booked} · hours: ${summary.booked_hours} over ${summary.window_days} day(s)`
  );
}

export function runEventSpaceValidate(): void {
  const issues: string[] = [];
  const spaces = loadSpaces();
  const bookings = loadBookings();

  if (!spaces) issues.push("spaces.yaml missing");
  if (!bookings) issues.push("bookings.yaml missing");

  const known = new Set((spaces ?? []).map((space) => space.id));
  for (const booking of bookings ?? []) {
    if (!known.has(booking.space_id)) {
      issues.push(`${booking.id}: unknown space_id ${booking.space_id}`);
    }
    if (!isBooked(booking)) continue;
    if (!booking.start_time || !booking.end_time) {
      issues.push(`${booking.id}: booked slot without start_time/end_time`);
      continue;
    }
    if (bookingHours(booking) <= 0) {
      issues.push(`${booking.id}: end_time ${booking.end_time} not after start_time ${booking.start_time}`);
    }
  }

  if (issues.length) {
    console.error("✗ event_space:");
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }

  console.log(
    `✓ event_space — ${spaces?.length ?? 0} spaces · ${bookings?.length ?? 0} bookings OK`
  );
  if (!isModuleEnabled(MODULE_ID)) {
    console.log("note: module not enabled in this tenant — catalog seed validated");
  }
}

export function runEventSpaceUtilization(opts: { json?: boolean }): void {
  const spaces = loadSpaces();
  const bookings = loadBookings();
  if (!spaces || !bookings) {
    console.error("event_space: spaces.yaml / bookings.yaml not found");
    process.exit(1);
    return;
  }

  const rows = buildUtilization(spaces, bookings);
  const total = {
    booked_hours: round1(rows.reduce((sum, row) => sum + row.booked_hours, 0)),
    bookable_hours: rows.reduce((sum, row) => sum + row.bookable_hours, 0),
    revenue_yen: rows.reduce((sum, row) => sum + (row.revenue_yen ?? 0), 0),
  };

  if (opts.json) {
    console.log(JSON.stringify({ module: MODULE_ID, spaces: rows, total }, null, 2));
    return;
  }

  console.log(
    `# Space utilization (${BOOKABLE_HOURS_PER_DAY}h/day over ${bookingWindowDays(bookings)} booked day(s))\n`
  );
  for (const row of rows) {
    const revenue = row.revenue_yen === null ? "—" : `¥${row.revenue_yen.toLocaleString("en-US")}`;
    console.log(
      `- ${row.space_id} · ${row.space} · ${row.bookings} booking(s) · ${row.booked_hours}/${row.bookable_hours}h · ${row.utilization_pct ?? "—"}% · ${revenue}`
    );
  }
  console.log(
    `\ntotal: ${total.booked_hours}/${total.bookable_hours}h · ¥${total.revenue_yen.toLocaleString("en-US")}`
  );
}
