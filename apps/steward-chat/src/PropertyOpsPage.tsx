import { useEffect, useMemo, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { OpsPage } from "./OpsPage";
import { STEWARD_COPY } from "./steward-copy";
import {
  fetchPropertyOpsDashboard,
  type PropertyOpsCard,
  type PropertyOpsDashboard,
} from "./api";

function formatYen(n: number): string {
  return `${Math.round(n).toLocaleString("ja-JP")} 円`;
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function selectedPropertyId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("id");
}

function PropertyCard({
  card,
  copy,
}: {
  card: PropertyOpsCard;
  copy: ReturnType<typeof useCopy<typeof STEWARD_COPY.ja>>;
}) {
  return (
    <section className="ops-card property-ops-card" id={card.property_id}>
      <header className="property-ops-card-header">
        <div>
          <h2 className="section-title">
            {card.name}{" "}
            <span className="muted">
              ({card.property_id} · {card.type})
            </span>
          </h2>
          <p className="ops-page-meta">{card.location}</p>
          <p className="muted">
            {copy.propertyOpsModules}: {card.module_ids.join(", ") || "—"}
          </p>
        </div>
        <dl className="executive-home-kpis">
          <div>
            <dt>{copy.propertyOpsDueP0}</dt>
            <dd>{card.due_p0}</dd>
          </div>
          <div>
            <dt>{copy.propertyOpsOpenTasks}</dt>
            <dd>{card.open_tasks}</dd>
          </div>
        </dl>
      </header>

      <div className="property-ops-grid">
        <div>
          <h3 className="section-title">{copy.propertyOpsDue}</h3>
          {card.due.length === 0 ? (
            <p className="muted">{copy.propertyOpsEmptyDue}</p>
          ) : (
            <ul>
              {card.due.map((row) => (
                <li key={row.id}>
                  <a href={row.href}>
                    [{row.severity.toUpperCase()}] {row.title} · {row.due_on}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="section-title">{copy.propertyOpsInsurance}</h3>
          {card.insurance.length === 0 ? (
            <p className="muted">{copy.propertyOpsEmptyInsurance}</p>
          ) : (
            <ul>
              {card.insurance.map((row) => (
                <li key={row.id}>
                  {row.name}
                  {row.status ? ` · ${row.status}` : ""}
                  {row.renews_on ? ` · ${copy.propertyOpsRenews} ${row.renews_on}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="section-title">{copy.propertyOpsPermits}</h3>
          {card.permits.length === 0 ? (
            <p className="muted">{copy.propertyOpsEmptyPermits}</p>
          ) : (
            <ul>
              {card.permits.map((row) => (
                <li key={row.id}>
                  {row.id} · {row.permit_type_id} · {row.status}
                  {row.expires_on ? ` · ${row.expires_on}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="section-title">{copy.propertyOpsFinance}</h3>
          <ul>
            {card.finance.monthly_rent != null ? (
              <li>
                {copy.propertyOpsRent}: {formatYen(card.finance.monthly_rent)}
              </li>
            ) : null}
            {card.finance.monthly_revenue != null ? (
              <li>
                {copy.propertyOpsRevenue}: {formatYen(card.finance.monthly_revenue)}
              </li>
            ) : null}
            {card.finance.noi != null ? (
              <li>NOI: {formatYen(card.finance.noi)}</li>
            ) : null}
            {card.finance.occupancy != null ? (
              <li>
                {copy.propertyOpsOccupancy}: {formatPct(card.finance.occupancy)}
              </li>
            ) : null}
            {card.finance.adr != null ? (
              <li>ADR: {formatYen(card.finance.adr)}</li>
            ) : null}
            {card.finance.stay_count != null ? (
              <li>
                {copy.propertyOpsStays}: {card.finance.stay_count}
              </li>
            ) : null}
          </ul>
        </div>

        {card.register ? (
          <div>
            <h3 className="section-title">{copy.propertyOpsRegister}</h3>
            <p className="ops-page-meta">
              {card.register.ok
                ? copy.propertyOpsRegisterOk
                : copy.propertyOpsRegisterIssues(card.register.issue_count)}{" "}
              · {copy.propertyOpsRegisterRows}: {card.register.row_count}
            </p>
            <p className="section-cta">
              <a className="btn btn-ghost btn-sm" href={card.register.href}>
                {copy.propertyOpsOpenStays}
              </a>
            </p>
          </div>
        ) : null}

        <div>
          <h3 className="section-title">{copy.propertyOpsBulletins}</h3>
          {card.bulletins.length === 0 ? (
            <p className="muted">{copy.propertyOpsEmptyBulletins}</p>
          ) : (
            <ul>
              {card.bulletins.map((row) => (
                <li key={row.id}>
                  {row.label}:{" "}
                  {row.present
                    ? copy.propertyOpsBulletinPresent
                    : copy.propertyOpsBulletinMissing}
                </li>
              ))}
            </ul>
          )}
        </div>

        {card.facility ? (
          <div>
            <h3 className="section-title">{copy.propertyOpsFacility}</h3>
            <p className="ops-page-meta">
              {card.facility.check_in}–{card.facility.check_out}
              {card.facility.max_guests != null
                ? ` · max ${card.facility.max_guests}`
                : ""}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function PropertyOpsPage() {
  const copy = useCopy(STEWARD_COPY);
  const focusId = useMemo(() => selectedPropertyId(), []);
  const [data, setData] = useState<PropertyOpsDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchPropertyOpsDashboard()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (!focusId || !data) return;
    const el = document.getElementById(focusId);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusId, data]);

  return (
    <OpsPage
      title={copy.propertyOpsTitle}
      lead={copy.propertyOpsLead}
      error={error}
      loading={!data && !error}
    >
      {data ? (
        <>
          <p className="ops-page-meta">
            {data.company_name} · {data.report_date}
          </p>
          {data.properties.length === 0 ? (
            <p className="muted">{copy.propertyOpsEmpty}</p>
          ) : (
            data.properties.map((card) => (
              <PropertyCard key={card.property_id} card={card} copy={copy} />
            ))
          )}
          <p className="section-cta">
            <a className="btn btn-ghost btn-sm" href="/stays/">
              {copy.propertyOpsOpenStays}
            </a>{" "}
            <a className="btn btn-ghost btn-sm" href="/secretary/workbench/">
              {copy.secretaryWorkbench}
            </a>{" "}
            <a className="btn btn-ghost btn-sm" href="/">
              {copy.propertyOpsHome}
            </a>
          </p>
        </>
      ) : null}
    </OpsPage>
  );
}
