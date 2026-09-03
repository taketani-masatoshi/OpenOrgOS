import { useEffect, useMemo, useState } from "react";
import {
  fetchAgentModuleInventory,
  importCatalogModule,
  proposeModuleEnabled,
  setAgentEnabled,
  type AgentInventoryRow,
  type AgentModuleInventory,
  type ModuleInventoryRow,
} from "./api";
import { useCopy } from "@ops-shared/define-copy";
import { STEWARD_COPY } from "./steward-copy";

export type RosterView = "agents" | "modules" | "agents-add" | "modules-add";

function matchesQuery(query: string, ...fields: Array<string | undefined>): boolean {
  const q = query.normalize("NFKC").trim().toLowerCase();
  if (!q) return true;
  return fields.some((field) => (field ?? "").normalize("NFKC").toLowerCase().includes(q));
}

function Switch({
  checked,
  disabled,
  busy,
  label,
  onLabel,
  offLabel,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  busy?: boolean;
  label: string;
  onLabel: string;
  offLabel: string;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={checked ? "roster-switch is-on" : "roster-switch"}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || busy}
      onClick={() => onToggle(!checked)}
    >
      <span className="roster-switch-track" aria-hidden="true" />
      <span className="roster-switch-state">{checked ? onLabel : offLabel}</span>
    </button>
  );
}

type Copy = ReturnType<typeof useCopy<typeof STEWARD_COPY.ja>>;

function laneCopy(row: AgentInventoryRow, copy: Copy): string {
  if (row.request_lane === "owner_to_steward") return copy.agentLaneSteward;
  if (row.request_lane === "owner_to_secretary") return copy.agentLaneSecretary;
  return copy.agentLaneViaSteward;
}

function AgentRow({
  row,
  copy,
  canMutate,
  busy,
  mode,
  onToggle,
  onAdd,
}: {
  row: AgentInventoryRow;
  copy: Copy;
  canMutate: boolean;
  busy: boolean;
  mode: "list" | "add";
  onToggle?: (id: string, enabled: boolean) => void;
  onAdd?: (id: string) => void;
}) {
  const lockHint =
    row.lock_reason === "owner_desk"
      ? copy.agentLockedOwnerDesk
      : row.lock_reason === "required"
        ? copy.agentLockedRequired
        : row.lock_reason === "module_enabled"
          ? copy.agentLockedModule
          : null;
  const desk = row.owner_desk && mode === "list";
  return (
    <li className={desk ? "roster-row is-desk" : "roster-row"}>
      <div className="roster-row-main">
        <h3 className="roster-row-title">
          {row.label}
          {desk ? <span className="roster-badge">{copy.agentDeskBadge}</span> : null}
        </h3>
        <p className="roster-row-id">{row.id}</p>
        {row.scope ? <p className="org-chart-muted">{row.scope}</p> : null}
        <p className="roster-row-lane">{laneCopy(row, copy)}</p>
        {row.reports_to_label ? (
          <p className="org-chart-muted">{copy.reportsToLine(row.reports_to_label)}</p>
        ) : null}
        {lockHint && !desk ? <p className="roster-row-hint">{lockHint}</p> : null}
        {row.pending ? (
          <p className="roster-row-hint">
            <a href="/approvals/">
              {row.pending.to_enabled ? copy.agentPendingAdd : copy.modulePendingOff}
            </a>
          </p>
        ) : null}
      </div>
      {mode === "add" ? (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!canMutate || busy || row.locked || Boolean(row.pending)}
          onClick={() => onAdd?.(row.id)}
        >
          {busy ? copy.moduleAdding : copy.moduleAdd}
        </button>
      ) : desk ? (
        <p className="roster-desk-fixed">{copy.agentDeskFixed}</p>
      ) : (
        <Switch
          checked={row.enabled}
          disabled={!canMutate || row.locked}
          busy={busy}
          label={copy.toggleAgent(row.label)}
          onLabel={copy.toggleOn}
          offLabel={copy.toggleOff}
          onToggle={(next) => onToggle?.(row.id, next)}
        />
      )}
    </li>
  );
}

