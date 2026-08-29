import { useCallback, useEffect, useState } from "react";
import {
  fetchOrgChart,
  fetchOrgChartChanges,
  postOrgChartChangeApply,
  postOrgChartChangePropose,
  postOrgChartChangeValidate,
  type OrgChartChangeProposalRow,
  type CompanyOrgAdvisorRow,
  type CompanyOrgMember,
  type CompanyOrgUnitRow,
  type CompanyOrgUserRow,
  type OrgChartPayload,
} from "./api";
import { useUiLocale } from "@ops-shared/useUiLocale";

const COPY = {
  ja: {
    pageTitle: "組織",
    usersTitle: "ユーザー",
    advisorsTitle: "外部専門家",
    advisorsLead: "顧問契約の有無。コンソールのユーザーではありません。",
    companySettings: "会社の設定",
    historySelect: "表示する時点",
    current: "現行",
    historical: "時点の記録",
    empty: "組織の記録はまだありません",
    emptyLead: "取締役会で定めた部門と報告先を置くと、ここに出ます。",
    loading: "読み込み中…",
    kindBoard: "取締役会",
    kindDept: "部門",
    reportsTo: "報告先",
    vacant: "未着任",
    collegial: "合議",
    seeBelow: "下の代表を参照",
    peopleCount: (n: number) => `${n}人`,
    readyCount: (ready: number, total: number) => `${ready}/${total}人が準備済み`,
    setupReady: "準備済み",
    setupLoginOnly: "ログインIDあり · PassKey未設定",
    setupNone: "ログイン未設定",
    setupPasskeyOnly: "PassKey済み · 決済未設定",
    loginId: "ログインID",
    loginIdMissing: "未発行",
    communityLogin: "Community ログイン",
    loginPasskey: "ログイン PassKey",
    settlementPasskey: "決済 PassKey",
    done: "済み",
    pending: "未設定",
    title: "役職",
    role: "役割",
    note: "メモ",
    unit: "所属",
    rights: "アクセス権",
    roleCeo: "CEO",
    roleApprover: "承認者",
    roleOperator: "オペレーター",
    roleReadonly: "閲覧",
    roleAuditor: "監査",
    roleMcp: "サービス",
    rightApprove: "承認",
    rightWire: "Wire",
    rightTransfer: "振込",
    rightChat: "チャット",
    rightAllAgents: "全エージェント",
    rightsNone: "コンソールに入れない",
    usersEmpty: "会社のユーザーはまだいません。",
    expandHint: "開くと詳細",
    kindLegal: "顧問弁護士",
    kindTax: "税理士",
    kindTechnical: "技術顧問",
    statusEngaged: "契約中",
    statusNone: "未契約",
    personName: "氏名",
    firm: "事務所",
    contract: "契約",
    changeTitle: "組織変更（OCH）",
    changeLead:
      "変更は稟議（APR）が承認済みであることが前提です。承認は承認キューから行います。",
    changeApprovalId: "稟議ID（APR-…）",
    changeIntent: "変更の意図",
    changeAction: "操作",
    changeNodeId: "ノードID",
    changeReason: "理由",
    changeRegId: "規程ID（REG-…）",
    changeClause: "条項",
    changeArtifact: "根拠文書パス",
    changeDisplayName: "表示名（update 時）",
    changeReportsTo: "報告先（update 時）",
    changePropose: "提案を記録",
    changeValidate: "差分を確認（dry-run）",
    changeApply: "適用（承認済みのみ）",
    changeApprovalQueue: "承認キューへ",
    changeEmpty: "提案はありません。",
    changeRemoveNote:
      "remove は、そのノードを報告先にしている部門が残っていると拒否されます。",
  },
  en: {
    pageTitle: "Organization",
    usersTitle: "Users",
    advisorsTitle: "External specialists",
    advisorsLead: "Retained advisors. They are not console users.",
    companySettings: "Company settings",
    historySelect: "As of date",
    current: "Current",
    historical: "historical record",
    empty: "No organization record yet",
    emptyLead: "Add board-approved units and reporting lines to see them here.",
    loading: "Loading…",
    kindBoard: "Board",
    kindDept: "Department",
    reportsTo: "Reports to",
    vacant: "Vacant",
    collegial: "Collegial",
    seeBelow: "See officers below",
    peopleCount: (n: number) => `${n} people`,
    readyCount: (ready: number, total: number) => `${ready}/${total} ready`,
    setupReady: "Ready",
    setupLoginOnly: "Login ID set · PassKey missing",
    setupNone: "Login not set",
    setupPasskeyOnly: "PassKey ready · settlement missing",
    loginId: "Login ID",
    loginIdMissing: "Not issued",
    communityLogin: "Community login",
    loginPasskey: "Login PassKey",
    settlementPasskey: "Settlement PassKey",
    done: "Done",
    pending: "Not set",
    title: "Title",
    role: "Role",
    note: "Note",
    unit: "Unit",
    rights: "Access",
    roleCeo: "CEO",
    roleApprover: "Approver",
    roleOperator: "Operator",
    roleReadonly: "Read-only",
    roleAuditor: "Auditor",
    roleMcp: "Service",
    rightApprove: "Approve",
    rightWire: "Wire",
    rightTransfer: "Transfer",
    rightChat: "Chat",
    rightAllAgents: "All agents",
    rightsNone: "No console access",
    usersEmpty: "No company users yet.",
    expandHint: "Open for details",
    kindLegal: "Legal counsel",
    kindTax: "Tax advisor",
    kindTechnical: "Technical advisor",
    statusEngaged: "Engaged",
    statusNone: "Not engaged",
    personName: "Name",
    firm: "Firm",
    contract: "Contract",
    changeTitle: "Org chart change (OCH)",
    changeLead:
      "Apply requires an approved internal approval (APR). Approve it in the approvals queue.",
    changeApprovalId: "Approval id (APR-…)",
    changeIntent: "Intent",
    changeAction: "Action",
    changeNodeId: "Node id",
    changeReason: "Reason",
    changeRegId: "Regulation id (REG-…)",
    changeClause: "Clause",
    changeArtifact: "Evidence path",
    changeDisplayName: "Display name (update)",
    changeReportsTo: "Reports to (update)",
    changePropose: "Record proposal",
    changeValidate: "Preview diff (dry-run)",
    changeApply: "Apply (approved only)",
    changeApprovalQueue: "Approvals queue",
    changeEmpty: "No proposals.",
    changeRemoveNote:
      "Remove is rejected while another unit still reports to that node.",
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function roleLabel(role: string | undefined, copy: Copy): string {
  switch (role) {
    case "ceo":
      return copy.roleCeo;
    case "approver":
      return copy.roleApprover;
    case "operator":
      return copy.roleOperator;
    case "readonly":
      return copy.roleReadonly;
    case "auditor":
      return copy.roleAuditor;
    case "mcp_service":
      return copy.roleMcp;
    default:
      return "";
  }
}

function rightsLabel(rights: CompanyOrgMember["rights"], copy: Copy): string {
  if (rights.length === 0) return copy.rightsNone;
  const map: Record<CompanyOrgMember["rights"][number], string> = {
    approve: copy.rightApprove,
    wire: copy.rightWire,
    transfer: copy.rightTransfer,
    chat: copy.rightChat,
    all_agents: copy.rightAllAgents,
  };
  return rights.map((r) => map[r]).join(" · ");
}

function setupPhrase(member: Pick<
  CompanyOrgMember,
  "login_id_ready" | "login_passkey_ready" | "settlement_passkey_ready"
>, copy: Copy): string {
  if (!member.login_id_ready) return copy.setupNone;
  if (!member.login_passkey_ready) return copy.setupLoginOnly;
  if (!member.settlement_passkey_ready) return copy.setupPasskeyOnly;
  return copy.setupReady;
}

function setupTone(
  member: Pick<CompanyOrgMember, "login_id_ready" | "login_passkey_ready">
): "ready" | "partial" | "none" {
  if (!member.login_id_ready) return "none";
  if (!member.login_passkey_ready) return "partial";
  return "ready";
}

function unitOverview(unit: CompanyOrgUnitRow, copy: Copy): string {
  if (unit.vacant) return copy.vacant;
  if (unit.collegial && unit.members.length === 0) return copy.seeBelow;
  if (unit.members.length === 0) return copy.vacant;
  const names = unit.members.map((m) => m.name).join("、");
  if (unit.members.length === 1) {
    return `${names} · ${setupPhrase(unit.members[0]!, copy)}`;
  }
  const ready = unit.members.filter((m) => m.login_id_ready && m.login_passkey_ready).length;
  return `${names} · ${copy.readyCount(ready, unit.members.length)}`;
}

function ReadyMark({ done, copy }: { done: boolean; copy: Copy }) {
  return (
    <span className={done ? "org-ready-mark is-done" : "org-ready-mark is-pending"}>
      {done ? copy.done : copy.pending}
    </span>
  );
}

function MemberDetails({
  member,
  copy,
  unitLabel,
}: {
  member: CompanyOrgMember;
  copy: Copy;
  unitLabel?: string;
}) {
  const role = roleLabel(member.role, copy);
  return (
    <dl className="org-detail-list">
      {member.title ? (
        <>
          <dt>{copy.title}</dt>
          <dd>{member.title}</dd>
        </>
      ) : null}
      {role ? (
        <>
          <dt>{copy.role}</dt>
          <dd>{role}</dd>
        </>
      ) : null}
      {unitLabel ? (
        <>
          <dt>{copy.unit}</dt>
          <dd>{unitLabel}</dd>
        </>
      ) : null}
      {member.note ? (
        <>
          <dt>{copy.note}</dt>
          <dd>{member.note}</dd>
        </>
      ) : null}
      <dt>{copy.loginId}</dt>
      <dd>{member.operator_id ?? copy.loginIdMissing}</dd>
      <dt>{copy.communityLogin}</dt>
      <dd>
        <ReadyMark done={member.community_login_ready} copy={copy} />
      </dd>
      <dt>{copy.loginPasskey}</dt>
      <dd>
        <ReadyMark done={member.login_passkey_ready} copy={copy} />
      </dd>
      <dt>{copy.settlementPasskey}</dt>
      <dd>
        <ReadyMark done={member.settlement_passkey_ready} copy={copy} />
      </dd>
      <dt>{copy.rights}</dt>
      <dd>{rightsLabel(member.rights, copy)}</dd>
    </dl>
  );
}

function UnitCard({ unit, copy }: { unit: CompanyOrgUnitRow; copy: Copy }) {
  const kind = unit.kind === "board" ? copy.kindBoard : copy.kindDept;
  return (
    <details
      className="org-card"
      style={{ marginLeft: `calc(var(--space-5) * ${unit.depth})` }}
    >
      <summary className="org-card-summary">
        <span className="org-card-title">{unit.unit_label}</span>
        <span className="org-card-overview">{unitOverview(unit, copy)}</span>
      </summary>
      <div className="org-card-body">
        <p className="org-chart-muted">
          {kind}
          {unit.function ? ` · ${unit.function}` : ""}
          {` · ${copy.reportsTo} ${unit.reports_to_label}`}
        </p>
        {unit.collegial && unit.members.length === 0 ? (
          <p className="org-chart-muted">{copy.seeBelow}</p>
        ) : null}
        {unit.vacant ? <p className="org-chart-muted">{copy.vacant}</p> : null}
        {unit.members.map((member) => (
          <div key={`${unit.unit_id}:${member.name}`} className="org-member-block">
            <p className="org-member-name">
              {member.name}
              <span className={`org-setup-pill is-${setupTone(member)}`}>
                {setupPhrase(member, copy)}
              </span>
            </p>
            <MemberDetails member={member} copy={copy} />
          </div>
        ))}
      </div>
    </details>
  );
}

function UserCard({ user, copy }: { user: CompanyOrgUserRow; copy: Copy }) {
  const role = roleLabel(user.role, copy);
  return (
    <details className="org-card">
      <summary className="org-card-summary">
        <span className="org-card-title">{user.name}</span>
        <span className="org-card-overview">
          {[role, user.unit_label, setupPhrase(user, copy)].filter(Boolean).join(" · ")}
        </span>
      </summary>
      <div className="org-card-body">
        <MemberDetails member={user} copy={copy} unitLabel={user.unit_label} />
      </div>
    </details>
  );
}

function advisorKindLabel(kind: CompanyOrgAdvisorRow["kind"], copy: Copy): string {
  switch (kind) {
    case "legal":
      return copy.kindLegal;
    case "tax":
      return copy.kindTax;
    case "technical":
      return copy.kindTechnical;
  }
}

function advisorOverview(advisor: CompanyOrgAdvisorRow, copy: Copy): string {
  if (advisor.status === "none") return copy.statusNone;
  return [advisor.name, advisor.firm].filter(Boolean).join(" · ") || copy.statusEngaged;
}

function AdvisorCard({ advisor, copy }: { advisor: CompanyOrgAdvisorRow; copy: Copy }) {
  const kind = advisorKindLabel(advisor.kind, copy);
  const overview = advisorOverview(advisor, copy);
  const hasDetail =
    advisor.status === "engaged" &&
    Boolean(advisor.name || advisor.firm || advisor.note || advisor.contract_id);
  if (!hasDetail) {
    return (
      <div className="org-card">
        <div className="org-card-heading">
          <span className="org-card-title">{kind}</span>
          <span className="org-card-overview">{overview}</span>
        </div>
      </div>
    );
  }
  return (
    <details className="org-card">
      <summary className="org-card-summary">
        <span className="org-card-title">{kind}</span>
        <span className="org-card-overview">{overview}</span>
      </summary>
      <div className="org-card-body">
        <dl className="org-detail-list">
          {advisor.name ? (
            <>
              <dt>{copy.personName}</dt>
              <dd>{advisor.name}</dd>
            </>
          ) : null}
          {advisor.firm ? (
            <>
              <dt>{copy.firm}</dt>
              <dd>{advisor.firm}</dd>
            </>
          ) : null}
          {advisor.contract_id ? (
            <>
              <dt>{copy.contract}</dt>
              <dd>{advisor.contract_id}</dd>
            </>
          ) : null}
          {advisor.note ? (
            <>
              <dt>{copy.note}</dt>
              <dd>{advisor.note}</dd>
            </>
          ) : null}
        </dl>
      </div>
    </details>
  );
}

function AdvisorsSection({
  advisors,
  copy,
}: {
  advisors: CompanyOrgAdvisorRow[];
  copy: Copy;
}) {
  return (
    <section className="org-chart-section" aria-labelledby="org-advisors-title">
      <h2 id="org-advisors-title" className="org-chart-section-title">
        {copy.advisorsTitle}
      </h2>
      <p className="org-chart-muted roster-lead">{copy.advisorsLead}</p>
      <div className="org-card-list">
        {advisors.map((advisor) => (
          <AdvisorCard key={advisor.kind} advisor={advisor} copy={copy} />
        ))}
      </div>
    </section>
  );
}

const CHANGE_INTENTS = [
  "display_correction",
  "canonical_name_change",
  "org_structure_change",
] as const;

const CHANGE_ACTIONS = ["add", "update", "remove"] as const;

function OrgChartChangePanel({ copy }: { copy: Copy }) {
  const [proposals, setProposals] = useState<OrgChartChangeProposalRow[]>([]);
  const [approvalId, setApprovalId] = useState("");
  const [intent, setIntent] =
    useState<(typeof CHANGE_INTENTS)[number]>("display_correction");
  const [action, setAction] = useState<(typeof CHANGE_ACTIONS)[number]>("update");
  const [nodeId, setNodeId] = useState("");
  const [reason, setReason] = useState("");
  const [regId, setRegId] = useState("REG-002");
  const [clause, setClause] = useState("");
  const [artifact, setArtifact] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [reportsTo, setReportsTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetchOrgChartChanges();
      setProposals(res.proposals ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setError(null);
    try {
      setNote(await fn());
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function buildChange(): unknown {
    const changes: Record<string, unknown> = {};
    if (displayName.trim()) changes.display_name = displayName.trim();
    if (reportsTo.trim()) changes.reports_to = reportsTo.trim();
    return {
      intent,
      action,
      node_id: nodeId.trim(),
      reason: reason.trim(),
      regulation_ref: {
        reg_id: regId.trim(),
        clause: clause.trim(),
        artifact_path: artifact.trim(),
      },
      ...(action === "update" ? { changes } : {}),
    };
  }

  return (
    <section className="org-chart-section" aria-labelledby="org-change-title">
      <h2 id="org-change-title" className="org-chart-section-title">
        {copy.changeTitle}
      </h2>
      <p className="org-chart-muted roster-lead">{copy.changeLead}</p>
      <p className="org-chart-muted">{copy.changeRemoveNote}</p>
      {error ? (
        <p className="org-chart-error" role="alert">
          {error}
        </p>
      ) : null}
      {note ? <p className="org-chart-muted">{note}</p> : null}

      <div className="approvals-ceo-fields">
        <label className="approvals-ceo-field">
          <span>{copy.changeApprovalId}</span>
          <input value={approvalId} onChange={(e) => setApprovalId(e.target.value)} />
        </label>
        <label className="approvals-ceo-field">
          <span>{copy.changeIntent}</span>
          <select
            value={intent}
            onChange={(e) => setIntent(e.target.value as (typeof CHANGE_INTENTS)[number])}
          >
            {CHANGE_INTENTS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
        <label className="approvals-ceo-field">
          <span>{copy.changeAction}</span>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as (typeof CHANGE_ACTIONS)[number])}
          >
            {CHANGE_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="approvals-ceo-field">
          <span>{copy.changeNodeId}</span>
          <input value={nodeId} onChange={(e) => setNodeId(e.target.value)} />
        </label>
        <label className="approvals-ceo-field">
          <span>{copy.changeReason}</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <label className="approvals-ceo-field">
          <span>{copy.changeRegId}</span>
          <input value={regId} onChange={(e) => setRegId(e.target.value)} />
        </label>
        <label className="approvals-ceo-field">
          <span>{copy.changeClause}</span>
          <input value={clause} onChange={(e) => setClause(e.target.value)} />
        </label>
        <label className="approvals-ceo-field">
          <span>{copy.changeArtifact}</span>
          <input value={artifact} onChange={(e) => setArtifact(e.target.value)} />
        </label>
        {action === "update" ? (
          <>
            <label className="approvals-ceo-field">
              <span>{copy.changeDisplayName}</span>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </label>
            <label className="approvals-ceo-field">
              <span>{copy.changeReportsTo}</span>
              <input value={reportsTo} onChange={(e) => setReportsTo(e.target.value)} />
            </label>
          </>
        ) : null}
      </div>

      <div className="approvals-queue-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || !approvalId.trim() || !nodeId.trim() || !reason.trim()}
          onClick={() =>
            void run(async () => {
              const res = await postOrgChartChangePropose({
                approval_id: approvalId.trim(),
                change: buildChange(),
              });
              return res.proposal.change_id;
            })
          }
        >
          {copy.changePropose}
        </button>
        <a className="btn btn-ghost btn-sm" href="/approvals/">
          {copy.changeApprovalQueue}
        </a>
      </div>

      {proposals.length === 0 ? (
        <p className="org-chart-muted">{copy.changeEmpty}</p>
      ) : (
        <div className="org-card-list">
          {proposals.map((p) => (
            <div key={p.change_id} className="org-card">
              <div className="org-card-heading">
                <span className="org-card-title">{p.change_id}</span>
                <span className="org-card-overview">
                  {p.action} · {p.node_id} · {p.approval_id}
                </span>
              </div>
              <div className="approvals-queue-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const res = await postOrgChartChangeValidate(p.change_id);
                      return `${res.result.before_hash.slice(0, 18)}… → ${res.result.after_hash.slice(0, 18)}…`;
                    })
                  }
                >
                  {copy.changeValidate}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const res = await postOrgChartChangeApply(p.change_id);
                      return res.result.logical_path;
                    })
                  }
                >
                  {copy.changeApply}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Company organization — collapsed overview, expand for login / PassKey readiness.
 */
export function OrgChartPage() {
  const copy = COPY[useUiLocale()];
  const [payload, setPayload] = useState<OrgChartPayload | null>(null);
  const [asOf, setAsOf] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const next = await fetchOrgChart(asOf || undefined);
        if (!cancelled) setPayload(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asOf]);

  const history = payload?.history ?? [];
  const units = payload && !payload.missing ? payload.units : [];
  const users = payload && !payload.missing ? payload.users : [];
  const advisors = payload?.advisors ?? [];

  return (
    <div className="org-chart-page">
      <p className="org-chart-muted">
        <a href="/?onboarding=1">{copy.companySettings}</a>
      </p>
      {loading && <p className="org-chart-muted">{copy.loading}</p>}
      {error && (
        <p className="org-chart-error" role="alert">
          {error}
        </p>
      )}

      {payload && history.length > 0 ? (
        <div className="org-chart-toolbar">
          <label className="org-chart-history-picker">
            <select
              className="locale-picker-select"
              value={asOf || payload.viewing_as_of || ""}
              onChange={(e) => setAsOf(e.target.value)}
              aria-label={copy.historySelect}
            >
              {history.map((row) => (
                <option
                  key={`${row.as_of}-${row.change_id ?? row.notes ?? "cur"}`}
                  value={row.as_of}
                >
                  {row.as_of}
                  {row.current ? ` · ${copy.current}` : ""}
                </option>
              ))}
            </select>
          </label>
          {payload.is_historical && payload.viewing_as_of ? (
            <p className="org-chart-meta">
              {payload.viewing_as_of} {copy.historical}
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="org-chart-muted">
        <a href="/contracts/">契約</a>
        {" · "}
        <a href="/stays/">宿泊</a>
      </p>

      {!loading && !error && payload?.missing && (
        <div className="empty-state">
          <strong>{copy.empty}</strong>
          <p>{copy.emptyLead}</p>
        </div>
      )}

      {!loading && !error && payload && !payload.missing ? (
        <>
          <section className="org-chart-section" aria-labelledby="org-units-title">
            <h1 id="org-units-title" className="org-chart-section-title">
              {payload.company_name || copy.pageTitle}
            </h1>
            <p className="org-chart-muted roster-lead">{copy.expandHint}</p>
            <div className="org-card-list">
              {units.map((unit) => (
                <UnitCard key={unit.unit_id} unit={unit} copy={copy} />
              ))}
            </div>
          </section>

          <section className="org-chart-section" aria-labelledby="org-users-title">
            <h2 id="org-users-title" className="org-chart-section-title">
              {copy.usersTitle}
            </h2>
            {users.length === 0 ? (
              <p className="org-chart-muted">{copy.usersEmpty}</p>
            ) : (
              <div className="org-card-list">
                {users.map((user) => (
                  <UserCard key={`${user.operator_id ?? user.name}`} user={user} copy={copy} />
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      {!loading && !error && payload && advisors.length > 0 ? (
        <AdvisorsSection advisors={advisors} copy={copy} />
      ) : null}

      <OrgChartChangePanel copy={copy} />
    </div>
  );
}
