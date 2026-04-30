import type { AppEnv } from "../lib/env";
import { getEnabledPrompts } from "./prompt-registry";
import type { ResourceContents, ResourceDefinition } from "./schema";
import { getEnabledTools } from "./tool-registry";

export type ResourceReadResult = {
  contents: ResourceContents[];
};

export type ResourceHandlerContext = {
  env: AppEnv;
  request: Request;
};

export type ResourceHandler = (context: ResourceHandlerContext) => Promise<ResourceReadResult>;

export type ResourceManifestEntry = ResourceDefinition & {
  kind: "static" | "runtime";
  requiresAuth?: boolean;
  handler: ResourceHandler;
};

function markdownResource(uri: string, text: string): ResourceReadResult {
  return {
    contents: [
      {
        uri,
        mimeType: "text/markdown",
        text
      }
    ]
  };
}

export const resourceManifestEntries: ResourceManifestEntry[] = [
  {
    uri: "resource://toolhive/overview",
    name: "overview",
    description: "Service overview for Toolhive MCP.",
    mimeType: "text/markdown",
    kind: "static",
    handler: async () =>
      markdownResource(
        "resource://toolhive/overview",
        [
          "# Toolhive MCP",
          "",
          "Toolhive MCP is a remote HTTP MCP server running on Cloudflare Workers.",
          "It exposes tools, resources, and prompts from a single `/mcp` endpoint for Claude-compatible clients."
        ].join("\n")
      )
  },
  {
    uri: "resource://toolhive/auth",
    name: "auth",
    description: "Authentication methods supported by Toolhive MCP.",
    mimeType: "text/markdown",
    kind: "static",
    handler: async () =>
      markdownResource(
        "resource://toolhive/auth",
        [
          "# Toolhive MCP Authentication",
          "",
          "Supported auth methods:",
          "- Bearer",
          "- x-api-key / API key",
          "- query `key`",
          "",
          "Protected MCP methods currently follow the existing server auth behavior."
        ].join("\n")
      )
  },
  {
    uri: "resource://toolhive/catalog",
    name: "catalog",
    description: "Static capability directory for Toolhive MCP.",
    mimeType: "text/markdown",
    kind: "static",
    handler: async () =>
      markdownResource(
        "resource://toolhive/catalog",
        [
          "# Toolhive MCP Capability Catalog",
          "",
          "This server exposes:",
          "- tools for web fetch, search, developer utilities, time, weather, and paper lookups",
          "- resources for service docs and runtime snapshots",
          "- prompts for end-user task setup"
        ].join("\n")
      )
  },
  {
    uri: "resource://toolhive/runtime/enabled",
    name: "runtime-enabled",
    description: "Runtime snapshot of enabled tools, resources, and prompts.",
    mimeType: "application/json",
    kind: "runtime",
    handler: async ({ env }) => ({
      contents: [
        {
          uri: "resource://toolhive/runtime/enabled",
          mimeType: "application/json",
          text: JSON.stringify(
            {
              tools: getEnabledTools(env).map((tool) => tool.name),
              resources: resourceManifestEntries.map((resource) => resource.uri),
              prompts: getEnabledPrompts(env).map((prompt) => prompt.name)
            },
            null,
            2
          )
        }
      ]
    })
  }
];
