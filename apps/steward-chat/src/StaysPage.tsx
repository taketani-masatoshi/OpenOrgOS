import { useEffect, useState } from "react";
import { fetchHospitalityOpsDue } from "./api";
import { OpsPage } from "./OpsPage";

type Snapshot = Awaited<ReturnType<typeof fetchHospitalityOpsDue>>;

/**
 * Hospitality ops-due — stay_id / 期限のみ。宿泊者の氏名は出さない。
 */
export function StaysPage() {
  const [payload, setPayload] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchHospitalityOpsDue()
      .then(setPayload)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <OpsPage
      title="宿泊"
      lead="期限と滞在件数のみ。宿泊者の氏名・連絡先は出しません。"
      error={error}
      loading={!payload && !error}
    >
      {payload ? (
        <>
          <section className="ops-card">
            <h2 className="section-title">モジュール</h2>
            <p className="ops-page-meta">
              {payload.module_enabled ? "有効" : "未有効"} · 滞在 {payload.stay_count} 件
            </p>
          </section>
          <section className="ops-card">
            <h2 className="section-title">期限</h2>
            {payload.due.length === 0 ? (
              <p className="muted">期限アイテムはありません</p>
            ) : (
              <ul>
                {payload.due.map((row) => (
                  <li key={row.id}>
                    [{row.severity}] {row.title} · {row.due_on}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="section-cta">
            <a className="btn btn-ghost btn-sm" href="/?tax=1">
              税務モジュール
            </a>
          </p>
        </>
      ) : null}
    </OpsPage>
  );
}
