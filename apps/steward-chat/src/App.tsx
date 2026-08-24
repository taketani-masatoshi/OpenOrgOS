import { useEffect, useState } from "react";
import { BudgetAuthGate } from "./BudgetAuthGate";
import { OrgBudgetPanel } from "./OrgBudgetPanel";
import { PersonalWallet } from "./PersonalWallet";
import { ReceiptClaimPage } from "./ReceiptClaimPage";
import { ReceiptIssuePage } from "./ReceiptIssuePage";
import { AgentChatPage } from "./AgentChatPage";
import { CloudLlmGuidePage } from "./CloudLlmGuidePage";
import { ChatSettingsPage } from "./ChatSettingsPage";
import { LlmWorkersPage } from "./LlmWorkersPage";
import { OrgChartPage } from "./OrgChartPage";
import type { OperatorShellActive } from "@ops-shared/OperatorShell";

type ShellRoute = OperatorShellActive | "cloud-llm" | "chat-settings" | "llm-workers" | "settings";
type YojitsuView = "wallet" | "admin" | "receipt" | "receipt-issue";

function pathActive(): ShellRoute {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/secretary" || path.startsWith("/secretary/")) return "secretary";
  if (path === "/steward" || path.startsWith("/steward/")) return "steward";
  if (path === "/org" || path.startsWith("/org/")) return "org";
  if (path === "/cloud-llm" || path.startsWith("/cloud-llm/")) return "cloud-llm";
  if (path === "/llm-workers" || path.startsWith("/llm-workers/")) return "llm-workers";
  if (path === "/chat-settings" || path.startsWith("/chat-settings/")) {
    return "chat-settings";
  }
  if (path === "/settings" || path.startsWith("/settings/")) return "settings";
  return "yojitsu";
}

/** Soft-nav targets inside this SPA (not Wire, which is a separate bundle). */
function spaPathFromHref(href: string): string | null {
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (
      path === "/" ||
      path === "/secretary" ||
      path === "/steward" ||
      path === "/org" ||
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

function initialBudgetView(): YojitsuView {
  const params = new URLSearchParams(window.location.search);
  if (params.get("receipt-issue") === "1") return "receipt-issue";
  if (params.get("receipt") === "1" || params.get("issuer") === "1") {
    return "receipt";
  }
  if (params.get("admin") === "1") return "admin";
  return "wallet";
}

function setYojitsuQuery(view: YojitsuView) {
  const url = new URL(window.location.href);
  url.searchParams.delete("admin");
  url.searchParams.delete("receipt");
  url.searchParams.delete("issuer");
  url.searchParams.delete("receipt-issue");
  if (view === "admin") url.searchParams.set("admin", "1");
  if (view === "receipt") url.searchParams.set("receipt", "1");
  if (view === "receipt-issue") url.searchParams.set("receipt-issue", "1");
  window.history.replaceState({}, "", url);
}

function YojitsuSubNav({
  view,
  onChange,
}: {
  view: YojitsuView;
  onChange: (next: YojitsuView) => void;
}) {
  return (
    <nav className="yojitsu-subnav" aria-label="予実メニュー">
      {(
        [
          { id: "wallet", label: "個人予実" },
          { id: "admin", label: "予算管理" },
          { id: "receipt-issue", label: "領収書発行" },
          { id: "receipt", label: "領収書 claim" },
        ] as const
      ).map((item) => (
        <button
          key={item.id}
          type="button"
          className={
            view === item.id ? "yojitsu-subnav-tab is-active" : "yojitsu-subnav-tab"
          }
          aria-current={view === item.id ? "page" : undefined}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function YojitsuApp() {
  const [view, setView] = useState<YojitsuView>(initialBudgetView);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 3000);
  }

  function changeView(next: YojitsuView) {
    setYojitsuQuery(next);
    setView(next);
  }

  return (
    <div className="budget-app">
      {toast && <div className="toast">{toast}</div>}
      <YojitsuSubNav view={view} onChange={changeView} />
      {view === "receipt" ? (
        <ReceiptClaimPage />
      ) : view === "receipt-issue" ? (
        <ReceiptIssuePage />
      ) : view === "admin" ? (
        <main className="workspace">
          <div className="page-heading">
            <div>
              <h1 className="ops-page-title">予算管理</h1>
              <p className="ops-page-lead">
                部門・配分・見通しを決定論データから操作します。
              </p>
            </div>
          </div>
          {error && <div className="error-banner">{error}</div>}
          <OrgBudgetPanel onError={setError} onToast={notify} />
        </main>
      ) : (
        <PersonalWallet />
      )}
    </div>
  );
}

/**
 * Operator Console (steward-chat SPA):
 * - `/` 予実
 * - `/org/` 組織図
 * - `/secretary/` 秘書チャット
 * - `/steward/` Executive Steward チャット
 *
 * 秘書↔スチュワードは soft-nav + 両方マウント維持で、別々の依頼が消えない。
 */
export function App() {
  const [shellActive, setShellActive] = useState<ShellRoute>(() => pathActive());

  useEffect(() => {
    function syncRoute() {
      setShellActive(pathActive());
    }
    window.addEventListener("popstate", syncRoute);

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      const spaPath = spaPathFromHref(href);
      if (!spaPath) return;
      event.preventDefault();
      const parsed = new URL(href, window.location.origin);
      const nextPath = spaPath === "/" ? "/" : spaPath;
      const nextUrl = `${nextPath}${parsed.search}${parsed.hash}`;
      const current =
        `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (current !== nextUrl) {
        window.history.pushState({}, "", nextUrl);
      }
      syncRoute();
    }
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("popstate", syncRoute);
      document.removeEventListener("click", onClick);
    };
  }, []);

  const shellTab: OperatorShellActive =
    shellActive === "cloud-llm" ||
    shellActive === "chat-settings" ||
    shellActive === "llm-workers" ||
    shellActive === "settings"
      ? "steward"
      : shellActive;

  return (
    <BudgetAuthGate active={shellTab}>
      {shellActive === "settings" ? null : shellActive === "cloud-llm" ? (
        <CloudLlmGuidePage />
      ) : shellActive === "llm-workers" ? (
        <LlmWorkersPage />
      ) : shellActive === "chat-settings" ? (
        <ChatSettingsPage />
      ) : shellActive === "org" ? (
        <OrgChartPage />
      ) : shellActive === "secretary" || shellActive === "steward" ? (
        <>
          <div
            className={
              shellActive === "secretary"
                ? "agent-chat-pane"
                : "agent-chat-pane is-parked"
            }
            hidden={shellActive !== "secretary"}
            aria-hidden={shellActive !== "secretary"}
          >
            <AgentChatPage agentId="secretary" title="秘書" />
          </div>
          <div
            className={
              shellActive === "steward"
                ? "agent-chat-pane"
                : "agent-chat-pane is-parked"
            }
            hidden={shellActive !== "steward"}
            aria-hidden={shellActive !== "steward"}
          >
            <AgentChatPage agentId="executive_steward" title="スチュワード" />
          </div>
        </>
      ) : (
        <YojitsuApp />
      )}
    </BudgetAuthGate>
  );
}
