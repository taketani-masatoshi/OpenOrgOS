import { useCallback, useEffect, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { STEWARD_COPY } from "./steward-copy";
import {
  fetchSecretaryWorkbench,
  postAsanaPush,
  type SecretaryWorkbench,
} from "./api";

function formatYen(n: number): string {
  return `${Math.round(n).toLocaleString("ja-JP")} 円`;
}

function RowSeverity({ severity }: { severity: "p0" | "p1" | "p2" }) {
  return (
    <span className={`executive-severity executive-severity-${severity}`}>
      {severity.toUpperCase()}
    </span>
  );
}

export function SecretaryWorkbenchPage() {
  const copy = useCopy(STEWARD_COPY);
  const [data, setData] = useState<SecretaryWorkbench | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asanaBusy, setAsanaBusy] = useState<string | null>(null);
  const [asanaMsg, setAsanaMsg] = useState<string | null>(null);

  const reload = useCallback(() => {
    setError(null);
    void fetchSecretaryWorkbench()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function mirrorAsana(taskId: string) {
    setAsanaBusy(taskId);
    setAsanaMsg(null);
    try {
      const result = await postAsanaPush({
        kind: "executive_task",
        id: taskId,
      });
      if (!result.ok) {
        setAsanaMsg(result.reason ?? copy.secretaryAsanaFailed);
      } else {
        setAsanaMsg(
          result.created
            ? copy.secretaryAsanaCreated
            : copy.secretaryAsanaUpdated,
        );
        reload();
      }
    } catch (e) {
      setAsanaMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setAsanaBusy(null);
    }
  }

  if (error) {
    return (
      <main className="workspace ops-page">
        <h1>{copy.secretaryWorkbench}</h1>
        <p className="error">{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="workspace ops-page">
        <h1>{copy.secretaryWorkbench}</h1>
        <p className="muted">{copy.loading}</p>
      </main>
    );
  }

  const { company } = data;

  return (
    <main className="workspace ops-page executive-home secretary-workbench">
      <header className="executive-home-header">
        <div>
          <h1>{copy.secretaryWorkbench}</h1>
          <p className="ops-page-meta">
            {data.company_name} · {data.report_date}
          </p>
          <p className="muted">{copy.secretaryWorkbenchLead}</p>
        </div>
        <dl className="executive-home-kpis">
          <div>
            <dt>{copy.secretaryStatP0}</dt>
            <dd>{company.tasks_p0}</dd>
          </div>
          <div>
            <dt>{copy.secretaryStatOpen}</dt>
            <dd>{company.tasks_open}</dd>
          </div>
          <div>
            <dt>{copy.secretaryStatMail}</dt>
            <dd>
              {company.mail_action_required}/{company.mail_pending}
            </dd>
          </div>
          <div>
            <dt>{copy.secretaryStatApprovals}</dt>
            <dd>{company.approvals_pending}</dd>
          </div>
          {company.cash_balance != null ? (
            <div>
              <dt>{copy.secretaryStatCash}</dt>
              <dd>{formatYen(company.cash_balance)}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      {asanaMsg ? <p className="ops-page-meta">{asanaMsg}</p> : null}

      <section className="executive-section">
        <h2 className="section-title">{copy.secretaryPanelMail}</h2>
        {data.mail.length === 0 ? (
          <p className="muted">{copy.secretaryEmptyMail}</p>
        ) : (
          <ul className="executive-card-list">
            {data.mail.map((row) => (
              <li key={row.id}>
                <a className="executive-card" href={row.href}>
                  <RowSeverity severity={row.severity} />
                  <span className="executive-card-kind">{row.from_label}</span>
                  <strong className="executive-card-title">{row.subject}</strong>
                  <span className="muted">
                    {row.importance}/{row.urgency}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="executive-section">
        <h2 className="section-title">{copy.secretaryPanelDrafts}</h2>
        {data.drafts.length === 0 ? (
          <p className="muted">{copy.secretaryEmptyDrafts}</p>
        ) : (
          <ul className="executive-card-list">
            {data.drafts.map((row) => (
              <li key={row.id}>
                <a className="executive-card" href={row.href}>
                  <span className="executive-card-kind">{row.to_label}</span>
                  <strong className="executive-card-title">{row.subject}</strong>
                  <span className="muted">{row.status}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="executive-section">
        <h2 className="section-title">{copy.secretaryPanelTasks}</h2>
        {data.tasks.length === 0 ? (
          <p className="muted">{copy.secretaryEmptyTasks}</p>
        ) : (
          <ul className="executive-card-list">
            {data.tasks.map((row) => (
              <li key={`${row.candidate ? "c" : "t"}-${row.id}`}>
                <div className="executive-card secretary-task-row">
                  <a href={row.href} className="secretary-task-main">
                    <RowSeverity severity={row.severity} />
                    <span className="executive-card-kind">
                      {row.candidate
                        ? copy.secretaryCandidate
                        : row.property_id || row.module_id || row.status}
                    </span>
                    <strong className="executive-card-title">{row.title}</strong>
                    {row.due ? (
                      <span className="muted">
                        {copy.secretaryDue}: {row.due}
                      </span>
                    ) : null}
                    {row.next_action ? (
                      <span className="muted">{row.next_action}</span>
                    ) : null}
                  </a>
                  {!row.candidate ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={asanaBusy === row.id}
                      onClick={() => void mirrorAsana(row.id)}
                    >
                      {row.asana_task_gid
                        ? copy.secretaryAsanaSync
                        : copy.secretaryAsanaPush}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="executive-section">
        <h2 className="section-title">{copy.secretaryPanelApprovals}</h2>
        {data.approvals.length === 0 ? (
          <p className="muted">{copy.secretaryEmptyApprovals}</p>
        ) : (
          <ul className="executive-card-list">
            {data.approvals.map((row) => (
              <li key={row.id}>
                <a className="executive-card" href={row.href}>
                  <RowSeverity severity={row.severity} />
                  <strong className="executive-card-title">{row.title}</strong>
                  <span className="muted">{row.status}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="section-cta">
        <a className="btn btn-ghost btn-sm" href="/secretary/">
          {copy.secretary}
        </a>{" "}
        <a className="btn btn-ghost btn-sm" href="/wire/">
          Wire / Mail
        </a>{" "}
        <a className="btn btn-ghost btn-sm" href="/approvals/">
          {copy.secretaryPanelApprovals}
        </a>
      </p>
    </main>
  );
}
