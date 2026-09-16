import { useMemo, useRef, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import {
  BUSINESS_WORKFLOW_SAMPLE,
  stringifyWorkflowDocument,
  SYSTEM_MAP_SAMPLE,
  type WorkflowDocument,
} from "@orgos/workflow-canvas";
import { OpsPage } from "./OpsPage";
import { STEWARD_COPY } from "./steward-copy";
import {
  WorkflowCanvas,
  type WorkflowCanvasHandle,
} from "./workflow-canvas/WorkflowCanvas";

export function WorkflowCanvasPage() {
  const copy = useCopy(STEWARD_COPY);
  const canvasRef = useRef<WorkflowCanvasHandle>(null);
  const [document, setDocument] = useState<WorkflowDocument>(SYSTEM_MAP_SAMPLE);
  const [draft, setDraft] = useState(() => stringifyWorkflowDocument(SYSTEM_MAP_SAMPLE));
  const [error, setError] = useState<string | null>(null);

  const jsonText = useMemo(() => stringifyWorkflowDocument(document), [document]);

  function syncFromCanvas() {
    const next = canvasRef.current?.exportToJSON();
    if (!next) return;
    setDocument(next);
    setDraft(stringifyWorkflowDocument(next));
    setError(null);
  }

  function loadSample(sample: WorkflowDocument) {
    canvasRef.current?.importFromJSON(sample);
    setDocument(sample);
    setDraft(stringifyWorkflowDocument(sample));
    setError(null);
  }

  function applyDraft() {
    try {
      const parsed: unknown = JSON.parse(draft);
      const next = canvasRef.current?.importFromJSON(parsed);
      if (!next) return;
      setDocument(next);
      setDraft(stringifyWorkflowDocument(next));
      setError(null);
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
      <div className="workflow-canvas-layout">
        <div className="workflow-canvas-frame">
          <WorkflowCanvas
            ref={canvasRef}
            initialDocument={SYSTEM_MAP_SAMPLE}
            onDocumentChange={(next) => {
              setDocument(next);
              setDraft(stringifyWorkflowDocument(next));
              setError(null);
            }}
          />
        </div>
        <aside className="workflow-canvas-side">
          <p className="workflow-canvas-hint">{copy.workflowJsonHint}</p>
          <div className="workflow-canvas-toolbar">
            <button type="button" className="btn btn-sm" onClick={() => loadSample(SYSTEM_MAP_SAMPLE)}>
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
            <button type="button" className="btn btn-primary btn-sm" onClick={applyDraft}>
              {copy.workflowApplyJson}
            </button>
          </div>
          {error ? (
            <p className="workflow-canvas-error" role="alert">
              {error}
            </p>
          ) : null}
          <textarea
            className="workflow-canvas-json"
            spellCheck={false}
            aria-label={copy.workflowJsonLabel}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <p className="workflow-canvas-hint">
            {copy.workflowNodeCount(document.nodes.length, document.edges.length)}
          </p>
          <pre hidden>{jsonText}</pre>
        </aside>
      </div>
    </OpsPage>
  );
}
