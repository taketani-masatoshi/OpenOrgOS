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

/** Google Calendar template URL (JST local → UTC Z for all-day-ish events). */
export function buildGoogleCalendarTemplateUrl(opts: {
  title: string;
  start: string;
  end: string;
  details?: string;
  location?: string;
}): string {
  const toUtcCompact = (iso: string): string => {
    const d = iso.length <= 10 ? new Date(`${iso}T00:00:00+09:00`) : new Date(iso.includes("+") || iso.endsWith("Z") ? iso : `${iso}:00+09:00`);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  };
  const params = new URLSearchParams();
  params.set("action", "TEMPLATE");
  params.set("text", opts.title);
  params.set("dates", `${toUtcCompact(opts.start)}/${toUtcCompact(opts.end)}`);
  if (opts.details) params.set("details", opts.details);
  if (opts.location) params.set("location", opts.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
