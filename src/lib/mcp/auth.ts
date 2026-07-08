export function isMcpAuthDisabled(): boolean {
  return process.env.ORGOS_MCP_AUTH === "0";
}

export function requiredMcpToken(): string | undefined {
  return process.env.ORGOS_MCP_TOKEN?.trim() || undefined;
}

/** Validate MCP server may start — throws when production requires token. */
export function assertMcpAuthConfigured(): void {
  if (isMcpAuthDisabled()) {
    if (process.env.ORGOS_ENV === "production" || process.env.ORGOS_PROD === "1") {
      throw new Error("ORGOS_MCP_AUTH=0 is not allowed when ORGOS_ENV=production");
    }
    return;
  }
  if (!requiredMcpToken()) {
    throw new Error(
      "ORGOS_MCP_TOKEN is required — set in MCP server env or use ORGOS_MCP_AUTH=0 for local dev"
    );
  }
}
