export const SERVER_INFO = {
  name: "cloudflare-multi-mcp",
  version: "0.1.0"
} as const;

export function initializeResult() {
  return {
    protocolVersion: "2025-06-18",
    capabilities: {
      tools: {}
    },
    serverInfo: SERVER_INFO
  };
}
