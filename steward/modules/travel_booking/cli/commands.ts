import {
  buildRakutenSearchUrl,
  checkReg008Compliance,
  formatIntakeReport,
  getReg008LodgingLimit,
  getTravelPortal,
  loadTravelPortals,
  loadTravelRequestFromFile,
  resolveDefaultPortalId,
  validateTravelIntake,
  writeTravelDraft,
  type IntakeValidationResult,
} from "./lib.js";
import type { PortalId, TravelBookingRequest, TravelRole, TripType } from "../../../../schemas/travel-booking.js";

function buildPartialRequest(opts: TravelCliInput): Partial<TravelBookingRequest> {
  return {
    portal_id: opts.portal as PortalId | undefined,
    trip_type: opts.tripType as TripType | undefined,
    destination: opts.destination,
    destination_area: opts.area,
    check_in: opts.checkIn,
    check_out: opts.checkOut,
    guests: opts.guests,
    budget_max: opts.budget,
    trip_purpose: opts.purpose,
    room_preference: opts.room,
    traveler_role: opts.role as TravelRole | undefined,
    status: opts.dryRun ? "dry-run" : "draft",
    slug: opts.slug,
  };
}

interface TravelCliInput {
  portal?: string;
  tripType?: string;
  destination?: string;
  area?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  budget?: number;
  purpose?: string;
  room?: string;
  role?: string;
  slug?: string;
  dryRun?: boolean;
  file?: string;
}

function loadInput(opts: TravelCliInput): Partial<TravelBookingRequest> {
  if (opts.file) {
    const fromFile = loadTravelRequestFromFile(opts.file);
    return {
      ...fromFile,
      ...buildPartialRequest(opts),
      portal_id: (opts.portal as PortalId | undefined) ?? fromFile.portal_id,
      destination: opts.destination ?? fromFile.destination,
      destination_area: opts.area ?? fromFile.destination_area,
      check_in: opts.checkIn ?? fromFile.check_in,
      check_out: opts.checkOut ?? fromFile.check_out,
    };
  }
  return buildPartialRequest(opts);
}

export function runTravelPortals(opts: { json?: boolean }): void {
  const file = loadTravelPortals();
  if (!file) {
    console.error("travel-portals.yaml 未作成 — example をコピーしてください");
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(file, null, 2));
    return;
  }
  console.log(`default_portal: ${file.default_portal}\n`);
  for (const portal of file.portals) {
    console.log(`${portal.id}\t${portal.name}\t${portal.url}`);
    console.log(`  trip_types: ${portal.supported_trip_types.join(", ")}`);
    if (portal.notes) console.log(`  notes: ${portal.notes}`);
  }
}

export function runTravelIntake(opts: TravelCliInput & { json?: boolean }): void {
  const partial = loadInput(opts);
  if (!partial.portal_id) {
    partial.portal_id = resolveDefaultPortalId();
  }
  const result = validateTravelIntake(partial);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatIntakeReport(result));
  }
  exitOnIntakeFailure(result);
}

export function runTravelCheck(opts: {
  budget?: number;
  role?: string;
  tripType?: string;
  flightPreApproved?: boolean;
  json?: boolean;
}): void {
  const role = (opts.role as TravelRole | undefined) ?? "executive";
  const result = checkReg008Compliance({
    role,
    budgetMax: opts.budget,
    tripType: opts.tripType as TripType | undefined,
    flightPreApproved: opts.flightPreApproved,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`REG-008 宿泊上限（${role}）: ${result.lodgingLimit.toLocaleString()}円/泊`);
  if (opts.budget != null) {
    console.log(`指定予算: ${opts.budget.toLocaleString()}円/泊 → ${result.lodgingOk ? "OK" : "要承認"}`);
  }
  for (const msg of result.messages) {
    console.log(`- ${msg}`);
  }
}

export function runTravelDraft(opts: TravelCliInput & { write?: boolean; print?: boolean }): void {
  const partial = loadInput(opts);
  if (!partial.portal_id) {
    partial.portal_id = resolveDefaultPortalId();
  }
  const result = validateTravelIntake(partial);
  if (!result.ok || !result.request) {
    console.error(formatIntakeReport(result));
    process.exit(1);
  }

  const request = result.request;
  const portal = getTravelPortal(request.portal_id);
  let searchUrl: string | undefined;
  if (request.portal_id === "rakuten-travel" && request.trip_type === "hotel") {
    searchUrl = buildRakutenSearchUrl({
      checkIn: request.check_in,
      checkOut: request.check_out,
      guests: request.guests,
      budgetMax: request.budget_max ?? getReg008LodgingLimit(request.traveler_role),
    });
  }

  const { path, content, written } = writeTravelDraft(request, {
    searchUrl,
    dryRun: !opts.write,
  });

  if (opts.print !== false) {
    console.log(content);
  }
  if (opts.write) {
    console.error(`\n✓ draft: ${path}`);
  } else {
    console.error(`\n(dry-run · --write で ${path} に保存)`);
    if (portal) {
      console.error(`次: ${portal.name} で browser 手順（travel_booking Skill）`);
    }
  }

  if (opts.write && !written) {
    process.exit(1);
  }
}

function exitOnIntakeFailure(result: IntakeValidationResult): void {
  if (!result.ok) {
    process.exit(1);
  }
}
