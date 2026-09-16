/** Cap how long the login gate waits on /auth/me and /auth/config. */
export const AUTH_BOOTSTRAP_TIMEOUT_MS = 4_000;

/** Delay before showing the login form so a fast session restore does not flash it. */
export const AUTH_LOGIN_FALLBACK_MS = 150;

export function authBootstrapSignal(): AbortSignal {
  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(AUTH_BOOTSTRAP_TIMEOUT_MS);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), AUTH_BOOTSTRAP_TIMEOUT_MS);
  return controller.signal;
}
