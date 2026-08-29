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
  | "runs"
  | "agents"
  | "secretary"
  | "steward"
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
  /** Combined: `/?ledger=1`. `null` hides the tab (standalone Wire). */
  ledgerHref?: string | null;
  /** Combined: `/?wallet=1`. `null` hides the tab. */
  yojitsuHref?: string | null;
  /** Combined: `/?receipt-issue=1`. `null` hides the tab. */
  torihikiHref?: string | null;
  /** Combined: `/wire/` · standalone Wire: `/`. `null` hides the tab. */
  wireHref?: string | null;
  orgHref?: string | null;
  /** Combined: `/approvals/` · CEO inbox. `null` hides the tab. */
  approvalsHref?: string | null;
  /** Combined: `/customers/` · CRM lifecycle. `null` hides the tab. */
  customersHref?: string | null;
  /** Combined: `/runs/` · standalone Wire: `null` hides the tab. */
  runsHref?: string | null;
  secretaryHref?: string | null;
  stewardHref?: string | null;
  children?: ReactNode;
};

/**
 * Shared top chrome for Operator Console.
 * 経営 `/` · 帳簿 `/?ledger=1` · 予実 `/?wallet=1` · 取引 `/?receipt-issue=1` · Wire `/wire/` · 組織図 `/org/` · 顧客管理 `/customers/` · エージェント `/steward/` · 実行状況 `/runs/`
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
    active === "customers-after-sales" ||
    active === "customers-churn"
  );
}

function isAgentsSection(active?: OperatorShellActive): boolean {
  return (
    active === "agents" ||
    active === "secretary" ||
    active === "steward" ||
    active === "agent-list" ||
    active === "module-list" ||
    active === "agent-add" ||
    active === "module-add"
  );
}

export function OperatorShell({
  active,
  operatorLabel,
  onSignOut,
  settingsHref = "/settings/",
  settingsActive = false,
  executiveHref = "/",
  ledgerHref = "/?ledger=1",
  yojitsuHref = "/?wallet=1",
  torihikiHref = "/?receipt-issue=1",
  wireHref = "/wire/",
  orgHref = "/org/",
  approvalsHref = null,
  customersHref = null,
  runsHref = "/runs/",
  secretaryHref = "/secretary/",
  stewardHref = "/steward/",
  children,
}: Props) {
  const copy = useCopy(SHELL_COPY);
  const agentsHref = stewardHref || secretaryHref;

  return (
    <div className="ops-shell">
      <ThemeSync />
      <LocaleSync />
      <header className="ops-shell-header">
        <div className="ops-shell-brand">OpenOrgOS</div>
        <nav className="ops-shell-nav" aria-label={copy.nav}>
          <ShellTab href={executiveHref} current={active === "executive"}>
            {copy.executive}
          </ShellTab>
          <ShellTab href={ledgerHref} current={active === "ledger"}>
            {copy.ledger}
          </ShellTab>
          <ShellTab href={yojitsuHref} current={active === "yojitsu"}>
            {copy.yojitsu}
          </ShellTab>
          <ShellTab href={torihikiHref} current={active === "torihiki"}>
            {copy.torihiki}
          </ShellTab>
          <ShellTab href={wireHref} current={active === "wire"}>
            {copy.wire}
          </ShellTab>
          <ShellTab href={orgHref} current={active === "org"}>
            {copy.org}
          </ShellTab>
          <ShellTab href={approvalsHref} current={active === "approvals"}>
            {copy.approvals}
          </ShellTab>
          <ShellTab href={customersHref} current={isCustomersSection(active)}>
            {copy.customers}
          </ShellTab>
          <ShellTab href={agentsHref} current={isAgentsSection(active)}>
            {copy.agents}
          </ShellTab>
          <ShellTab href={runsHref} current={active === "runs"}>
            {copy.runs}
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
