import packageJson from "../../package.json";

export const SERVER_INFO = {
  name: packageJson.name,
  version: packageJson.version
} as const;

export function initializeResult() {
  return {
    protocolVersion: "2025-06-18",
    capabilities: {
      tools: {},
      resources: {},
      prompts: {}
    },
    serverInfo: SERVER_INFO
  };
}
