/**
 * Dynamic import helper for optional @cursor/sdk dependency.
 * Uses `new Function` so bundlers / static analysis do not require the package.
 */

export type CursorSdkAgent = {
  prompt: (p: string, o: Record<string, unknown>) => Promise<{ status?: string; result?: unknown }>;
};

export type CursorSdkModule = {
  Agent: CursorSdkAgent;
};

export async function loadCursorSdk(): Promise<CursorSdkModule> {
  return (await new Function('return import("@cursor/sdk")')()) as CursorSdkModule;
}
