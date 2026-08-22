/** Build iPhone enroll URL with operator / approver / API origin in the fragment. */

function utf8ToB64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function settlementEnrollHref(approveOrigin: string): string {
  return `${approveOrigin.replace(/\/$/, "")}/enroll`;
}

export function buildSettlementEnrollUrl(opts: {
  approveOrigin: string;
  operatorId: string;
  approverId: string;
  apiOrigin: string;
}): string {
  const fragment = utf8ToB64url(
    JSON.stringify({
      operator_id: opts.operatorId,
      approver_id: opts.approverId,
      api_origin: opts.apiOrigin.replace(/\/$/, ""),
    })
  );
  return `${settlementEnrollHref(opts.approveOrigin)}#${fragment}`;
}

/** Open on Mac so Chrome / Safari can show the standard hybrid PassKey QR. */
export function withHybridPasskeyQuery(url: string): string {
  const hashIndex = url.indexOf("#");
  const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const joiner = withoutHash.includes("?") ? "&" : "?";
  if (/(?:[?&])hybrid=1(?:&|$)/.test(withoutHash)) return url;
  return `${withoutHash}${joiner}hybrid=1${hash}`;
}
