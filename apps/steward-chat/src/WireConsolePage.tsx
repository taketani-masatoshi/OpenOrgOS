import { Suspense, lazy, useEffect, useState } from "react";
import type { TenantSummary } from "@wire-console/api";
import { fetchWireTenants } from "./wire-api";
import { loadMailWorkbench, prefetchWireWorkbench } from "./wire-prefetch";
import "@wire-console/wire-mail.css";

const MailWorkbench = lazy(() => loadMailWorkbench());

export function WireConsolePage() {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    prefetchWireWorkbench();
    let cancelled = false;
    void fetchWireTenants()
      .then((list) => {
        if (!cancelled) setTenants(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="wire-workspace">
        <div className="loading-panel" role="status">
          読み込み中…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="wire-workspace">
        <div className="error-banner">{error}</div>
      </div>
    );
  }

  return (
    <div className="wire-workspace">
      <Suspense
        fallback={
          <div className="loading-panel" role="status">
            読み込み中…
          </div>
        }
      >
        <MailWorkbench tenants={tenants} />
      </Suspense>
    </div>
  );
}
