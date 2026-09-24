import { getTenantId } from "../../tenant.js";

export function buildClaudeDesktopMcpSnippet(): string {
  const tenant = getTenantId();
  return JSON.stringify(
    {
      mcpServers: {
        "orgos-steward": {
          command: "npx",
          args: ["--yes", "tsx", "src/cli.ts", "mcp", "start"],
          env: {
            ORGOS_TENANT: tenant,
            ORGOS_MCP_TOKEN: "<generate: orgos mcp rotate-token>",
          },
        },
      },
    },
    null,
    2
  );
}

export function buildContinueMcpSnippet(): string {
  const tenant = getTenantId();
  return JSON.stringify(
    {
      experimental: {
        modelContextProtocolServers: [
          {
            name: "orgos-steward",
            command: "npm",
            args: ["run", "orgos", "--", "mcp", "start"],
            env: {
              ORGOS_TENANT: tenant,
              ORGOS_MCP_TOKEN: "<generate: orgos mcp rotate-token>",
            },
          },
        ],
      },
    },
    null,
    2
  );
}
