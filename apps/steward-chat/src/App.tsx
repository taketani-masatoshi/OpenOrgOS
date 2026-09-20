import { useEffect, useMemo, useState } from "react";
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
import { AgentRosterPage } from "./AgentRosterPage";
import { ApprovalsQueue } from "./ApprovalsQueue";
import { AnalyticsDashboardPage } from "./AnalyticsDashboardPage";
import { OrchestrationRunsPage } from "./OrchestrationRunsPage";
import { HandoffsInboxPage } from "./HandoffsInboxPage";
import { LedgerWorkbenchPage } from "./LedgerWorkbenchPage";
import { ExecutiveHomePage } from "./ExecutiveHomePage";
import { CustomerAdminPage } from "./CustomerAdminPage";
import { PlatformOpsPage } from "./PlatformOpsPage";
import { EsignPage } from "./EsignPage";
import { ProductInitialSetupPage } from "./ProductInitialSetupPage";
import { CustomersWorkbenchPage } from "./CustomersWorkbenchPage";
import { SignupPage } from "./SignupPage";
import { GuestSetupPage } from "./GuestSetupPage";
import { TaxHandoffPage } from "./TaxHandoffPage";
import { ContractsPage } from "./ContractsPage";
import { StaysPage } from "./StaysPage";
import { WireConsolePage } from "./WireConsolePage";
import { useCopy } from "@ops-shared/define-copy";
import type { OperatorShellActive } from "@ops-shared/OperatorShell";
import { STEWARD_COPY } from "./steward-copy";
import { fetchProductOnboarding } from "./api";
import { OnboardingPage } from "./OnboardingPage";
import { IntegrationsHubPage } from "./IntegrationsHubPage";
import {
  applyConsoleViewToUrl,
  consoleSectionFromView,
  isSetupGateBypass,
  notifyConsoleHomeNav,
  parseConsoleView,
  shellTabFromView,
  subscribeConsoleHomeNav,
  wantsLedgerWorkbench,
  type ConsoleSection,
  type ConsoleView,
} from "./console-nav";
import {
  operatorShellTabFromRoute,
  pathActive,
  spaPathFromHref,
  type ShellRoute,
} from "./console-routing";
import { prefetchWireWorkbench } from "./wire-prefetch";

function redirectLegacyRunsQuery(): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get("runs") !== "1") return;
  params.delete("runs");
  const qs = params.toString();
  window.history.replaceState({}, "", `/runs/${qs ? `?${qs}` : ""}`);
}

redirectLegacyRunsQuery();

function redirectRemovedOpsRoute(): void {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/ops" && !path.startsWith("/ops/")) return;
  const params = new URLSearchParams(window.location.search);
  const qs = params.toString();
  window.history.replaceState({}, "", `/${qs ? `?${qs}` : ""}`);
}

redirectRemovedOpsRoute();

function homeShellTab(): OperatorShellActive | undefined {
  const view = parseConsoleView(window.location.search);
  return shellTabFromView(view) ?? undefined;
}

function setConsoleQuery(view: ConsoleView) {
  const url = new URL(window.location.href);
  applyConsoleViewToUrl(url, view);
  window.history.replaceState({}, "", url);
}

