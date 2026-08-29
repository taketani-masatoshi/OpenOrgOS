/**
 * Signed receipt QR reading for the employee claim desk.
 * Camera path uses the platform BarcodeDetector; pasting the QR text stays
 * available for laptops and for phones without the API.
 */

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

export function barcodeDetectorCtor(): BarcodeDetectorCtor | null {
  const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

export function isCameraScanSupported(): boolean {
  return (
    barcodeDetectorCtor() != null &&
    typeof navigator !== "undefined" &&
    navigator.mediaDevices?.getUserMedia != null
  );
}

/** Browsers keep `location.hash` percent-encoded; a broken escape stays literal. */
function decodeFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

/**
 * Accepts what a QR can carry: the signed JSON itself, or a claim URL that
 * holds it in `payload` / `qr` / the fragment.
 */
export function extractQrPayload(scanned: string): string {
  const text = scanned.trim();
  if (!text) return "";
  if (text.startsWith("{")) return text;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return text;
  }
  const fromQuery =
    url.searchParams.get("payload") ?? url.searchParams.get("qr");
  if (fromQuery?.trim()) return fromQuery.trim();
  const fragment = decodeFragment(url.hash.replace(/^#/, "").trim());
  if (fragment.startsWith("{")) return fragment;
  return text;
}
