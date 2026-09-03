/**
 * Operator Console home (`/`) query routing — executive / ledger / budget / transactions.
 * Path: apps/steward-chat/src/console-nav.ts
 * ADR: docs/adr/0065-executive-home-console.md
 */

export type ConsoleView =
  | "executive"
  | "wallet"
  | "admin"
  | "account"
  | "onboarding"
  | "integrations"
  | "product-setup"
  | "analytics"
  | "ledger"
  | "tax"
  | "receipt"
  | "receipt-issue"
  | "esign"
  /** Operations-only; reached by URL and gated by the BFF. Not in tenant nav. */
  | "platform";

export type ConsoleSection =
  | "executive"
  | "ledger"
  | "budget"
  | "transactions"
  | "operations";

export type ConsoleShellTab =
  | "executive"
  | "ledger"
  | "yojitsu"
  | "torihiki"
  | "integrations";

const QUERY_KEYS = [
  "wallet",
  "admin",
  "analytics",
  "ledger",
  "tax",
  "account",
  "onboarding",
  "integrations",
  "product-setup",
  "receipt",
  "issuer",
  "receipt-issue",
  "esign",
  "platform",
] as const;

export function parseConsoleView(search: string): ConsoleView {
  const params = new URLSearchParams(search);
  if (params.get("receipt-issue") === "1") return "receipt-issue";
  if (params.get("receipt") === "1" || params.get("issuer") === "1") {
    return "receipt";
  }
  if (params.get("analytics") === "1") return "analytics";
  if (params.get("wallet") === "1") return "wallet";
  if (params.get("admin") === "1") return "admin";
  if (params.get("ledger") === "1") return "ledger";
  if (params.get("tax") === "1") return "tax";
  if (params.get("account") === "1") return "account";
  if (params.get("onboarding") === "1") return "onboarding";
  if (params.get("integrations") === "1") return "integrations";
  if (params.get("product-setup") === "1") return "product-setup";
  if (params.get("esign") === "1") return "esign";
  if (params.get("platform") === "1") return "platform";
  return "executive";
}

export function consoleSectionFromView(view: ConsoleView): ConsoleSection {
  if (view === "executive") return "executive";
  if (view === "ledger" || view === "tax") return "ledger";
  if (view === "wallet" || view === "analytics" || view === "admin") {
    return "budget";
  }
  if (view === "receipt" || view === "receipt-issue") return "transactions";
  return "operations";
}

export function shellTabFromView(view: ConsoleView): ConsoleShellTab | null {
  const section = consoleSectionFromView(view);
  if (section === "executive") return "executive";
  if (section === "ledger") return "ledger";
  if (section === "budget") return "yojitsu";
  if (section === "transactions") return "torihiki";
  if (view === "integrations") return "integrations";
  return null;
}

export function buildConsoleSearch(view: ConsoleView): string {
  const params = new URLSearchParams();
  if (view === "wallet") params.set("wallet", "1");
  if (view === "admin") params.set("admin", "1");
  if (view === "analytics") params.set("analytics", "1");
  if (view === "ledger") params.set("ledger", "1");
  if (view === "tax") params.set("tax", "1");
  if (view === "account") params.set("account", "1");
  if (view === "onboarding") params.set("onboarding", "1");
  if (view === "integrations") params.set("integrations", "1");
  if (view === "product-setup") params.set("product-setup", "1");
  if (view === "receipt") params.set("receipt", "1");
  if (view === "receipt-issue") params.set("receipt-issue", "1");
  if (view === "esign") params.set("esign", "1");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function buildConsoleHref(view: ConsoleView): string {
  return `/${buildConsoleSearch(view)}`;
}

export function applyConsoleViewToUrl(url: URL, view: ConsoleView): void {
  for (const key of QUERY_KEYS) {
    url.searchParams.delete(key);
  }
  const next = buildConsoleSearch(view);
  if (!next) return;
  const params = new URLSearchParams(next.slice(1));
  for (const [key, value] of params) {
    url.searchParams.set(key, value);
  }
}

/** Ledger workbench only when explicitly requested (`?ledger=1`). */
export function wantsLedgerWorkbench(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.get("ledger") === "1";
}

/** True when `/` has no workbench query — show executive home. */
export function wantsExecutiveHome(search: string): boolean {
  return parseConsoleView(search) === "executive";
}

export function isSetupGateBypass(search: string): boolean {
  const params = new URLSearchParams(search);
  return (
    params.get("admin") === "1" ||
    params.get("account") === "1" ||
    params.get("product-setup") === "1"
  );
}

/** Soft SPA navigation on `/` (pushState / replaceState) — popstate alone is insufficient. */
export const CONSOLE_HOME_NAV_EVENT = "orgos:console-home-nav";

export function notifyConsoleHomeNav(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CONSOLE_HOME_NAV_EVENT));
}

export function subscribeConsoleHomeNav(onNavigate: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("popstate", onNavigate);
  window.addEventListener(CONSOLE_HOME_NAV_EVENT, onNavigate);
  return () => {
    window.removeEventListener("popstate", onNavigate);
    window.removeEventListener(CONSOLE_HOME_NAV_EVENT, onNavigate);
  };
}
