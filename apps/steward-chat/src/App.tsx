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

type SectionNavItem = { id: string; href: string; label: string };

function SectionSubNav({
  active,
  ariaLabel,
  items,
}: {
  active: string;
  ariaLabel: string;
  items: SectionNavItem[];
}) {
  return (
    <nav className="yojitsu-subnav" aria-label={ariaLabel}>
      {items.map((item) => (
        <a
          key={item.id}
          href={item.href}
          className={active === item.id ? "yojitsu-subnav-tab is-active" : "yojitsu-subnav-tab"}
          aria-current={active === item.id ? "page" : undefined}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

function FinanceSubNav({ view }: { view: ConsoleView }) {
  const copy = useCopy(STEWARD_COPY);
  return (
    <SectionSubNav
      active={view}
      ariaLabel={copy.financeMenu}
      items={[
        { id: "ledger", href: "/?ledger=1", label: copy.ledger },
        { id: "tax", href: "/?tax=1", label: copy.tax },
        { id: "wallet", href: "/?wallet=1", label: copy.wallet },
        { id: "analytics", href: "/?analytics=1", label: copy.analytics },
        { id: "admin", href: "/?admin=1", label: copy.admin },
        { id: "receipt-issue", href: "/?receipt-issue=1", label: copy.receiptIssue },
        { id: "receipt", href: "/?receipt=1", label: copy.receipt },
      ]}
    />
  );
}

function ExecutiveSubNav({ active }: { active: "overview" | "approvals" }) {
  const copy = useCopy(STEWARD_COPY);
  return (
    <SectionSubNav
      active={active}
      ariaLabel={copy.executiveMenu}
      items={[
        { id: "overview", href: "/", label: copy.executiveOverview },
        { id: "approvals", href: "/approvals/", label: copy.approvalsTitle },
      ]}
    />
  );
}

type AgentsSubNavActive =
  | "secretary"
  | "steward"
  | "handoffs"
  | "agent-list"
  | "runs";

function AgentsSubNav({ active }: { active: AgentsSubNavActive }) {
  const copy = useCopy(STEWARD_COPY);
  const tabs = [
    { id: "steward" as const, href: "/steward/", label: copy.steward },
    { id: "secretary" as const, href: "/secretary/", label: copy.secretary },
    { id: "handoffs" as const, href: "/handoffs/", label: copy.handoffs },
    { id: "agent-list" as const, href: "/agents/", label: copy.agentList },
    { id: "runs" as const, href: "/runs/", label: copy.runs },
  ];
  return (
    <nav className="yojitsu-subnav" aria-label={copy.aiTeamMenu}>
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

function BusinessSubNav({
  active,
}: {
  active:
    | "customers-outbound"
    | "customers-inbound"
    | "customers-pipeline"
    | "customers-accounts"
    | "customers-after-sales"
    | "customers-churn"
    | "stays";
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
    { id: "stays" as const, href: "/stays/", label: copy.businessStays },
  ];
  return (
    <nav className="yojitsu-subnav" aria-label={copy.businessMenu}>
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

function OrganizationSubNav({ active }: { active: "org" | "contracts" }) {
  const copy = useCopy(STEWARD_COPY);
  return (
    <SectionSubNav
      active={active}
      ariaLabel={copy.organizationMenu}
      items={[
        { id: "org", href: "/org/", label: copy.organizationChart },
        { id: "contracts", href: "/contracts/", label: copy.organizationContracts },
      ]}
    />
  );
}

function ConnectionsSubNav({ active }: { active: "wire" | "integrations" }) {
  const copy = useCopy(STEWARD_COPY);
  return (
    <SectionSubNav
      active={active}
      ariaLabel={copy.connectionsMenu}
      items={[
        { id: "wire", href: "/wire/", label: copy.connectionsWire },
        { id: "integrations", href: "/?integrations=1", label: copy.connectionsServices },
      ]}
    />
  );
}

type SettingsNavActive =
  | "settings"
  | "company"
  | "account"
  | "agent-add"
  | "module-list"
  | "llm-workers"
  | "chat-settings";

function SettingsSubNav({ active }: { active: SettingsNavActive }) {
  const copy = useCopy(STEWARD_COPY);
  return (
    <SectionSubNav
      active={active}
      ariaLabel={copy.settingsMenu}
      items={[
        { id: "settings", href: "/settings/", label: copy.settingsOverview },
        { id: "company", href: "/?onboarding=1", label: copy.settingsCompany },
        { id: "account", href: "/?account=1", label: copy.settingsAccount },
        { id: "agent-add", href: "/agents/add/", label: copy.settingsAgents },
        { id: "module-list", href: "/modules/", label: copy.settingsModules },
        { id: "llm-workers", href: "/llm-workers/", label: copy.settingsLlm },
        { id: "chat-settings", href: "/chat-settings/", label: copy.settingsChat },
      ]}
    />
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
        <>
          <ExecutiveSubNav active="overview" />
          <ExecutiveHomePage />
        </>
      ) : (
        <>
          {section === "ledger" || section === "budget" || section === "transactions" ? (
            <FinanceSubNav view={view} />
          ) : view === "integrations" ? (
            <ConnectionsSubNav active="integrations" />
          ) : view === "onboarding" || view === "product-setup" ? (
            <SettingsSubNav active="company" />
          ) : view === "account" ? (
            <SettingsSubNav active="account" />
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
 * Primary navigation remains stable as capabilities grow:
 * 経営 · 財務 · 業務 · 組織 · AIチーム · 連携, with one-time configuration under settings.
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

  const homePath = (window.location.pathname.replace(/\/+$/, "") || "/") === "/";
  const homeView = parseConsoleView(window.location.search);
  const shellTab: OperatorShellActive | undefined = homePath
    ? homeShellTab()
    : operatorShellTabFromRoute(shellActive);
  const settingsArea =
    shellActive === "settings" ||
    shellActive === "cloud-llm" ||
    shellActive === "llm-workers" ||
    shellActive === "chat-settings" ||
    shellActive === "module-list" ||
    shellActive === "module-add" ||
    shellActive === "agent-add" ||
    homeView === "onboarding" ||
    homeView === "product-setup" ||
    homeView === "account";

  return window.location.pathname.replace(/\/+$/, "") === "/signup" ||
    window.location.pathname.startsWith("/signup/") ? (
    <SignupPage />
  ) : window.location.pathname.replace(/\/+$/, "") === "/guest-setup" ||
    window.location.pathname.startsWith("/guest-setup/") ? (
    <GuestSetupPage />
  ) : (
    <BudgetAuthGate
      active={shellTab}
      settingsArea={settingsArea}
      settingsNavigation={<SettingsSubNav active="settings" />}
    >
      {shellActive === "settings" ? null : shellActive === "cloud-llm" ? (
        <div className="agent-section">
          <SettingsSubNav active="llm-workers" />
          <CloudLlmGuidePage />
        </div>
      ) : shellActive === "llm-workers" ? (
        <div className="agent-section">
          <SettingsSubNav active="llm-workers" />
          <LlmWorkersPage />
        </div>
      ) : shellActive === "chat-settings" ? (
        <div className="agent-section">
          <SettingsSubNav active="chat-settings" />
          <ChatSettingsPage />
        </div>
      ) : shellActive === "org" ? (
        <div className="agent-section">
          <OrganizationSubNav active="org" />
          <OrgChartPage />
        </div>
      ) : shellActive === "contracts" ? (
        <div className="agent-section">
          <OrganizationSubNav active="contracts" />
          <ContractsPage />
        </div>
      ) : shellActive === "stays" ? (
        <div className="agent-section">
          <BusinessSubNav active="stays" />
          <StaysPage />
        </div>
      ) : shellActive === "approvals" ? (
        <div className="agent-section">
          <ExecutiveSubNav active="approvals" />
          <ApprovalsQueue asPage />
        </div>
      ) : shellActive === "customers-outbound" ||
        shellActive === "customers-inbound" ||
        shellActive === "customers-pipeline" ||
        shellActive === "customers-accounts" ||
        shellActive === "customers-after-sales" ||
        shellActive === "customers-churn" ? (
        <div className="agent-section">
          <BusinessSubNav active={shellActive} />
          <CustomersWorkbenchPage view={shellActive} />
        </div>
      ) : shellActive === "runs" ? (
        <div className="agent-section">
          <AgentsSubNav active="runs" />
          <OrchestrationRunsPage />
        </div>
      ) : shellActive === "wire" ? (
        <div className="agent-section">
          <ConnectionsSubNav active="wire" />
          <WireConsolePage />
        </div>
      ) : shellActive === "module-list" ||
        shellActive === "module-add" ||
        shellActive === "agent-add" ? (
        <div className="agent-section">
          <SettingsSubNav active={shellActive === "agent-add" ? "agent-add" : "module-list"} />
          {shellActive === "module-list" ? <AgentRosterPage view="modules" /> : null}
          {shellActive === "agent-add" ? <AgentRosterPage view="agents-add" /> : null}
          {shellActive === "module-add" ? <AgentRosterPage view="modules-add" /> : null}
        </div>
      ) : shellActive === "secretary" ||
        shellActive === "steward" ||
        shellActive === "handoffs" ||
        shellActive === "agent-list" ? (
        <div className="agent-section">
          <AgentsSubNav active={shellActive} />
          {shellActive === "handoffs" ? <HandoffsInboxPage /> : null}
          {shellActive === "agent-list" ? <AgentRosterPage view="agents" /> : null}
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
