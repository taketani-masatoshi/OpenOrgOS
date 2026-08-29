let wireChunk: Promise<{ MailWorkbench: typeof import("@wire-console/MailWorkbench").MailWorkbench }> | null =
  null;

/** Warm the Wire lazy chunk (pointerenter / idle). */
export function prefetchWireWorkbench(): void {
  if (!wireChunk) {
    wireChunk = import("@wire-console/MailWorkbench");
  }
}

export function loadMailWorkbench(): Promise<{
  default: typeof import("@wire-console/MailWorkbench").MailWorkbench;
}> {
  prefetchWireWorkbench();
  return wireChunk!.then((m) => ({ default: m.MailWorkbench }));
}
