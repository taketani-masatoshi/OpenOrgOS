import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import {
  BUSINESS_WORKFLOW_SAMPLE,
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

const DEFAULT_WORKFLOW_ID = "WF-system-map";

export function WorkflowCanvasPage() {
  const copy = useCopy(STEWARD_COPY);
  const canvasRef = useRef<WorkflowCanvasHandle>(null);
  const [document, setDocument] = useState<WorkflowDocument>(SYSTEM_MAP_SAMPLE);
  const [draft, setDraft] = useState(() => stringifyWorkflowDocument(SYSTEM_MAP_SAMPLE));
  const [role, setRole] = useState<CanvasRole>("draft");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [findings, setFindings] = useState<WorkflowFindingRow[]>([]);
  const [proposed, setProposed] = useState<WorkflowDocument | null>(null);
  const [approvalId, setApprovalId] = useState("");
  const [proposals, setProposals] = useState<WorkflowStructureProposalRow[]>([]);

  const jsonText = useMemo(() => stringifyWorkflowDocument(document), [document]);

  const roleLabel =
    role === "canonical"
      ? copy.workflowRoleCanonical
      : role === "proposed"
        ? copy.workflowRoleProposed
        : role === "recorded"
          ? copy.workflowRoleRecorded
          : copy.workflowRoleDraft;

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
      canvasRef.current?.importFromJSON(next);
      setDocument(next);
      setDraft(stringifyWorkflowDocument(next));
      setRole("canonical");
      setFindings([]);
      setProposed(null);
      setNote(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      canvasRef.current?.importFromJSON(SYSTEM_MAP_SAMPLE);
      setDocument(SYSTEM_MAP_SAMPLE);
      setDraft(stringifyWorkflowDocument(SYSTEM_MAP_SAMPLE));
      setRole("draft");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadCanonical();
    void reloadProposals();
  }, [loadCanonical, reloadProposals]);

  function syncFromCanvas() {
    const next = canvasRef.current?.exportToJSON();
    if (!next) return;
    setDocument(next);
    setDraft(stringifyWorkflowDocument(next));
    setRole("draft");
    setError(null);
  }

  function loadSample(sample: WorkflowDocument) {
    canvasRef.current?.importFromJSON(sample);
    setDocument(sample);
    setDraft(stringifyWorkflowDocument(sample));
    setRole("draft");
    setFindings([]);
    setProposed(null);
    setError(null);
  }

  function applyDraft() {
    try {
      const parsed: unknown = JSON.parse(draft);
      const next = canvasRef.current?.importFromJSON(parsed);
      if (!next) return;
      setDocument(next);
      setDraft(stringifyWorkflowDocument(next));
      setRole("draft");
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
      const current = canvasRef.current?.exportToJSON() ?? document;
      const res = await postWorkflowEvaluate({ document: current });
      setDocument(res.document as WorkflowDocument);
      setDraft(stringifyWorkflowDocument(res.document as WorkflowDocument));
      setFindings(res.findings);
      setProposed(res.proposed_document as WorkflowDocument);
      setRole("draft");
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
    canvasRef.current?.importFromJSON(proposed);
    setDocument(proposed);
    setDraft(stringifyWorkflowDocument(proposed));
    setRole("proposed");
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
      const current = canvasRef.current?.exportToJSON() ?? document;
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

  return (
    <OpsPage
      className="workflow-canvas-page"
      title={copy.workflowTitle}
      lead={copy.workflowLead}
    >
      <p className={`workflow-canvas-role workflow-canvas-role--${role}`} role="status">
        {roleLabel}
      </p>
      <div className="workflow-canvas-layout">
        <div className="workflow-canvas-frame">
          <WorkflowCanvas
            ref={canvasRef}
            initialDocument={SYSTEM_MAP_SAMPLE}
            onDocumentChange={(next) => {
              setDocument(next);
              setDraft(stringifyWorkflowDocument(next));
              setRole((prev) => (prev === "canonical" ? "draft" : prev === "proposed" ? "draft" : prev));
              setError(null);
            }}
          />
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
            <button type="button" className="btn btn-sm" onClick={syncFromCanvas}>
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
