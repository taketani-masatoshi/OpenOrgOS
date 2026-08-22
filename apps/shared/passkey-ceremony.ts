export function isPhonePasskeyClient(): boolean {
  return /iPhone|iPad|Android/i.test(navigator.userAgent);
}

/**
 * @deprecated Phase 2+ — settlement ceremony runs on the console page (hybrid).
 * Prefer `completeSettlementPasskey` instead of opening an approve URL.
 */
export function openPasskeyCeremonyWindow(url: string): Window | null {
  const width = 480;
  const height = 720;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + 48));
  return window.open(
    url,
    "orgos-passkey",
    `popup=yes,width=${width},height=${height},left=${left},top=${top}`,
  );
}
