import type { ReactNode } from "react";
import { ThemeSync } from "./ThemeSync";

export type OperatorShellActive =
  | "yojitsu"
  | "wire"
  | "org"
  | "secretary"
  | "steward";

type Props = {
  active: OperatorShellActive;
  operatorLabel: string;
  onSignOut: () => void;
  /** PassKey / auth settings page (gear icon). Omit to hide. */
  settingsHref?: string;
  settingsActive?: boolean;
  /** Combined origin: `/`. */
  yojitsuHref?: string;
  /** Combined: `/wire/` · standalone Wire: `/` or Vite BASE_URL. */
  wireHref?: string;
  /** Combined: `/org/`. */
  orgHref?: string;
  secretaryHref?: string;
  stewardHref?: string;
  children?: ReactNode;
};

/**
 * Shared top chrome for Operator Console.
 * 予実 `/` · Wire `/wire/` · 組織図 `/org/` · 秘書 `/secretary/` · スチュワード `/steward/`
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

export function OperatorShell({
  active,
  operatorLabel,
  onSignOut,
  settingsHref = "/settings/",
  settingsActive = false,
  yojitsuHref = "/",
  wireHref = "/wire/",
  orgHref = "/org/",
  secretaryHref = "/secretary/",
  stewardHref = "/steward/",
  children,
}: Props) {
  return (
    <div className="ops-shell">
      <ThemeSync />
      <header className="ops-shell-header">
        <div className="ops-shell-brand">OpenOrgOS</div>
        <nav className="ops-shell-nav" aria-label="Operator Console">
          <a
            href={yojitsuHref}
            className={active === "yojitsu" ? "ops-shell-tab active" : "ops-shell-tab"}
            aria-current={active === "yojitsu" ? "page" : undefined}
          >
            予実
          </a>
          <a
            href={wireHref}
            className={active === "wire" ? "ops-shell-tab active" : "ops-shell-tab"}
            aria-current={active === "wire" ? "page" : undefined}
          >
            Wire
          </a>
          <a
            href={orgHref}
            className={active === "org" ? "ops-shell-tab active" : "ops-shell-tab"}
            aria-current={active === "org" ? "page" : undefined}
          >
            組織図
          </a>
          <a
            href={secretaryHref}
            className={active === "secretary" ? "ops-shell-tab active" : "ops-shell-tab"}
            aria-current={active === "secretary" ? "page" : undefined}
          >
            秘書
          </a>
          <a
            href={stewardHref}
            className={active === "steward" ? "ops-shell-tab active" : "ops-shell-tab"}
            aria-current={active === "steward" ? "page" : undefined}
          >
            スチュワード
          </a>
        </nav>
        <div className="ops-shell-meta">
          <span
            className="ops-shell-operator"
            title="ログイン中のオペレータ ID・承認者・実行モード"
          >
            {operatorLabel}
          </span>
          {settingsHref ? (
            <a
              href={settingsHref}
              className={
                settingsActive ? "ops-shell-settings is-active" : "ops-shell-settings"
              }
              aria-label="設定"
              title="設定"
              aria-current={settingsActive ? "page" : undefined}
            >
              <SettingsIcon />
            </a>
          ) : null}
          <button type="button" className="ops-shell-signout" onClick={onSignOut}>
            サインアウト
          </button>
        </div>
      </header>
      <div className="ops-shell-body">{children}</div>
    </div>
  );
}
