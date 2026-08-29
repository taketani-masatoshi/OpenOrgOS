/**
 * National eID signing desk (`/?esign=1`).
 * Path: apps/steward-chat/src/EsignPage.tsx
 * ADR: docs/adr/0014-pdf-esign-national-eid.md
 *
 * The card, the reader and the PIN stay on the signer's own device. The console
 * only moves containers and shows the SiVa indication.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { OpsPage } from "./OpsPage";
import { STEWARD_COPY } from "./steward-copy";
import {
  fetchEsignCases,
  fetchEsignReady,
  postEsignAttach,
  postEsignCreate,
  postEsignPrepare,
  postEsignVerify,
  type EsignCaseRow,
  type EsignReadyReport,
} from "./api";

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function EsignPage() {
  const copy = useCopy(STEWARD_COPY);
  const [ready, setReady] = useState<EsignReadyReport | null>(null);
  const [cases, setCases] = useState<EsignCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const asiceInput = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [readyRes, caseRes] = await Promise.all([fetchEsignReady(), fetchEsignCases()]);
      setReady(readyRes.report);
      setCases(caseRes.cases);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
    async (fn: () => Promise<string>) => {
      setBusy(true);
      setError(null);
      setNote(null);
      try {
        setNote(await fn());
        const caseRes = await fetchEsignCases();
        setCases(caseRes.cases);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const create = () =>
    run(async () => {
      const file = pdfInput.current?.files?.[0];
      if (!file) throw new Error(copy.esignPickPdf);
      if (!title.trim()) throw new Error(copy.esignTitleRequired);
      const created = await postEsignCreate({
        title: title.trim(),
        filename: file.name,
        pdf_base64: await fileToBase64(file),
      });
      setSelected(created.case.id);
      setTitle("");
      if (pdfInput.current) pdfInput.current.value = "";
      return `${created.case.id} ${copy.esignCreated}`;
    });

  const prepare = (caseId: string) =>
    run(async () => {
      const res = await postEsignPrepare(caseId);
      return `${res.case.id} ${copy.esignPrepared}`;
    });

  const attach = (caseId: string) =>
    run(async () => {
      const file = asiceInput.current?.files?.[0];
      if (!file) throw new Error(copy.esignPickAsice);
      const res = await postEsignAttach({
        case_id: caseId,
        filename: file.name,
        asice_base64: await fileToBase64(file),
      });
      if (asiceInput.current) asiceInput.current.value = "";
      return res.pdf_digest_matches === false
        ? `${res.case.id} — ${copy.esignDigestMismatch}`
        : `${res.case.id} ${copy.esignAttached}`;
    });

  const verify = (caseId: string) =>
    run(async () => {
      const res = await postEsignVerify(caseId);
      return res.nationally_verified
        ? `${res.case.id} — ${copy.esignVerified}`
        : `${res.case.id} — ${res.case.siva_indication ?? copy.esignNotVerified}`;
    });

  const sivaOk = ready?.siva_configured && ready.siva_mode === "live";

  return (
    <OpsPage
      title={copy.esignTitle}
      lead={copy.esignLead}
      loading={loading}
      error={error}
    >
      {note ? <p className="ops-note">{note}</p> : null}

      <section className="ops-card">
        <h2>{copy.esignServices}</h2>
        <ul className="ops-list">
          <li>
            SiVa: {ready?.siva_base_url ?? copy.esignUnset} ·{" "}
            {sivaOk ? copy.esignLiveOk : copy.esignLiveMissing}
          </li>
          <li>
            {copy.esignSidecar}:{" "}
            {ready?.sidecar.ok ? copy.esignSidecarUp : (ready?.sidecar.reason ?? copy.esignUnset)}
          </li>
          <li>{ready?.national_complete_requires}</li>
        </ul>
      </section>

      <section className="ops-card">
        <h2>{copy.esignNewCase}</h2>
        <label>
          {copy.esignCaseTitle}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={copy.esignCaseTitlePlaceholder}
          />
        </label>
        <label>
          {copy.esignPdf}
          <input ref={pdfInput} type="file" accept="application/pdf" />
        </label>
        <button type="button" onClick={create} disabled={busy}>
          {copy.esignCreate}
        </button>
      </section>

      <section className="ops-card">
        <h2>{copy.esignCases}</h2>
        <p className="ops-note">{copy.esignSignOnDevice}</p>
        <label>
          {copy.esignSignedContainer}
          <input ref={asiceInput} type="file" accept=".asice,.sce,application/vnd.etsi.asic-e+zip" />
        </label>
        {cases.length === 0 ? (
          <p className="ops-note">{copy.esignNoCases}</p>
        ) : (
          <table className="ops-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{copy.esignCaseTitle}</th>
                <th>{copy.esignStatus}</th>
                <th>SiVa</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cases.map((row) => (
                <tr key={row.id} className={selected === row.id ? "is-selected" : undefined}>
                  <td>{row.id}</td>
                  <td>{row.title}</td>
                  <td>{row.status}</td>
                  <td>
                    {row.siva_indication
                      ? `${row.siva_indication} (${row.siva_mode ?? "-"})`
                      : "—"}
                  </td>
                  <td className="ops-row-actions">
                    <button type="button" onClick={() => prepare(row.id)} disabled={busy}>
                      {copy.esignPrepare}
                    </button>
                    <button type="button" onClick={() => attach(row.id)} disabled={busy}>
                      {copy.esignAttach}
                    </button>
                    <button type="button" onClick={() => verify(row.id)} disabled={busy}>
                      {copy.esignVerify}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </OpsPage>
  );
}
