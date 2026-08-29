import type { ReactNode } from "react";

type OpsPageProps = {
  title: string;
  lead?: string;
  loading?: boolean;
  loadingLabel?: string;
  error?: string | null;
  children?: ReactNode;
  className?: string;
};

/**
 * Shared Operator Console page chrome (workspace + ops-page-title + loading-panel).
 */
export function OpsPage({
  title,
  lead,
  loading = false,
  loadingLabel = "読み込み中…",
  error = null,
  children,
  className,
}: OpsPageProps) {
  const rootClass = className ? `workspace ops-page ${className}` : "workspace ops-page";

  return (
    <main className={rootClass}>
      <div className="page-heading">
        <div>
          <h1 className="ops-page-title">{title}</h1>
          {lead ? <p className="ops-page-lead">{lead}</p> : null}
        </div>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      {loading ? (
        <div className="loading-panel" role="status">
          {loadingLabel}
        </div>
      ) : (
        children
      )}
    </main>
  );
}
