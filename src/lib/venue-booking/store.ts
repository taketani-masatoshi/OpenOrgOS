import { existsSync } from "node:fs";
import {
  venueCatalogFileSchema,
  venueProvidersFileSchema,
  venueReservationsFileSchema,
  type VenueCatalogEntry,
  type VenueCatalogFile,
  type VenueProvider,
  type VenueProvidersFile,
  type VenueReservation,
  type VenueReservationsFile,
} from "../../../schemas/venue-booking.js";
import { loadRegistryFile, readYamlFile, writeYamlFile } from "../utils.js";
import {
  getVenueCatalogExamplePath,
  getVenueCatalogPath,
  getVenueProvidersExamplePath,
  getVenueProvidersPath,
  getVenueReservationsPath,
  moduleVenueCatalogExamplePath,
  moduleVenueProvidersExamplePath,
} from "./paths.js";

export function loadVenueReservations(): VenueReservationsFile {
  return loadRegistryFile(getVenueReservationsPath(), venueReservationsFileSchema, () =>
    venueReservationsFileSchema.parse({ version: 1, channel: "venue_booking", reservations: [] })
  );
}

export function saveVenueReservations(file: VenueReservationsFile): void {
  writeYamlFile(getVenueReservationsPath(), venueReservationsFileSchema.parse(file));
}

export function findVenueReservation(id: string): VenueReservation | undefined {
  return loadVenueReservations().reservations.find((r) => r.id === id);
}

export function upsertVenueReservation(row: VenueReservation): VenueReservation {
  const file = loadVenueReservations();
  const idx = file.reservations.findIndex((r) => r.id === row.id);
  if (idx >= 0) {
    file.reservations[idx] = row;
  } else {
    file.reservations.unshift(row);
  }
  saveVenueReservations(file);
  return row;
}

export function nextVenueReservationId(reservations?: VenueReservation[]): string {
  const rows = reservations ?? loadVenueReservations().reservations;
  const year = new Date().getFullYear();
  const prefix = `VR-${year}-`;
  let max = 0;
  for (const r of rows) {
    const m = r.id.match(/^VR-(\d{4})-(\d{3})$/);
    if (m && r.id.startsWith(prefix)) {
      max = Math.max(max, parseInt(m[2]!, 10));
    }
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export function loadVenueProviders(): VenueProvidersFile | null {
  const paths = [
    getVenueProvidersPath(),
    getVenueProvidersExamplePath(),
    moduleVenueProvidersExamplePath(),
  ];
  for (const path of paths) {
    if (!existsSync(path)) continue;
    return readYamlFile(path, venueProvidersFileSchema);
  }
  return null;
}

export function getVenueProvider(id: string, file = loadVenueProviders()): VenueProvider | undefined {
  return file?.providers.find((p) => p.id === id);
}

export function loadVenueCatalog(): VenueCatalogFile | null {
  const paths = [
    getVenueCatalogPath(),
    getVenueCatalogExamplePath(),
    moduleVenueCatalogExamplePath(),
  ];
  for (const path of paths) {
    if (!existsSync(path)) continue;
    return readYamlFile(path, venueCatalogFileSchema);
  }
  return null;
}

export function findVenueCatalogEntry(idOrName: string): VenueCatalogEntry | undefined {
  const file = loadVenueCatalog();
  if (!file) return undefined;
  const byId = file.venues.find((v) => v.id === idOrName);
  if (byId) return byId;
  const needle = idOrName.trim().toLowerCase();
  return file.venues.find((v) => v.name.toLowerCase() === needle);
}