function ConsoleSubNav({
  section,
  view,
  onChange,
}: {
  section: ConsoleSection;
  view: ConsoleView;
  onChange: (next: ConsoleView) => void;
}) {
  const copy = useCopy(STEWARD_COPY);
  const items =
    section === "ledger"
      ? ([
          { id: "ledger", label: copy.ledger },
          { id: "tax", label: copy.tax },
        ] as const)
      : section === "budget"
        ? ([
            { id: "wallet", label: copy.wallet },
            { id: "analytics", label: copy.analytics },
            { id: "admin", label: copy.admin },
          ] as const)
        : ([
            { id: "receipt-issue", label: copy.receiptIssue },
            { id: "receipt", label: copy.receipt },
          ] as const);

  const ariaLabel =
    section === "ledger"
      ? copy.ledgerMenu
      : section === "budget"
        ? copy.yojitsuMenu
        : copy.transactionsMenu;

  return (
    <nav className="yojitsu-subnav" aria-label={ariaLabel}>
      {items.map((item) => (
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

type AgentsSubNavActive =
  | "secretary"
  | "steward"
  | "handoffs"
  | "agent-list"
  | "module-list"
  | "agent-add"
  | "module-add";

function AgentsSubNav({ active }: { active: AgentsSubNavActive }) {
  const copy = useCopy(STEWARD_COPY);
  const tabs = [
    { id: "steward" as const, href: "/steward/", label: copy.steward },
    { id: "secretary" as const, href: "/secretary/", label: copy.secretary },
    { id: "handoffs" as const, href: "/handoffs/", label: copy.handoffs },
    { id: "agent-list" as const, href: "/agents/", label: copy.agentList },
    { id: "module-list" as const, href: "/modules/", label: copy.moduleList },
    { id: "agent-add" as const, href: "/agents/add/", label: copy.agentAdd },
    { id: "module-add" as const, href: "/modules/add/", label: copy.moduleAddTab },
  ];
  return (
    <nav className="yojitsu-subnav" aria-label={copy.agentsMenu}>
      {tabs.map((tab) => (
        <a
          key={tab.id}
          href={tab.href}
          className={
            active === tab.id ? "yojitsu-subnav-tab is-active" : "yojitsu-subnav-tab"
          }
          aria-current={active === tab.id ? "page" : undefined}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}

function CustomersSubNav({
  active,
}: {
  active:
    | "customers-outbound"
    | "customers-inbound"
    | "customers-pipeline"
    | "customers-accounts"
    | "customers-after-sales"
    | "customers-churn";
}) {
  const copy = useCopy(STEWARD_COPY);
  const tabs = [
    { id: "customers-pipeline" as const, href: "/customers/pipeline/", label: copy.customersPipeline },
    { id: "customers-accounts" as const, href: "/customers/accounts/", label: copy.customersAccounts },
    { id: "customers-outbound" as const, href: "/customers/outbound/", label: copy.customersOutbound },
    { id: "customers-inbound" as const, href: "/customers/inbound/", label: copy.customersInbound },
    {
      id: "customers-after-sales" as const,
      href: "/customers/after-sales/",
      label: copy.customersAfterSales,
    },
    { id: "customers-churn" as const, href: "/customers/churn/", label: copy.customersChurn },
  ];
  return (
    <nav className="yojitsu-subnav" aria-label={copy.customersMenu}>
      {tabs.map((tab) => (
        <a
          key={tab.id}
          href={tab.href}
          className={
            active === tab.id ? "yojitsu-subnav-tab is-active" : "yojitsu-subnav-tab"
          }
          aria-current={active === tab.id ? "page" : undefined}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}

function ConsoleHomeApp() {
  const copy = useCopy(STEWARD_COPY);
  const [navRevision, setNavRevision] = useState(0);
  const view = useMemo(
    () => parseConsoleView(window.location.search),
    [navRevision],
  );
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const section = consoleSectionFromView(view);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 3000);
  }

  function changeView(next: ConsoleView) {
    setConsoleQuery(next);
    notifyConsoleHomeNav();
  }

  useEffect(() => subscribeConsoleHomeNav(() => setNavRevision((r) => r + 1)), []);

  useEffect(() => {
    const search = window.location.search;
    if (isSetupGateBypass(search)) return;

    let cancelled = false;
    void fetchProductOnboarding()
      .then((report) => {
        if (cancelled) return;
        if (!report.customer_ready && wantsLedgerWorkbench(search)) {
          setConsoleQuery("onboarding");
          notifyConsoleHomeNav();
          notify("セットアップ未完了のためワークベンチを開けません");
          const url = new URL(window.location.href);
          url.searchParams.delete("ledger");
          url.searchParams.set("onboarding", "1");
          url.searchParams.set("setup", "required");
          window.history.replaceState({}, "", url.toString());
        }
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="budget-app">
      {toast && <div className="toast">{toast}</div>}
      {view === "executive" ? (
        <ExecutiveHomePage />
      ) : (
        <>
          {section !== "operations" && section !== "executive" ? (
            <ConsoleSubNav section={section} view={view} onChange={changeView} />
          ) : null}
          {view === "receipt" ? (
            <ReceiptClaimPage />
          ) : view === "receipt-issue" ? (
            <ReceiptIssuePage />
          ) : view === "analytics" ? (
            <AnalyticsDashboardPage />
          ) : view === "ledger" ? (
            <LedgerWorkbenchPage />
          ) : view === "tax" ? (
            <TaxHandoffPage />
          ) : view === "account" ? (
            <CustomerAdminPage />
          ) : view === "onboarding" ? (
            <OnboardingPage />
          ) : view === "integrations" ? (
            <IntegrationsHubPage />
          ) : view === "product-setup" ? (
            <ProductInitialSetupPage />
          ) : view === "esign" ? (
            <EsignPage />
          ) : view === "platform" ? (
            <PlatformOpsPage />
          ) : view === "admin" ? (
            <main className="workspace">
              <div className="page-heading">
                <div>
                  <h1 className="ops-page-title">{copy.adminTitle}</h1>
                  <p className="ops-page-lead">{copy.adminLead}</p>
                </div>
              </div>
              {error && <div className="error-banner">{error}</div>}
              <OrgBudgetPanel onError={setError} onToast={notify} />
            </main>
          ) : (
            <PersonalWallet />
          )}
        </>
      )}
    </div>
  );
}

/**
 * Operator Console (steward-chat SPA):
 * - `/` 経営ホーム · `/?ledger=1` 帳簿 · `/?wallet=1` 予実 · `/?receipt-issue=1` 取引
 * - `/org/` 会社組織
 * - `/runs/` 実行状況（Work Order カンバン）
 * - `/secretary/` 秘書チャット（ナビは「エージェント」配下）
 * - `/steward/` Executive Steward チャット（ナビは「エージェント」配下）
 */
export function App() {
  const copy = useCopy(STEWARD_COPY);
  const [shellActive, setShellActive] = useState<ShellRoute>(() => pathActive());
  const [navRevision, setNavRevision] = useState(0);

  useEffect(() => {
    function syncRoute() {
      setShellActive(pathActive());
      setNavRevision((r) => r + 1);
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
      notifyConsoleHomeNav();
    }
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("popstate", syncRoute);
      document.removeEventListener("click", onClick);
    };
  }, []);

  useEffect(() => {
    const idleId =
      typeof requestIdleCallback !== "undefined"
        ? requestIdleCallback(() => prefetchWireWorkbench())
        : window.setTimeout(() => prefetchWireWorkbench(), 2000);
    return () => {
      if (typeof idleId === "number") {
        clearTimeout(idleId);
      } else {
        cancelIdleCallback(idleId);
      }
    };
  }, []);

  useEffect(() => {
    function onPointerEnter(event: Event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('a[href="/wire/"]')) {
        prefetchWireWorkbench();
      }
    }
    document.addEventListener("pointerenter", onPointerEnter, true);
    return () => document.removeEventListener("pointerenter", onPointerEnter, true);
  }, []);

  const shellTab: OperatorShellActive | undefined =
    shellActive === "yojitsu"
      ? homeShellTab()
      : operatorShellTabFromRoute(shellActive);

  return window.location.pathname.replace(/\/+$/, "") === "/signup" ||
    window.location.pathname.startsWith("/signup/") ? (
    <SignupPage />
  ) : window.location.pathname.replace(/\/+$/, "") === "/guest-setup" ||
    window.location.pathname.startsWith("/guest-setup/") ? (
    <GuestSetupPage />
  ) : (
    <BudgetAuthGate active={shellTab}>
      {shellActive === "settings" ? null : shellActive === "cloud-llm" ? (
        <CloudLlmGuidePage />
      ) : shellActive === "llm-workers" ? (
        <LlmWorkersPage />
      ) : shellActive === "chat-settings" ? (
        <ChatSettingsPage />
      ) : shellActive === "org" ? (
        <OrgChartPage />
      ) : shellActive === "contracts" ? (
        <ContractsPage />
      ) : shellActive === "stays" ? (
        <StaysPage />
      ) : shellActive === "approvals" ? (
        <ApprovalsQueue asPage />
      ) : shellActive === "customers-outbound" ||
        shellActive === "customers-inbound" ||
        shellActive === "customers-pipeline" ||
        shellActive === "customers-accounts" ||
        shellActive === "customers-after-sales" ||
        shellActive === "customers-churn" ? (
        <div className="agent-section">
          <CustomersSubNav active={shellActive} />
          <CustomersWorkbenchPage view={shellActive} />
        </div>
      ) : shellActive === "runs" ? (
        <OrchestrationRunsPage />
      ) : shellActive === "wire" ? (
        <WireConsolePage />
      ) : shellActive === "secretary" ||
        shellActive === "steward" ||
        shellActive === "handoffs" ||
        shellActive === "agent-list" ||
        shellActive === "module-list" ||
        shellActive === "agent-add" ||
        shellActive === "module-add" ? (
        <div className="agent-section">
          <AgentsSubNav active={shellActive} />
          {shellActive === "handoffs" ? <HandoffsInboxPage /> : null}
          {shellActive === "agent-list" ? <AgentRosterPage view="agents" /> : null}
          {shellActive === "module-list" ? <AgentRosterPage view="modules" /> : null}
          {shellActive === "agent-add" ? <AgentRosterPage view="agents-add" /> : null}
          {shellActive === "module-add" ? <AgentRosterPage view="modules-add" /> : null}
          <div
            className={
              shellActive === "secretary"
                ? "agent-chat-pane"
                : "agent-chat-pane is-parked"
            }
            hidden={shellActive !== "secretary"}
            aria-hidden={shellActive !== "secretary"}
          >
            <AgentChatPage agentId="secretary" title={copy.secretary} />
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
            <AgentChatPage agentId="executive_steward" title={copy.steward} />
          </div>
        </div>
      ) : (
        <ConsoleHomeApp />
      )}
    </BudgetAuthGate>
  );
}
