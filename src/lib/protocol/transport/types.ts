/** Shared transport result types. */
export interface DeliverEnvelopeResult {
  delivered: boolean;
  queued?: boolean;
  relayed?: boolean;
  endpoint?: string;
  reason: string;
  httpStatus?: number;
}
