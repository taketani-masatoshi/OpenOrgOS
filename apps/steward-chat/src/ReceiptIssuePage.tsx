import { useEffect, useMemo, useState } from "react";
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

function buildLines(drafts: LineDraft[]): ReceiptIssueBody["lines"] {
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
      description: row.description.trim() || "品目",
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

  const computed = useMemo(() => buildLines(lines), [lines]);
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
      return "発行者情報を読み込めません（company.yaml の法人番号を確認してください）";
    }
    if (documentType === "qualified_invoice" && !recipientName.trim()) {
      return "適格請求書では宛名を入力してください";
    }
    if (
      !lines.some(
        (line) =>
          line.description.trim() &&
          Math.trunc(Number(line.amount_excluding_tax) || 0) > 0,
      )
    ) {
      return "品目と税抜金額を1行以上入力してください";
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
      setMessage("プレビューを更新しました（未永続）");
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
        `この内容で領収書を発行しますか？\n合計 ${yen(total)}\n発行後はレジストリに保存されます。`,
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
      setMessage(`${result.receipt_id} を発行しました`);
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
    setMessage("検証リンクをコピーしました");
  }

  const display = issued ?? preview;
  const issueDisabled =
    busy || issuerLoading || !issuer?.invoice_registration_number;

  return (
    <div className="receipt-claim receipt-issue">
      <header className="receipt-claim-header">
        <div>
          <h1 className="receipt-claim-title ops-page-title">領収書発行</h1>
          <p className="receipt-claim-lead ops-page-lead">
            適格請求書（または簡易）を署名付き QR 付きで発行します。発行者はテナントの法人番号から自動決定します。
          </p>
        </div>
      </header>

      <section className="receipt-issue-issuer" aria-label="発行者（自動）">
        {issuerLoading && <p className="muted">発行者情報を読み込み中…</p>}
        {!issuerLoading && issuer && (
          <dl className="receipt-issue-issuer-dl">
            <div>
              <dt>発行者</dt>
              <dd>{issuer.issuer_name}</dd>
            </div>
            <div>
              <dt>登録番号</dt>
              <dd>{issuer.invoice_registration_number}</dd>
            </div>
            <div>
              <dt>法人番号</dt>
              <dd>{issuer.corporate_number}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className="receipt-issue-form" aria-label="発行入力">
        <label>
          文書種別
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
            <option value="qualified_invoice">適格請求書</option>
            <option value="qualified_simplified_invoice">適格簡易請求書</option>
          </select>
        </label>
        <label>
          取引日
          <input
            type="date"
            value={transactionDate}
            disabled={busy}
            onChange={(e) => setTransactionDate(e.target.value)}
          />
        </label>
        {documentType === "qualified_invoice" && (
          <label>
            宛名
            <input
              type="text"
              value={recipientName}
              disabled={busy}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="取引先名"
            />
          </label>
        )}
      </section>

      <section className="receipt-issue-lines" aria-label="明細">
        <header className="receipt-issue-lines-head">
          <h2>明細</h2>
          <button
            type="button"
            className="quiet-button"
            disabled={busy}
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
          >
            行を追加
          </button>
        </header>
        <ul>
          {lines.map((line, index) => (
            <li key={index} className="receipt-issue-line">
              <input
                type="text"
                aria-label={`品目${index + 1}`}
                placeholder="品目"
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
                aria-label={`数量${index + 1}`}
                placeholder="数量"
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
                aria-label={`税率${index + 1}`}
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
                軽減
              </label>
              <input
                type="number"
                aria-label={`税抜金額${index + 1}`}
                placeholder="税抜"
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
                税込{" "}
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
                削除
              </button>
            </li>
          ))}
        </ul>
        <p className="receipt-issue-total">
          合計（税込） <strong>{yen(total)}</strong>
        </p>
      </section>

      <div className="receipt-issue-actions">
        <button
          type="button"
          className="quiet-button"
          disabled={busy}
          onClick={() => void runPreview()}
        >
          プレビュー
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={issueDisabled}
          onClick={() => void runIssue()}
        >
          {busy ? "処理中…" : "発行する"}
        </button>
      </div>

      {display && (
        <section className="receipt-issue-preview" aria-label="プレビュー結果">
          <h2>{display.persisted ? "発行結果" : "プレビュー"}</h2>
          {display.qr_svg && (
            <div
              className="receipt-issue-qr"
              dangerouslySetInnerHTML={{ __html: display.qr_svg }}
            />
          )}
          <div className="receipt-issue-actions">
            <button type="button" className="quiet-button" onClick={() => void copyLink()}>
              リンクをコピー
            </button>
            {display.persisted && (
              <a
                className="primary-button"
                href={receiptPdfUrl(display.receipt_id)}
                download={`${display.receipt_id}.pdf`}
              >
                PDF をダウンロード
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
