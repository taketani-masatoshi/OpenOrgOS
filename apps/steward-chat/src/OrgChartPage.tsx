import { useEffect, useState } from "react";
import { fetchOrgChart, type OrgChartPayload } from "./api";

function OrgChartDiagram({
  diagram,
}: {
  diagram: NonNullable<Extract<OrgChartPayload, { missing: false }>["diagram"]>;
}) {
  return (
    <div className="org-chart-diagram-wrap">
      <svg
        className="org-chart-diagram"
        viewBox={`0 0 ${diagram.width} ${diagram.height}`}
        role="img"
        aria-label="組織図ダイアグラム"
      >
        {diagram.edges.map((e, i) => {
          const pts =
            e.points && e.points.length >= 2
              ? e.points
              : [
                  { x: e.source_x, y: e.source_y },
                  { x: e.target_x, y: e.target_y },
                ];
          const d = pts
            .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`)
            .join(" ");
          return (
            <path
              key={`e-${e.from}-${e.to}-${i}`}
              className={
                e.style === "dashed" ? "org-chart-edge is-dashed" : "org-chart-edge"
              }
              d={d}
              fill="none"
            />
          );
        })}
        {diagram.nodes.map((n) => (
          <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
            <rect
              className={`org-chart-node-box tone-${n.tone ?? "neutral"} kind-${n.kind ?? "leaf"}`}
              width={n.width}
              height={n.height}
              rx={6}
              ry={6}
            />
            <text
              className="org-chart-node-label"
              x={n.width / 2}
              y={n.height / 2 - (n.sublabel ? 6 : 0)}
            >
              {n.label}
            </text>
            {n.sublabel ? (
              <text className="org-chart-node-sublabel" x={n.width / 2} y={n.height / 2 + 10}>
                {n.sublabel}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}

/**
 * Company org chart (L1) — deterministic from data/org/org-chart.yaml.
 */
export function OrgChartPage() {
  const [payload, setPayload] = useState<OrgChartPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const next = await fetchOrgChart();
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
  }, []);

  return (
    <div className="org-chart-page">
      {loading && <p className="org-chart-muted">読み込み中…</p>}
      {error && (
        <p className="org-chart-error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && payload?.missing && (
        <div className="org-chart-empty">
          <p>{payload.message}</p>
          <p className="org-chart-muted">
            Path: <code>{payload.path}</code>
          </p>
        </div>
      )}
      {!loading && !error && payload && !payload.missing && (
        <>
          <OrgChartDiagram diagram={payload.diagram} />
          <section className="org-chart-tree" aria-label="報告ライン">
            <ul className="org-chart-tree-list">
              {payload.tree_lines.map((line, i) => (
                <li key={`${i}-${line}`}>{line || "\u00a0"}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