function InstalledModuleRow({
  row,
  copy,
  canPropose,
  busy,
  onToggle,
}: {
  row: ModuleInventoryRow;
  copy: Copy;
  canPropose: boolean;
  busy: boolean;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  const pending = row.pending
    ? row.pending.to_enabled
      ? copy.modulePendingOn
      : copy.modulePendingOff
    : null;
  return (
    <li className="roster-row">
      <div className="roster-row-main">
        <h3 className="roster-row-title">{row.label}</h3>
        <p className="roster-row-id">{row.id}</p>
        {row.notes ? <p className="org-chart-muted">{row.notes}</p> : null}
        {pending ? (
          <p className="roster-row-hint">
            <a href="/approvals/">{pending}</a>
          </p>
        ) : null}
      </div>
      <Switch
        checked={row.enabled}
        disabled={!canPropose || Boolean(row.pending)}
        busy={busy}
        label={copy.toggleModule(row.label)}
        onLabel={copy.toggleOn}
        offLabel={copy.toggleOff}
        onToggle={(next) => onToggle(row.id, next)}
      />
    </li>
  );
}

function CatalogModuleRow({
  row,
  copy,
  canMutate,
  busy,
  onAdd,
}: {
  row: ModuleInventoryRow;
  copy: Copy;
  canMutate: boolean;
  busy: boolean;
  onAdd: (id: string) => void;
}) {
  const pending = row.pending
    ? row.pending.to_enabled
      ? copy.modulePendingImport
      : copy.modulePendingOff
    : null;
  return (
    <li className="roster-row">
      <div className="roster-row-main">
        <h3 className="roster-row-title">{row.label}</h3>
        <p className="roster-row-id">{row.id}</p>
        {row.notes ? <p className="org-chart-muted">{row.notes}</p> : null}
        {pending ? (
          <p className="roster-row-hint">
            <a href="/approvals/">{pending}</a>
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={!canMutate || busy || Boolean(row.pending)}
        onClick={() => onAdd(row.id)}
      >
        {busy ? copy.moduleAdding : copy.moduleAdd}
      </button>
    </li>
  );
}

function pageCopy(view: RosterView, copy: Copy): { title: string; lead: string } {
  if (view === "modules") return { title: copy.moduleList, lead: copy.moduleListLead };
  if (view === "agents-add") return { title: copy.agentAdd, lead: copy.agentAddLead };
  if (view === "modules-add") return { title: copy.moduleAddTab, lead: copy.moduleAddLead };
  return { title: copy.agentList, lead: copy.agentListLead };
}

/** Active lists vs add tabs for tenant agents and modules. */
export function AgentRosterPage({ view }: { view: RosterView }) {
  const copy = useCopy(STEWARD_COPY);
  const heading = pageCopy(view, copy);
  const [inventory, setInventory] = useState<AgentModuleInventory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setQuery("");
    setNotice(null);
    setError(null);
  }, [view]);

  async function reload() {
    const next = await fetchAgentModuleInventory();
    setInventory(next);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const next = await fetchAgentModuleInventory();
        if (!cancelled) setInventory(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const agents = useMemo(() => {
    const listed = inventory?.agents ?? [];
    const available = inventory?.agents_available ?? [];
    if (view === "agents") return listed.filter((row) => row.enabled);
    if (view === "agents-add") {
      return [...listed.filter((row) => !row.enabled), ...available];
    }
    return [];
  }, [inventory, view]);

  const modulesOn = useMemo(
    () => (inventory?.modules_installed ?? []).filter((row) => row.enabled),
    [inventory]
  );
  const modulesOff = useMemo(
    () => (inventory?.modules_installed ?? []).filter((row) => !row.enabled),
    [inventory]
  );
  const catalog = inventory?.modules_catalog ?? [];

  const filteredAgents = useMemo(
    () => agents.filter((row) => matchesQuery(query, row.label, row.id, row.scope, row.reports_to_label)),
    [agents, query]
  );
  const deskAgents = useMemo(
    () => filteredAgents.filter((row) => row.owner_desk),
    [filteredAgents]
  );
  const deptAgents = useMemo(
    () => filteredAgents.filter((row) => !row.owner_desk),
    [filteredAgents]
  );
  const filteredModulesOn = useMemo(
    () => modulesOn.filter((row) => matchesQuery(query, row.label, row.id, row.notes)),
    [modulesOn, query]
  );
  const filteredModulesOff = useMemo(
    () => modulesOff.filter((row) => matchesQuery(query, row.label, row.id, row.notes)),
    [modulesOff, query]
  );
  const filteredCatalog = useMemo(
    () => catalog.filter((row) => matchesQuery(query, row.label, row.id, row.notes)),
    [catalog, query]
  );

  async function runAction(
    id: string,
    action: () => Promise<AgentModuleInventory>,
    okNotice?: string
  ) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const next = await action();
      setInventory(next);
      if (okNotice) setNotice(okNotice);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      try {
        await reload();
      } catch {
        /* keep the previous error */
      }
    } finally {
      setBusyId(null);
    }
  }

  const canMutate = inventory?.can_mutate === true;
  const canPropose = inventory?.can_propose === true;
  const searchPlaceholder =
    view === "modules" || view === "modules-add"
      ? copy.moduleSearchPlaceholder
      : copy.agentSearchPlaceholder;

  return (
    <div className="org-chart-page">
      <div className="page-heading roster-page-heading">
        <div>
          <h1 className="org-chart-section-title">{heading.title}</h1>
          <p className="org-chart-muted roster-lead">{heading.lead}</p>
        </div>
        {view === "agents" ? (
          <a className="btn btn-primary" href="/agents/add/">{copy.agentAdd}</a>
        ) : view === "agents-add" ? (
          <a className="btn btn-secondary" href="/agents/">{copy.agentList}</a>
        ) : view === "modules" ? (
          <a className="btn btn-primary" href="/modules/add/">{copy.moduleAddTab}</a>
        ) : (
          <a className="btn btn-secondary" href="/modules/">{copy.moduleList}</a>
        )}
      </div>
      {loading && <p className="org-chart-muted">{copy.loading}</p>}
      {error && (
        <p className="org-chart-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="roster-notice" role="status">
          {notice}
        </p>
      )}
      {!loading && inventory && !canMutate && !canPropose ? (
        <p className="org-chart-muted">{copy.readonlyToggles}</p>
      ) : null}
      {!loading && inventory ? (
        <>
          <label className="roster-search-label">
            {searchPlaceholder}
            <input
              type="search"
              className="roster-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
            />
          </label>

          {view === "agents" ? (
            filteredAgents.length === 0 ? (
              <p className="org-chart-muted">
                {query ? copy.agentNoMatch : copy.agentListEmpty}
              </p>
            ) : (
              <>
                <section className="roster-chain" aria-labelledby="roster-chain-title">
                  <h2 id="roster-chain-title" className="roster-subhead">
                    {copy.agentChainTitle}
                  </h2>
                  <p className="roster-chain-lead">{copy.agentChainLead}</p>
                </section>
                {deskAgents.length > 0 ? (
                  <>
                    <h2 className="roster-subhead">{copy.agentDeskSection}</h2>
                    <ul className="roster-list">
                      {deskAgents.map((row) => (
                        <AgentRow
                          key={row.id}
                          row={row}
                          copy={copy}
                          canMutate={canMutate}
                          busy={busyId === `agent:${row.id}`}
                          mode="list"
                          onToggle={(id, enabled) =>
                            runAction(`agent:${id}`, () => setAgentEnabled(id, enabled))
                          }
                        />
                      ))}
                    </ul>
                  </>
                ) : null}
                {deptAgents.length > 0 ? (
                  <>
                    <h2 className="roster-subhead">{copy.agentDeptSection}</h2>
                    <ul className="roster-list">
                      {deptAgents.map((row) => (
                        <AgentRow
                          key={row.id}
                          row={row}
                          copy={copy}
                          canMutate={canMutate}
                          busy={busyId === `agent:${row.id}`}
                          mode="list"
                          onToggle={(id, enabled) =>
                            runAction(`agent:${id}`, () => setAgentEnabled(id, enabled))
                          }
                        />
                      ))}
                    </ul>
                  </>
                ) : null}
              </>
            )
          ) : null}

          {view === "agents-add" ? (
            filteredAgents.length === 0 ? (
              <p className="org-chart-muted">
                {query ? copy.agentNoMatch : copy.agentAddEmpty}
              </p>
            ) : (
              <ul className="roster-list">
                {filteredAgents.map((row) => (
                  <AgentRow
                    key={row.id}
                    row={row}
                    copy={copy}
                    canMutate={canPropose}
                    busy={busyId === `agent:${row.id}`}
                    mode="add"
                    onAdd={(id) =>
                      runAction(
                        `agent:${id}`,
                        () => setAgentEnabled(id, true),
                        copy.agentProposedAdd
                      )
                    }
                  />
                ))}
              </ul>
            )
          ) : null}

          {view === "modules" ? (
            filteredModulesOn.length === 0 ? (
              <p className="org-chart-muted">
                {query ? copy.moduleNoMatch : copy.moduleListEmpty}
              </p>
            ) : (
              <ul className="roster-list">
                {filteredModulesOn.map((row) => (
                  <InstalledModuleRow
                    key={row.id}
                    row={row}
                    copy={copy}
                    canPropose={canPropose}
                    busy={busyId === `module:${row.id}`}
                    onToggle={(id, enabled) =>
                      runAction(
                        `module:${id}`,
                        () => proposeModuleEnabled(id, enabled),
                        enabled ? copy.moduleProposedOn : copy.moduleProposedOff
                      )
                    }
                  />
                ))}
              </ul>
            )
          ) : null}

          {view === "modules-add" ? (
            modulesOff.length === 0 && catalog.length === 0 ? (
              <p className="org-chart-muted">{copy.moduleEmptyCatalog}</p>
            ) : filteredModulesOff.length === 0 && filteredCatalog.length === 0 ? (
              <p className="org-chart-muted">{copy.moduleNoMatch}</p>
            ) : (
              <ul className="roster-list">
                {filteredModulesOff.map((row) => (
                  <InstalledModuleRow
                    key={row.id}
                    row={row}
                    copy={copy}
                    canPropose={canPropose}
                    busy={busyId === `module:${row.id}`}
                    onToggle={(id, enabled) =>
                      runAction(
                        `module:${id}`,
                        () => proposeModuleEnabled(id, enabled),
                        enabled ? copy.moduleProposedOn : copy.moduleProposedOff
                      )
                    }
                  />
                ))}
                {filteredCatalog.map((row) => (
                  <CatalogModuleRow
                    key={row.id}
                    row={row}
                    copy={copy}
                    canMutate={canPropose}
                    busy={busyId === `import:${row.id}`}
                    onAdd={(id) =>
                      runAction(`import:${id}`, () => importCatalogModule(id), copy.moduleProposedImport)
                    }
                  />
                ))}
              </ul>
            )
          ) : null}
        </>
      ) : null}
    </div>
  );
}
