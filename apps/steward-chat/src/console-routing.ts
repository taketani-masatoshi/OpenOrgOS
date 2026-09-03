import { isPasskeySettingsPath } from "@ops-shared/console-hrefs";
import type { OperatorShellActive } from "@ops-shared/OperatorShell";

export type ShellRoute =
  | OperatorShellActive
  | "contracts"
  | "stays"
  | "cloud-llm"
  | "chat-settings"
  | "llm-workers"
  | "handoffs"
  | "settings";

export function pathActive(pathname = window.location.pathname): ShellRoute {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/signup" || path.startsWith("/signup/")) return "ledger";
  if (path === "/secretary" || path.startsWith("/secretary/")) return "secretary";
  if (path === "/steward" || path.startsWith("/steward/")) return "steward";
  if (path === "/handoffs" || path.startsWith("/handoffs/")) return "handoffs";
  if (path === "/agents/add" || path.startsWith("/agents/add/")) return "agent-add";
  if (path === "/modules/add" || path.startsWith("/modules/add/")) return "module-add";
  if (path === "/modules" || path.startsWith("/modules/")) return "module-list";
  if (path === "/agents" || path.startsWith("/agents/")) return "agent-list";
  if (path === "/org" || path.startsWith("/org/")) return "org";
  if (path === "/contracts" || path.startsWith("/contracts/")) return "contracts";
  if (path === "/stays" || path.startsWith("/stays/")) return "stays";
  if (path === "/approvals" || path.startsWith("/approvals/")) return "approvals";
  if (path === "/customers/churn" || path.startsWith("/customers/churn/")) {
    return "customers-churn";
  }
  if (path === "/customers/accounts" || path.startsWith("/customers/accounts/")) {
    return "customers-accounts";
  }
  if (path === "/customers/pipeline" || path.startsWith("/customers/pipeline/")) {
    return "customers-pipeline";
  }
  if (path === "/customers/after-sales" || path.startsWith("/customers/after-sales/")) {
    return "customers-after-sales";
  }
  if (path === "/customers/inbound" || path.startsWith("/customers/inbound/")) {
    return "customers-inbound";
  }
  if (path === "/customers/outbound" || path.startsWith("/customers/outbound/")) {
    return "customers-outbound";
  }
  if (path === "/customers" || path.startsWith("/customers/")) return "customers-outbound";
  if (path === "/runs" || path.startsWith("/runs/")) return "runs";
  if (path === "/cloud-llm" || path.startsWith("/cloud-llm/")) return "cloud-llm";
  if (path === "/llm-workers" || path.startsWith("/llm-workers/")) return "llm-workers";
  if (path === "/chat-settings" || path.startsWith("/chat-settings/")) {
    return "chat-settings";
  }
  if (isPasskeySettingsPath(pathname)) return "settings";
  if (path === "/wire" || path.startsWith("/wire/")) return "wire";
  const search =
    typeof window !== "undefined" ? window.location.search : "";
  const params = new URLSearchParams(search);
  if (params.get("ledger") === "1" || params.get("tax") === "1") return "ledger";
  if (
    params.get("wallet") === "1" ||
    params.get("analytics") === "1" ||
    params.get("admin") === "1"
  ) {
    return "yojitsu";
  }
  if (
    params.get("receipt-issue") === "1" ||
    params.get("receipt") === "1" ||
    params.get("issuer") === "1"
  ) {
    return "torihiki";
  }
  if (path === "/" || path === "") return "executive";
  return "executive";
}

/** Map SPA route to Operator Console primary tab. */
export function operatorShellTabFromRoute(
  route: ShellRoute,
): OperatorShellActive | undefined {
  if (route === "settings") return undefined;
  if (
    route === "cloud-llm" ||
    route === "chat-settings" ||
    route === "llm-workers" ||
    route === "module-list" ||
    route === "module-add" ||
    route === "agent-add"
  ) {
    return undefined;
  }
  return route;
}

/** Soft-nav targets inside this SPA (Wire included — same bundle, lazy chunk). */
export function spaPathFromHref(href: string, origin = window.location.origin): string | null {
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin) return null;
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (
      path === "/" ||
      path === "/wire" ||
      path === "/secretary" ||
      path === "/steward" ||
      path === "/handoffs" ||
      path === "/agents" ||
      path === "/agents/add" ||
      path === "/modules" ||
      path === "/modules/add" ||
      path === "/org" ||
      path === "/contracts" ||
      path === "/stays" ||
      path === "/approvals" ||
      path === "/customers" ||
      path === "/customers/outbound" ||
      path === "/customers/inbound" ||
      path === "/customers/pipeline" ||
      path === "/customers/accounts" ||
      path === "/customers/after-sales" ||
      path === "/customers/churn" ||
      path === "/runs" ||
      path === "/cloud-llm" ||
      path === "/llm-workers" ||
      path === "/chat-settings" ||
      path === "/settings"
    ) {
      return path === "/" ? "/" : `${path}/`;
    }
    return null;
  } catch {
    return null;
  }
}
