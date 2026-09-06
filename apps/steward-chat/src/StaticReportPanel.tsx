import type { ExecutiveStaticReportSlot } from "./api";
import { MarkdownBody } from "./MarkdownBody";

/**
 * Shared CLI→MD primary surface (Executive Home / tax / contracts / sales).
 */
export function StaticReportPanel({
  slot,
  emptyLabel,
}: {
  slot: ExecutiveStaticReportSlot;
  emptyLabel: string;
}) {
  if (!slot.markdown) {
    return (
      <div className="executive-report-empty">
        <p className="page-desc muted">{emptyLabel}</p>
        <p className="page-desc">
          <code className="executive-report-hint">{slot.generate_hint}</code>
        </p>
      </div>
    );
  }

  return (
    <div className="executive-report-body">
      <div className="executive-report-meta muted">
        <span>{slot.title}</span>
        {slot.as_of ? <span> · {slot.as_of}</span> : null}
        {slot.path ? <span> · {slot.path}</span> : null}
      </div>
      <MarkdownBody className="executive-report-md">{slot.markdown}</MarkdownBody>
      <p className="page-desc muted executive-report-regen">
        <code className="executive-report-hint">{slot.generate_hint}</code>
      </p>
    </div>
  );
}
