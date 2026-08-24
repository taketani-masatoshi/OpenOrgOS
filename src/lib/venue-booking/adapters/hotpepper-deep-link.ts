import type { VenueReservationRequest } from "../../../../schemas/venue-booking.js";
import type {
  VenueAdapterAvailability,
  VenueAdapterCancelResult,
  VenueAdapterConfirmResult,
  VenueAdapterHoldResult,
  VenueBookingAdapter,
} from "../adapter.js";
import { buildHotpepperSearchUrl } from "../adapter.js";

/** P1 deep-link provider — no scraping; opens Hot Pepper search for human booking */
export const hotpepperDeepLinkAdapter: VenueBookingAdapter = {
  providerId: "hotpepper_deep_link",
  async checkAvailability(req: VenueReservationRequest): Promise<VenueAdapterAvailability> {
    const search_url = buildHotpepperSearchUrl(req);
    return {
      available: "unknown",
      message: "Hot Pepper 検索 URL を生成（公式 API 未使用 · 人手確認）",
      search_url,
      deep_link_url: search_url,
    };
  },
  async hold(req: VenueReservationRequest): Promise<VenueAdapterHoldResult> {
    const search_url = buildHotpepperSearchUrl(req);
    return {
      ok: true,
      status: "pending_manual",
      search_url,
      deep_link_url: search_url,
      message: "Hot Pepper で予約後、confirm --external-ref で予約番号を登録してください",
    };
  },
  async confirm(
    _req: VenueReservationRequest,
    opts?: { externalRef?: string }
  ): Promise<VenueAdapterConfirmResult> {
    if (!opts?.externalRef?.trim()) {
      return {
        ok: false,
        status: "pending_manual",
        message: "Hot Pepper 予約番号（--external-ref）が必要です",
      };
    }
    // Shape/measurement checks are enforced in confirmVenueReservation (shared gate).
    return {
      ok: true,
      status: "confirmed",
      external_ref: opts.externalRef.trim(),
      message: "Hot Pepper 予約番号を登録しました",
    };
  },
  async cancel(): Promise<VenueAdapterCancelResult> {
    return {
      ok: true,
      message: "台帳キャンセル。Hot Pepper 上の取消は人手で実施してください",
    };
  },
};
