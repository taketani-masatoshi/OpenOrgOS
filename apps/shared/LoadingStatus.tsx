type Props = {
  label?: string;
};

/**
 * Compact in-page wait — not a full-viewport "読み込み中…" wall.
 */
export function LoadingStatus({ label = "読み込み中…" }: Props) {
  return (
    <p className="loading-status" role="status">
      <span className="loading-status-spinner" aria-hidden="true" />
      {label}
    </p>
  );
}
