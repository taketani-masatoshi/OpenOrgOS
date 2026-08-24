import { join } from "node:path";
import { getDataDir, resolveTenantPath } from "../utils.js";
import { getModuleSeedDir } from "../modules.js";

export const VENUE_BOOKING_MODULE_ID = "venue_booking";
export const VENUE_RESERVATIONS_REL = "data/operations/venue-reservations.yaml";
export const VENUE_PROVIDERS_REL = "data/operations/venue-providers.yaml";
export const VENUE_CATALOG_REL = "data/operations/venue-catalog.yaml";

export function getVenueReservationsPath(): string {
  return resolveTenantPath(VENUE_RESERVATIONS_REL);
}

export function getVenueProvidersPath(): string {
  return resolveTenantPath(VENUE_PROVIDERS_REL);
}

export function getVenueCatalogPath(): string {
  return resolveTenantPath(VENUE_CATALOG_REL);
}

export function getVenueProvidersExamplePath(): string {
  return resolveTenantPath(`${VENUE_PROVIDERS_REL}.example`);
}

export function getVenueCatalogExamplePath(): string {
  return resolveTenantPath(`${VENUE_CATALOG_REL}.example`);
}

export function moduleVenueProvidersExamplePath(): string {
  return join(getModuleSeedDir(VENUE_BOOKING_MODULE_ID), "venue-providers.yaml.example");
}

export function moduleVenueCatalogExamplePath(): string {
  return join(getModuleSeedDir(VENUE_BOOKING_MODULE_ID), "venue-catalog.yaml.example");
}

/** Operations data dir (shared with travel_booking) */
export function getOperationsDataDir(): string {
  return join(getDataDir(), "operations");
}
