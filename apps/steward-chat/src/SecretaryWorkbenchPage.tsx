import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function workbenchFocusFromSearch(): {
  mail: string | null;
  draft: string | null;
  task: string | null;
  approval: string | null;
} {
  if (typeof window === "undefined") {
    return { mail: null, draft: null, task: null, approval: null };
  }
  const q = new URLSearchParams(window.location.search);
  return {
    mail: q.get("mail"),
    draft: q.get("draft"),
    task: q.get("task"),
    approval: q.get("approval"),
  };
}

export function SecretaryWorkbenchPage() {
  const copy = useCopy(STEWARD_COPY);
  const [data, setData] = useState<SecretaryWorkbench | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asanaBusy, setAsanaBusy] = useState<string | null>(null);
  const [asanaMsg, setAsanaMsg] = useState<string | null>(null);
  const focus = useMemo(() => workbenchFocusFromSearch(), []);
  const focusRef = useRef<HTMLElement | null>(null);

  const reload = useCallback(() => {
    setError(null);
    void fetchSecretaryWorkbench()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!data || !focusRef.current) return;
    focusRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [data]);

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
  const setFocusRef = (el: HTMLElement | null, match: boolean) => {
    if (match) focusRef.current = el;
  };

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

      <p className="muted">{copy.secretaryHumanMailNote}</p>

      {data.mail_setup && !data.mail_setup.ready ? (
        <section className="executive-section ops-card">
          <h2 className="section-title">{copy.secretaryMailSetup}</h2>
          <p className="page-desc muted">{copy.secretaryMailSetupLead}</p>
          <ul>
            {data.mail_setup.issues.map((issue) => (
              <li key={issue.id}>
                {issue.message}
                {issue.fix ? ` → ${issue.fix}` : ""}
              </li>
            ))}
          </ul>
          <p className="section-cta">
            <a className="btn btn-primary btn-sm" href={data.mail_setup.href}>
              {copy.secretaryMailSetupFix}
            </a>
          </p>
        </section>
      ) : null}

      <section className="executive-section">
        <h2 className="section-title">{copy.secretaryPanelMail}</h2>
        {data.mail.length === 0 ? (
          <p className="muted">{copy.secretaryEmptyMail}</p>
        ) : (
          <ul className="executive-card-list">
            {data.mail.map((row) => {
              const focused = focus.mail === row.id;
              return (
                <li key={row.id}>
                  <a
                    className={
                      focused ? "executive-card is-focus" : "executive-card"
                    }
                    href={row.href}
                    ref={(el) => setFocusRef(el, focused)}
                  >
                    <RowSeverity severity={row.severity} />
                    <span className="executive-card-kind">{row.from_label}</span>
                    <strong className="executive-card-title">{row.subject}</strong>
                    <span className="muted">
                      {row.importance}/{row.urgency}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="executive-section">
        <h2 className="section-title">{copy.secretaryPanelDrafts}</h2>
        {data.drafts.length === 0 ? (
          <p className="muted">{copy.secretaryEmptyDrafts}</p>
        ) : (
          <ul className="executive-card-list">
            {data.drafts.map((row) => {
              const focused = focus.draft === row.id;
              return (
                <li key={row.id}>
                  <a
                    className={
                      focused ? "executive-card is-focus" : "executive-card"
                    }
                    href={row.href}
                    ref={(el) => setFocusRef(el, focused)}
                  >
                    <span className="executive-card-kind">{row.to_label}</span>
                    <strong className="executive-card-title">{row.subject}</strong>
                    <span className="muted">{row.status}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="executive-section">
        <h2 className="section-title">{copy.secretaryPanelTasks}</h2>
        {data.tasks.length === 0 ? (
          <p className="muted">{copy.secretaryEmptyTasks}</p>
        ) : (
          <ul className="executive-card-list">
            {data.tasks.map((row) => {
              const focused = focus.task === row.id;
              return (
                <li key={`${row.candidate ? "c" : "t"}-${row.id}`}>
                  <div
                    className={
                      focused
                        ? "executive-card secretary-task-row is-focus"
                        : "executive-card secretary-task-row"
                    }
                    ref={(el) => setFocusRef(el, focused)}
                  >
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
              );
            })}
          </ul>
        )}
      </section>

      <section className="executive-section">
        <h2 className="section-title">{copy.secretaryPanelApprovals}</h2>
        {data.approvals.length === 0 ? (
          <p className="muted">{copy.secretaryEmptyApprovals}</p>
        ) : (
          <ul className="executive-card-list">
            {data.approvals.map((row) => {
              const focused = focus.approval === row.id;
              return (
                <li key={row.id}>
                  <a
                    className={
                      focused ? "executive-card is-focus" : "executive-card"
                    }
                    href={row.href}
                    ref={(el) => setFocusRef(el, focused)}
                  >
                    <RowSeverity severity={row.severity} />
                    <strong className="executive-card-title">{row.title}</strong>
                    <span className="muted">{row.status}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="section-cta">
        <a className="btn btn-ghost btn-sm" href="/secretary/">
          {copy.secretary}
        </a>{" "}
        <a className="btn btn-ghost btn-sm" href="/?integrations=1">
          {copy.secretaryOpenIntegrations}
        </a>{" "}
        <a className="btn btn-ghost btn-sm" href="/properties/">
          {copy.propertyOpsTitle}
        </a>{" "}
        <a className="btn btn-ghost btn-sm" href="/approvals/">
          {copy.secretaryPanelApprovals}
        </a>{" "}
        <a className="btn btn-ghost btn-sm" href="/wire/">
          {copy.executiveKindWire}
        </a>
      </p>
    </main>
  );
}
