import type { VenueProviderId } from "../../../schemas/venue-booking.js";
import type { VenueBookingAdapter } from "./adapter.js";
import { manualVenueAdapter } from "./adapters/manual.js";
import { hotpepperDeepLinkAdapter } from "./adapters/hotpepper-deep-link.js";
import { tabelogDeepLinkAdapter } from "./adapters/tabelog-deep-link.js";

/**
 * Wired adapters only. Unwired IDs are listed in
 * docs/org-os/venue-booking-providers-survey.md and venue-providers.yaml.
 */
const ADAPTERS: Partial<Record<VenueProviderId, VenueBookingAdapter>> = {
  manual: manualVenueAdapter,
  hotpepper_deep_link: hotpepperDeepLinkAdapter,
  tabelog_deep_link: tabelogDeepLinkAdapter,
  /** Search-only — implement after ORGOS_HOTPEPPER_API_KEY */
  hotpepper_api: undefined,
};

export function getVenueBookingAdapter(providerId: VenueProviderId): VenueBookingAdapter {
  const adapter = ADAPTERS[providerId];
  if (!adapter) {
    throw new Error(
      `Venue provider ${providerId} is not wired yet (channel=venue_booking · not Wire). ` +
        `Use manual | hotpepper_deep_link | tabelog_deep_link — see docs/org-os/venue-booking-providers-survey.md`
    );
  }
  return adapter;
}

export function listVenueBookingAdapterIds(): VenueProviderId[] {
  return (Object.keys(ADAPTERS) as VenueProviderId[]).filter((id) => ADAPTERS[id]);
}
