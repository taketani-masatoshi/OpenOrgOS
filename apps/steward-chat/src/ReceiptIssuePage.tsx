import { useEffect, useMemo, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { OPS_PAGES_COPY } from "./ops-pages-copy";
import {
  fetchReceiptIssuerApi,
  issueReceiptApi,
  previewReceiptApi,
  receiptPdfUrl,
  type ReceiptIssueBody,
  type ReceiptIssueResponse,
  type ReceiptIssuerIdentity,
} from "./api";

type LineDraft = {
  description: string;
  quantity: string;
  tax_rate: "8" | "10";
  reduced_tax: boolean;
  amount_excluding_tax: string;
};

function yen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

function roundTax(excluding: number, rate: number): number {
  return Math.floor((excluding * rate) / 100);
}

function buildLines(
  drafts: LineDraft[],
  defaultItem: string,
): ReceiptIssueBody["lines"] {
  // Build draft lines with provisional per-line tax, then re-allocate so the
  // sum of line taxes equals floor(sum_excluding * rate/100) once per rate
  // (matches src/lib/receipt-qr.ts calculateTaxTotals).
  const provisional = drafts.map((row) => {
    const excluding = Math.max(
      0,
      Math.trunc(Number(row.amount_excluding_tax) || 0),
    );
    const rate = Number(row.tax_rate) as 8 | 10;
    const qty = row.quantity.trim() ? Number(row.quantity) : undefined;
    return {
      description: row.description.trim() || defaultItem,
      quantity: qty && qty > 0 ? qty : undefined,
      tax_rate: rate,
      reduced_tax: row.reduced_tax && rate === 8,
      amount_excluding_tax: excluding,
      tax_amount: 0,
      amount_including_tax: excluding,
    };
  });

  const byRate = new Map<number, number[]>();
  provisional.forEach((line, index) => {
    const list = byRate.get(line.tax_rate) ?? [];
    list.push(index);
    byRate.set(line.tax_rate, list);
  });

  for (const [rate, indexes] of byRate) {
    const excludingSum = indexes.reduce(
      (sum, i) => sum + provisional[i]!.amount_excluding_tax,
      0,
    );
    let remainingTax = Math.floor((excludingSum * rate) / 100);
    indexes.forEach((index, pos) => {
      const line = provisional[index]!;
      const isLast = pos === indexes.length - 1;
      const share = isLast
        ? remainingTax
        : Math.floor((line.amount_excluding_tax * rate) / 100);
      const tax = Math.max(0, Math.min(remainingTax, share));
      remainingTax -= tax;
      line.tax_amount = tax;
      line.amount_including_tax = line.amount_excluding_tax + tax;
    });
  }

  return provisional;
}

const emptyLine = (): LineDraft => ({
  description: "",
  quantity: "1",
  tax_rate: "10",
  reduced_tax: false,
  amount_excluding_tax: "",
});

export function ReceiptIssuePage() {
  const copy = useCopy(OPS_PAGES_COPY);
  const [documentType, setDocumentType] = useState<
    "qualified_invoice" | "qualified_simplified_invoice"
  >("qualified_invoice");
  const [transactionDate, setTransactionDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [issuer, setIssuer] = useState<ReceiptIssuerIdentity | null>(null);
  const [issuerLoading, setIssuerLoading] = useState(true);
  const [recipientName, setRecipientName] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<ReceiptIssueResponse | null>(null);
  const [issued, setIssued] = useState<ReceiptIssueResponse | null>(null);

  const computed = useMemo(
    () => buildLines(lines, copy.defaultItem),
    [copy.defaultItem, lines],
  );
  const total = computed.reduce((sum, line) => sum + line.amount_including_tax, 0);

  useEffect(() => {
    let cancelled = false;
    setIssuerLoading(true);
    fetchReceiptIssuerApi()
      .then((row) => {
        if (!cancelled) {
          setIssuer(row);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setIssuer(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setIssuerLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function buildBody(): ReceiptIssueBody {
    return {
      document_type: documentType,
      transaction_date: transactionDate,
      recipient_name:
        documentType === "qualified_invoice"
          ? recipientName.trim() || undefined
          : undefined,
      lines: computed,
    };
  }

  function validateDraft(): string | null {
    if (!issuer?.invoice_registration_number) {
      return copy.errIssuer;
    }
    if (documentType === "qualified_invoice" && !recipientName.trim()) {
      return copy.errRecipient;
    }
    if (
      !lines.some(
        (line) =>
          line.description.trim() &&
          Math.trunc(Number(line.amount_excluding_tax) || 0) > 0,
      )
    ) {
      return copy.errLines;
    }
    return null;
  }

  async function runPreview() {
    const invalid = validateDraft();
    if (invalid) {
      setError(invalid);
      setMessage("");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await previewReceiptApi(buildBody());
      setPreview(result);
      setMessage(copy.previewUpdated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runIssue() {
    const invalid = validateDraft();
    if (invalid) {
      setError(invalid);
      setMessage("");
      return;
    }
    if (
      !window.confirm(
        copy.confirmIssue(yen(total)),
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await issueReceiptApi(buildBody());
      setIssued(result);
      setPreview(result);
      setMessage(copy.issued(result.receipt_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    const link = issued?.qr_link ?? preview?.qr_link;
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setMessage(copy.linkCopied);
  }

  const display = issued ?? preview;
  const issueDisabled =
    busy || issuerLoading || !issuer?.invoice_registration_number;

  return (
    <div className="receipt-claim receipt-issue">
      <header className="receipt-claim-header">
        <div>
          <h1 className="receipt-claim-title ops-page-title">{copy.receiptIssueTitle}</h1>
          <p className="receipt-claim-lead ops-page-lead">
            {copy.receiptIssueLead}
          </p>
        </div>
      </header>

      <section className="receipt-issue-issuer" aria-label={copy.issuerAuto}>
        {issuerLoading && <p className="muted">{copy.issuerLoading}</p>}
        {!issuerLoading && issuer && (
          <dl className="receipt-issue-issuer-dl">
            <div>
              <dt>{copy.issuer}</dt>
              <dd>{issuer.issuer_name}</dd>
            </div>
            <div>
              <dt>{copy.registrationNo}</dt>
              <dd>{issuer.invoice_registration_number}</dd>
            </div>
            <div>
              <dt>{copy.corporateNo}</dt>
              <dd>{issuer.corporate_number}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className="receipt-issue-form" aria-label={copy.issueInput}>
        <label>
          {copy.documentType}
          <select
            value={documentType}
            disabled={busy}
            onChange={(e) =>
              setDocumentType(
                e.target.value as
                  | "qualified_invoice"
                  | "qualified_simplified_invoice",
              )
            }
          >
            <option value="qualified_invoice">{copy.qualifiedInvoice}</option>
            <option value="qualified_simplified_invoice">{copy.qualifiedSimplified}</option>
          </select>
        </label>
        <label>
          {copy.transactionDate}
          <input
            type="date"
            value={transactionDate}
            disabled={busy}
            onChange={(e) => setTransactionDate(e.target.value)}
          />
        </label>
        {documentType === "qualified_invoice" && (
          <label>
            {copy.recipient}
            <input
              type="text"
              value={recipientName}
              disabled={busy}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder={copy.recipientPlaceholder}
            />
          </label>
        )}
      </section>

      <section className="receipt-issue-lines" aria-label={copy.lines}>
        <header className="receipt-issue-lines-head">
          <h2>{copy.lines}</h2>
          <button
            type="button"
            className="quiet-button"
            disabled={busy}
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
          >
            {copy.addLine}
          </button>
        </header>
        <ul>
          {lines.map((line, index) => (
            <li key={index} className="receipt-issue-line">
              <input
                type="text"
                aria-label={copy.itemN(index + 1)}
                placeholder={copy.itemPlaceholder}
                value={line.description}
                disabled={busy}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((row, i) =>
                      i === index ? { ...row, description: e.target.value } : row,
                    ),
                  )
                }
              />
              <input
                type="number"
                aria-label={copy.qtyN(index + 1)}
                placeholder={copy.qtyPlaceholder}
                min={0}
                step="any"
                value={line.quantity}
                disabled={busy}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((row, i) =>
                      i === index ? { ...row, quantity: e.target.value } : row,
                    ),
                  )
                }
              />
              <select
                aria-label={copy.taxN(index + 1)}
                value={line.tax_rate}
                disabled={busy}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((row, i) =>
                      i === index
                        ? {
                            ...row,
                            tax_rate: e.target.value as "8" | "10",
                            reduced_tax:
                              e.target.value === "8" ? row.reduced_tax : false,
                          }
                        : row,
                    ),
                  )
                }
              >
                <option value="10">10%</option>
                <option value="8">8%</option>
              </select>
              <label className="receipt-issue-reduced">
                <input
                  type="checkbox"
                  checked={line.reduced_tax}
                  disabled={busy || line.tax_rate !== "8"}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((row, i) =>
                        i === index
                          ? { ...row, reduced_tax: e.target.checked }
                          : row,
                      ),
                    )
                  }
                />
                {copy.reduced}
              </label>
              <input
                type="number"
                aria-label={copy.exN(index + 1)}
                placeholder={copy.exPlaceholder}
                min={0}
                value={line.amount_excluding_tax}
                disabled={busy}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((row, i) =>
                      i === index
                        ? { ...row, amount_excluding_tax: e.target.value }
                        : row,
                    ),
                  )
                }
              />
              <span className="muted">
                {copy.includingTax}{" "}
                {yen(
                  (() => {
                    const ex = Math.trunc(Number(line.amount_excluding_tax) || 0);
                    return ex + roundTax(ex, Number(line.tax_rate));
                  })(),
                )}
              </span>
              <button
                type="button"
                className="quiet-button"
                disabled={busy || lines.length <= 1}
                onClick={() =>
                  setLines((prev) => prev.filter((_, i) => i !== index))
                }
              >
                {copy.delete}
              </button>
            </li>
          ))}
        </ul>
        <p className="receipt-issue-total">
          {copy.totalIncl} <strong>{yen(total)}</strong>
        </p>
      </section>

      <div className="receipt-issue-actions">
        <button
          type="button"
          className="quiet-button"
          disabled={busy}
          onClick={() => void runPreview()}
        >
          {copy.preview}
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={issueDisabled}
          onClick={() => void runIssue()}
        >
          {busy ? copy.issuing : copy.issue}
        </button>
      </div>

      {display && (
        <section className="receipt-issue-preview" aria-label={copy.previewResult}>
          <h2>{display.persisted ? copy.issueResult : copy.preview}</h2>
          {display.qr_svg && (
            <div
              className="receipt-issue-qr"
              dangerouslySetInnerHTML={{ __html: display.qr_svg }}
            />
          )}
          <div className="receipt-issue-actions">
            <button type="button" className="quiet-button" onClick={() => void copyLink()}>
              {copy.copyLink}
            </button>
            {display.persisted && (
              <a
                className="primary-button"
                href={receiptPdfUrl(display.receipt_id)}
                download={`${display.receipt_id}.pdf`}
              >
                {copy.downloadPdf}
              </a>
            )}
          </div>
        </section>
      )}

      {message && (
        <p className="receipt-claim-ok" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
