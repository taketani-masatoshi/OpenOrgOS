import type { ReactNode } from "react";

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
export function OperatorShell({
  active,
  operatorLabel,
  onSignOut,
  yojitsuHref = "/",
  wireHref = "/wire/",
  orgHref = "/org/",
  secretaryHref = "/secretary/",
  stewardHref = "/steward/",
  children,
}: Props) {
  return (
    <div className="ops-shell">
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
          <button type="button" className="ops-shell-signout" onClick={onSignOut}>
            サインアウト
          </button>
        </div>
      </header>
      <div className="ops-shell-body">{children}</div>
    </div>
  );
}
