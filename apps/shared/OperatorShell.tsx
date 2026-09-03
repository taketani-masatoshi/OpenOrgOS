import type { ReactNode } from "react";
import { LocaleSync } from "./LocaleSync";
import { ThemeSync } from "./ThemeSync";
import { ShellLangSelect } from "./ShellLangSelect";
import { SHELL_COPY } from "./console-copy";
import { useCopy } from "./define-copy";

export type OperatorShellActive =
  | "executive"
  | "ledger"
  | "yojitsu"
  | "torihiki"
  | "wire"
  | "org"
  | "approvals"
  | "customers"
  | "customers-outbound"
  | "customers-inbound"
  | "customers-pipeline"
  | "customers-accounts"
  | "customers-after-sales"
  | "customers-churn"
  | "contracts"
  | "stays"
  | "integrations"
  | "runs"
  | "agents"
  | "secretary"
  | "steward"
  | "handoffs"
  | "agent-list"
  | "module-list"
  | "agent-add"
  | "module-add";

type Props = {
  /** When omitted, no primary tab is current (settings / other). */
  active?: OperatorShellActive;
  operatorLabel: string;
  onSignOut: () => void;
  /** PassKey / auth settings page (gear icon). Omit to hide. */
  settingsHref?: string;
  settingsActive?: boolean;
  /** Combined: `/` · executive home. `null` hides the tab. */
  executiveHref?: string | null;
  /** Stable task-oriented groups. `null` hides a group in standalone surfaces. */
  financeHref?: string | null;
  businessHref?: string | null;
  organizationHref?: string | null;
  aiTeamHref?: string | null;
  connectionsHref?: string | null;
  children?: ReactNode;
};

/**
 * Shared top chrome for Operator Console.
 * Stable information architecture: 経営 · 財務 · 業務 · 組織 · AIチーム · 連携.
 */
function SettingsIcon() {
  return (
    <svg
      className="ops-shell-settings-icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function ShellTab({
  href,
  current,
  children,
}: {
  href: string | null | undefined;
  current: boolean;
  children: ReactNode;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      className={current ? "ops-shell-tab active" : "ops-shell-tab"}
      aria-current={current ? "page" : undefined}
    >
      {children}
    </a>
  );
}

function isCustomersSection(active?: OperatorShellActive): boolean {
  return (
    active === "customers" ||
    active === "customers-outbound" ||
    active === "customers-inbound" ||
    active === "customers-pipeline" ||
    active === "customers-accounts" ||
    active === "customers-after-sales" ||
    active === "customers-churn"
  );
}

function isFinanceSection(active?: OperatorShellActive): boolean {
  return active === "ledger" || active === "yojitsu" || active === "torihiki";
}

function isBusinessSection(active?: OperatorShellActive): boolean {
  return isCustomersSection(active) || active === "stays";
}

function isOrganizationSection(active?: OperatorShellActive): boolean {
  return active === "org" || active === "contracts";
}

function isConnectionsSection(active?: OperatorShellActive): boolean {
  return active === "wire" || active === "integrations";
}

function isAgentsSection(active?: OperatorShellActive): boolean {
  return (
    active === "agents" ||
    active === "secretary" ||
    active === "steward" ||
    active === "handoffs" ||
    active === "agent-list" ||
    active === "runs"
  );
}

export function OperatorShell({
  active,
  operatorLabel,
  onSignOut,
  settingsHref = "/settings/",
  settingsActive = false,
  executiveHref = "/",
  financeHref = "/?ledger=1",
  businessHref = null,
  organizationHref = "/org/",
  aiTeamHref = "/steward/",
  connectionsHref = "/wire/",
  children,
}: Props) {
  const copy = useCopy(SHELL_COPY);
  return (
    <div className="ops-shell">
      <ThemeSync />
      <LocaleSync />
      <header className="ops-shell-header">
        <div className="ops-shell-brand">OpenOrgOS</div>
        <nav className="ops-shell-nav" aria-label={copy.nav}>
          <ShellTab
            href={executiveHref}
            current={active === "executive" || active === "approvals"}
          >
            {copy.executive}
          </ShellTab>
          <ShellTab href={financeHref} current={isFinanceSection(active)}>
            {copy.finance}
          </ShellTab>
          <ShellTab href={businessHref} current={isBusinessSection(active)}>
            {copy.business}
          </ShellTab>
          <ShellTab href={organizationHref} current={isOrganizationSection(active)}>
            {copy.organization}
          </ShellTab>
          <ShellTab href={aiTeamHref} current={isAgentsSection(active)}>
            {copy.aiTeam}
          </ShellTab>
          <ShellTab href={connectionsHref} current={isConnectionsSection(active)}>
            {copy.connections}
          </ShellTab>
        </nav>
        <div className="ops-shell-meta">
          <ShellLangSelect />
          <span
            className="ops-shell-operator"
            title={copy.operatorTitle}
          >
            {operatorLabel}
          </span>
          {settingsHref ? (
            <a
              href={settingsHref}
              className={
                settingsActive ? "ops-shell-settings is-active" : "ops-shell-settings"
              }
              aria-label={copy.settings}
              title={copy.settings}
              aria-current={settingsActive ? "page" : undefined}
            >
              <SettingsIcon />
            </a>
          ) : null}
          <button type="button" className="ops-shell-signout" onClick={onSignOut}>
            {copy.signOut}
          </button>
        </div>
      </header>
      <div className="ops-shell-body">{children}</div>
    </div>
  );
}
