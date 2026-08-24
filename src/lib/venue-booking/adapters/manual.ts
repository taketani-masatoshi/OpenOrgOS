import type { VenueReservationRequest } from "../../../../schemas/venue-booking.js";
import type {
  VenueAdapterAvailability,
  VenueAdapterCancelResult,
  VenueAdapterConfirmResult,
  VenueAdapterHoldResult,
  VenueBookingAdapter,
} from "../adapter.js";
import { buildGenericSearchUrl } from "../adapter.js";

/** P0 fallback — never auto-books; returns human deep links only */
export const manualVenueAdapter: VenueBookingAdapter = {
  providerId: "manual",
  async checkAvailability(req: VenueReservationRequest): Promise<VenueAdapterAvailability> {
    const search_url = buildGenericSearchUrl(req);
    return {
      available: "unknown",
      message: "手動手配: 空きはサイトで確認してください（API 未接続）",
      search_url,
      deep_link_url: search_url,
    };
  },
  async hold(req: VenueReservationRequest): Promise<VenueAdapterHoldResult> {
    const search_url = buildGenericSearchUrl(req);
    return {
      ok: true,
      status: "pending_manual",
      search_url,
      deep_link_url: search_url,
      message: "人手配チケット発行: 下の URL で予約し、confirm --external-ref で登録してください",
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
        message: "手動確定には --external-ref（予約番号）が必要です",
      };
    }
    return {
      ok: true,
      status: "confirmed",
      external_ref: opts.externalRef.trim(),
      message: "手動予約番号を登録しました",
    };
  },
  async cancel(): Promise<VenueAdapterCancelResult> {
    return {
      ok: true,
      message: "台帳上キャンセル。店舗側の取消は人手で実施してください",
    };
  },
};
