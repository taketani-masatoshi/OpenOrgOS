import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import {
  BUSINESS_WORKFLOW_SAMPLE,
  documentToMermaid,
  documentToTable,
  parseWorkflowDocument,
  stringifyWorkflowDocument,
  SYSTEM_MAP_SAMPLE,
  type WorkflowDocument,
} from "@orgos/workflow-canvas";
import {
  fetchWorkflow,
  fetchWorkflowChanges,
  postWorkflowChangeApply,
  postWorkflowChangePropose,
  postWorkflowChangeValidate,
  postWorkflowEvaluate,
  type WorkflowFindingRow,
  type WorkflowStructureProposalRow,
} from "./api";
import { OpsPage } from "./OpsPage";
import { STEWARD_COPY } from "./steward-copy";
import {
  WorkflowCanvas,
  type WorkflowCanvasHandle,
} from "./workflow-canvas/WorkflowCanvas";

type CanvasRole = "canonical" | "draft" | "proposed" | "recorded";
type ViewMode = "table" | "canvas" | "mermaid";

const DEFAULT_WORKFLOW_ID = "WF-system-map";

export function WorkflowCanvasPage() {
  const copy = useCopy(STEWARD_COPY);
  const canvasRef = useRef<WorkflowCanvasHandle>(null);
  const [document, setDocument] = useState<WorkflowDocument>(SYSTEM_MAP_SAMPLE);
  const [draft, setDraft] = useState(() => stringifyWorkflowDocument(SYSTEM_MAP_SAMPLE));
  const [role, setRole] = useState<CanvasRole>("draft");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [findings, setFindings] = useState<WorkflowFindingRow[]>([]);
  const [proposed, setProposed] = useState<WorkflowDocument | null>(null);
  const [approvalId, setApprovalId] = useState("");
  const [proposals, setProposals] = useState<WorkflowStructureProposalRow[]>([]);
  const [mermaidCopied, setMermaidCopied] = useState(false);

  const jsonText = useMemo(() => stringifyWorkflowDocument(document), [document]);
  const table = useMemo(() => documentToTable(document), [document]);
  const mermaidSource = useMemo(() => documentToMermaid(document), [document]);

  const roleLabel =
    role === "canonical"
      ? copy.workflowRoleCanonical
      : role === "proposed"
        ? copy.workflowRoleProposed
        : role === "recorded"
          ? copy.workflowRoleRecorded
          : copy.workflowRoleDraft;

  const flushCanvas = useCallback((): WorkflowDocument => {
    const next = canvasRef.current?.exportToJSON();
    if (!next) return document;
    setDocument(next);
    setDraft(stringifyWorkflowDocument(next));
    return next;
  }, [document]);

  const setDocumentState = useCallback((next: WorkflowDocument, nextRole?: CanvasRole) => {
    setDocument(next);
    setDraft(stringifyWorkflowDocument(next));
    if (nextRole) setRole(nextRole);
    canvasRef.current?.importFromJSON(next);
  }, []);

  const switchViewMode = useCallback(
    (next: ViewMode) => {
      if (next === viewMode) return;
      if (viewMode === "canvas") {
        flushCanvas();
      }
      setViewMode(next);
      setMermaidCopied(false);
    },
    [flushCanvas, viewMode],
  );

  const reloadProposals = useCallback(async () => {
    try {
      const res = await fetchWorkflowChanges();
      setProposals(res.proposals ?? []);
    } catch {
      /* list is optional when BFF cold */
    }
  }, []);

  const loadCanonical = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchWorkflow(DEFAULT_WORKFLOW_ID);
      const next = res.document as WorkflowDocument;
      setDocumentState(next, "canonical");
      setFindings([]);
      setProposed(null);
      setNote(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setDocumentState(SYSTEM_MAP_SAMPLE, "draft");
    } finally {
      setBusy(false);
    }
  }, [setDocumentState]);

  useEffect(() => {
    void loadCanonical();
    void reloadProposals();
  }, [loadCanonical, reloadProposals]);

  function syncFromCanvas() {
    if (viewMode !== "canvas") return;
    const next = flushCanvas();
    setRole("draft");
    setError(null);
    setNote(`exported ${next.nodes.length} nodes`);
  }

  function loadSample(sample: WorkflowDocument) {
    setDocumentState(sample, "draft");
    setFindings([]);
    setProposed(null);
    setError(null);
  }

  function applyDraft() {
    try {
      const parsed = parseWorkflowDocument(JSON.parse(draft) as unknown);
      setDocumentState(parsed, "draft");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function runEvaluate() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const current = viewMode === "canvas" ? flushCanvas() : document;
      const res = await postWorkflowEvaluate({ document: current });
      setDocumentState(res.document as WorkflowDocument, "draft");
      setFindings(res.findings);
      setProposed(res.proposed_document as WorkflowDocument);
      setNote(
        res.ok
          ? `evaluate ok · findings ${res.findings.length}`
          : `evaluate has errors · findings ${res.findings.length}`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  function loadProposedOntoCanvas() {
    if (!proposed) return;
    setDocumentState(proposed, "proposed");
    setViewMode("canvas");
    setError(null);
  }

  async function runPropose() {
    if (!proposed) {
      setError("evaluate first");
      return;
    }
    if (!approvalId.trim()) {
      setError("approval_id is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const current = viewMode === "canvas" ? flushCanvas() : document;
      const res = await postWorkflowChangePropose({
        approval_id: approvalId.trim(),
        change: {
          workflow_id: proposed.workflow_id,
          grade: "A",
          reason: "Canvas discussion proposal",
          draft_document: current,
          proposed_document: proposed,
          findings: findings.length
            ? findings
            : [
                {
                  code: "manual_propose",
                  severity: "info",
                  message: "Proposed after canvas discussion",
                },
              ],
        },
      });
      setNote(`recorded ${res.proposal.change_id}`);
      setRole("recorded");
      await reloadProposals();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function copyMermaid() {
    try {
      await navigator.clipboard.writeText(mermaidSource);
      setMermaidCopied(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <OpsPage
      className="workflow-canvas-page"
      title={copy.workflowTitle}
      lead={copy.workflowLead}
    >
      <p className={`workflow-canvas-role workflow-canvas-role--${role}`} role="status">
        {roleLabel}
      </p>

      <div
        className="workflow-canvas-view-tabs"
        role="tablist"
        aria-label={copy.workflowViewModesLabel}
      >
        {(
          [
            ["table", copy.workflowViewTable],
            ["canvas", copy.workflowViewCanvas],
            ["mermaid", copy.workflowViewMermaid],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={viewMode === mode}
            className={`btn btn-sm${viewMode === mode ? " btn-primary" : ""}`}
            onClick={() => switchViewMode(mode)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="workflow-canvas-hint">{copy.workflowViewHint}</p>

      <div className="workflow-canvas-layout">
        <div className="workflow-canvas-frame">
          {viewMode === "canvas" ? (
            <WorkflowCanvas
              key={document.workflow_id}
              ref={canvasRef}
              initialDocument={document}
              onDocumentChange={(next) => {
                setDocument(next);
                setDraft(stringifyWorkflowDocument(next));
                setRole((prev) =>
                  prev === "canonical" ? "draft" : prev === "proposed" ? "draft" : prev,
                );
                setError(null);
              }}
            />
          ) : null}

          {viewMode === "table" ? (
            <div className="workflow-canvas-tables" role="tabpanel">
              <section aria-labelledby="wf-nodes-title">
                <h2 id="wf-nodes-title" className="workflow-canvas-section-title">
                  {copy.workflowTableNodes}
                </h2>
                <div className="workflow-canvas-table-wrap">
                  <table className="workflow-canvas-table">
                    <thead>
                      <tr>
                        <th scope="col">id</th>
                        <th scope="col">type</th>
                        <th scope="col">label</th>
                        <th scope="col">sources</th>
                        <th scope="col">targets</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.nodes.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <code>{row.id}</code>
                          </td>
                          <td>{row.type}</td>
                          <td>{row.label}</td>
                          <td>
                            <code>{row.sources.join(", ") || "—"}</code>
                          </td>
                          <td>
                            <code>{row.targets.join(", ") || "—"}</code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section aria-labelledby="wf-edges-title">
                <h2 id="wf-edges-title" className="workflow-canvas-section-title">
                  {copy.workflowTableEdges}
                </h2>
                <div className="workflow-canvas-table-wrap">
                  <table className="workflow-canvas-table">
                    <thead>
                      <tr>
                        <th scope="col">id</th>
                        <th scope="col">source</th>
                        <th scope="col">target</th>
                        <th scope="col">kind</th>
                        <th scope="col">label</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.edges.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <code>{row.id}</code>
                          </td>
                          <td>
                            <code>{row.source}</code>
                          </td>
                          <td>
                            <code>{row.target}</code>
                          </td>
                          <td>{row.kind ?? "—"}</td>
                          <td>{row.label ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : null}

          {viewMode === "mermaid" ? (
            <div className="workflow-canvas-mermaid" role="tabpanel">
              <div className="workflow-canvas-toolbar">
                <button type="button" className="btn btn-sm" onClick={() => void copyMermaid()}>
                  {mermaidCopied ? copy.workflowMermaidCopied : copy.workflowMermaidCopy}
                </button>
              </div>
              <pre className="workflow-canvas-mermaid-source" aria-label={copy.workflowViewMermaid}>
                {mermaidSource}
              </pre>
            </div>
          ) : null}
        </div>

        <aside className="workflow-canvas-side">
          <p className="workflow-canvas-hint">{copy.workflowJsonHint}</p>
          <div className="workflow-canvas-toolbar">
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={() => void loadCanonical()}
            >
              {copy.workflowLoadCanonical}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => loadSample(SYSTEM_MAP_SAMPLE)}
            >
              {copy.workflowLoadSystem}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => loadSample(BUSINESS_WORKFLOW_SAMPLE)}
            >
              {copy.workflowLoadBusiness}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={viewMode !== "canvas"}
              onClick={syncFromCanvas}
            >
              {copy.workflowExport}
            </button>
            <button type="button" className="btn btn-sm" onClick={applyDraft}>
              {copy.workflowApplyJson}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => void runEvaluate()}
            >
              {copy.workflowEvaluate}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!proposed || busy}
              onClick={loadProposedOntoCanvas}
            >
              {copy.workflowLoadProposal}
            </button>
          </div>
          {error ? (
            <p className="workflow-canvas-error" role="alert">
              {error}
            </p>
          ) : null}
          {note ? <p className="workflow-canvas-hint">{note}</p> : null}
          <textarea
            className="workflow-canvas-json"
            spellCheck={false}
            aria-label={copy.workflowJsonLabel}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setRole("draft");
            }}
          />
          <p className="workflow-canvas-hint">
            {copy.workflowNodeCount(document.nodes.length, document.edges.length)}
          </p>

          {findings.length > 0 ? (
            <section className="workflow-canvas-findings" aria-labelledby="wf-findings-title">
              <h2 id="wf-findings-title" className="workflow-canvas-section-title">
                {copy.workflowFindingsTitle}
              </h2>
              <ul>
                {findings.map((f, i) => (
                  <li key={`${f.code}-${i}`} className={`wf-finding wf-finding--${f.severity}`}>
                    <strong>{f.severity}</strong> {f.code}: {f.message}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="workflow-canvas-propose" aria-labelledby="wf-propose-title">
            <h2 id="wf-propose-title" className="workflow-canvas-section-title">
              {copy.workflowPropose}
            </h2>
            <p className="workflow-canvas-hint">{copy.workflowProposeHint}</p>
            <label className="workflow-canvas-field">
              <span>{copy.workflowApprovalId}</span>
              <input
                value={approvalId}
                onChange={(e) => setApprovalId(e.target.value)}
                placeholder="APR-YYYYMMDD-NNN"
              />
            </label>
            <div className="workflow-canvas-toolbar">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy || !proposed || !approvalId.trim()}
                onClick={() => void runPropose()}
              >
                {copy.workflowPropose}
              </button>
              <a className="btn btn-ghost btn-sm" href="/approvals/">
                {copy.workflowApprovalQueue}
              </a>
            </div>
          </section>

          <section className="workflow-canvas-proposals" aria-labelledby="wf-proposals-title">
            <h2 id="wf-proposals-title" className="workflow-canvas-section-title">
              {copy.workflowProposalsTitle}
            </h2>
            {proposals.length === 0 ? (
              <p className="workflow-canvas-hint">{copy.workflowEmptyProposals}</p>
            ) : (
              <ul className="workflow-canvas-proposal-list">
                {proposals.map((p) => (
                  <li key={p.change_id} className="workflow-canvas-proposal">
                    <div>
                      <strong>{p.change_id}</strong> · {p.workflow_id} · {p.grade} ·{" "}
                      {p.approval_id}
                    </div>
                    <div className="workflow-canvas-toolbar">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy}
                        onClick={() =>
                          void (async () => {
                            setBusy(true);
                            setError(null);
                            try {
                              const res = await postWorkflowChangeValidate(p.change_id);
                              setNote(
                                `validate ${p.change_id}: ${res.result.before_hash.slice(0, 18)}… → ${res.result.after_hash.slice(0, 18)}…`,
                              );
                            } catch (cause) {
                              setError(cause instanceof Error ? cause.message : String(cause));
                            } finally {
                              setBusy(false);
                            }
                          })()
                        }
                      >
                        {copy.workflowValidate}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() =>
                          void (async () => {
                            setBusy(true);
                            setError(null);
                            try {
                              const res = await postWorkflowChangeApply(p.change_id);
                              setNote(`applied ${p.change_id} → ${res.result.logical_path}`);
                              await loadCanonical();
                              await reloadProposals();
                            } catch (cause) {
                              setError(cause instanceof Error ? cause.message : String(cause));
                            } finally {
                              setBusy(false);
                            }
                          })()
                        }
                      >
                        {copy.workflowApply}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <pre hidden>{jsonText}</pre>
        </aside>
      </div>
    </OpsPage>
  );
}
