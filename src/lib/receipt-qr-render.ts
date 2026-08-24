import QRCode from "qrcode";

/** Soft upper bound for EC level M byte-mode QR (Version 40 ≈ 2.9k bytes). */
const MAX_QR_PAYLOAD_BYTES = 2800;

function assertQrPayloadSize(link: string): void {
  const bytes = Buffer.byteLength(link, "utf-8");
  if (bytes > MAX_QR_PAYLOAD_BYTES) {
    throw new Error(
      `Receipt QR payload is too large (${bytes} bytes; max ${MAX_QR_PAYLOAD_BYTES}). Use a shorter portal URL or fewer line items.`,
    );
  }
}

/**
 * Render a receipt verify link as an SVG string (byte mode, EC level M).
 */
export async function renderReceiptQrSvg(link: string): Promise<string> {
  assertQrPayloadSize(link);
  return QRCode.toString(link, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 256,
  });
}

/**
 * Render a receipt verify link as a PNG buffer (for PDF embedding).
 */
export async function renderReceiptQrPng(
  link: string,
  width = 256,
): Promise<Buffer> {
  assertQrPayloadSize(link);
  return QRCode.toBuffer(link, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 1,
    width,
  });
}
