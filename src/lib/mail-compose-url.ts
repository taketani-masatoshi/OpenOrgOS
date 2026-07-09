/** Gmail compose URL (Phase 0 · no API send). */
export function buildGmailComposeUrl(opts: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
}): string {
  const params = new URLSearchParams();
  params.set("view", "cm");
  params.set("fs", "1");
  params.set("to", opts.to);
  params.set("su", opts.subject);
  params.set("body", opts.body);
  if (opts.cc) params.set("cc", opts.cc);
  return `https://mail.google.com/mail/?${params.toString()}`;
}
