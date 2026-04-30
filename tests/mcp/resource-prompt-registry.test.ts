// @ts-expect-error Vitest loads raw markdown via Vite in tests.
import readme from "../../README.md?raw";
// @ts-expect-error Vitest loads raw markdown via Vite in tests.
import readmeZhCn from "../../README.zh-CN.md?raw";
import { describe, expect, it } from "vitest";
import { buildPromptDefinitions, buildPromptHandlerMap } from "../../src/mcp/prompt-catalog";
import type { PromptManifestEntry } from "../../src/mcp/prompt-manifest";
import { findEnabledPrompt, getEnabledPrompts } from "../../src/mcp/prompt-registry";
import { buildResourceDefinitions, buildResourceHandlerMap } from "../../src/mcp/resource-catalog";
import type { ResourceManifestEntry } from "../../src/mcp/resource-manifest";
import { findEnabledResource, getEnabledResources } from "../../src/mcp/resource-registry";

const resourceManifest: ResourceManifestEntry[] = [
  {
    uri: "resource://toolhive/overview",
    name: "overview",
    description: "Service overview.",
    mimeType: "text/markdown",
    kind: "static",
    handler: async () => ({
      contents: [
        {
          uri: "resource://toolhive/overview",
          mimeType: "text/markdown",
          text: "# Toolhive MCP"
        }
      ]
    })
  }
];

const promptManifest: PromptManifestEntry[] = [
  {
    name: "choose_tool_for_task",
    description: "Choose the best Toolhive MCP tool for a task.",
    arguments: [
      {
        name: "task",
        required: true
      }
    ],
    argumentsSchema: {
      type: "object",
      properties: {
        task: { type: "string", minLength: 1 }
      },
      required: ["task"],
      additionalProperties: false
    },
    handler: async ({ task }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Pick the best Toolhive MCP tool for: ${task}`
          }
        }
      ]
    })
  }
];

describe("resource and prompt manifest infrastructure", () => {
  it("projects resource manifest entries into MCP resource definitions", () => {
    expect(buildResourceDefinitions(resourceManifest)).toEqual([
      {
        uri: "resource://toolhive/overview",
        name: "overview",
        description: "Service overview.",
        mimeType: "text/markdown"
      }
    ]);
  });

  it("builds resource handler maps from manifest entries", async () => {
    const handler = buildResourceHandlerMap(resourceManifest).get("resource://toolhive/overview");

    await expect(
      handler?.({ env: {}, request: new Request("https://example.com/mcp", { method: "POST" }) })
    ).resolves.toEqual({
      contents: [
        {
          uri: "resource://toolhive/overview",
          mimeType: "text/markdown",
          text: "# Toolhive MCP"
        }
      ]
    });
  });

  it("exposes manifest-backed built-in resources and resolves them by URI", () => {
    const resources = getEnabledResources({});
    const uris = resources.map((resource) => resource.uri);

    expect(uris).toContain("resource://toolhive/overview");
    expect(uris).toContain("resource://toolhive/auth");
    expect(uris).toContain("resource://toolhive/catalog");
    expect(uris).toContain("resource://toolhive/runtime/enabled");
    expect(findEnabledResource("resource://toolhive/runtime/enabled", {})?.name).toBe("runtime-enabled");
  });

  it("projects prompt manifest entries into MCP prompt definitions", () => {
    expect(buildPromptDefinitions(promptManifest)).toEqual([
      {
        name: "choose_tool_for_task",
        description: "Choose the best Toolhive MCP tool for a task.",
        arguments: [
          {
            name: "task",
            required: true
          }
        ]
      }
    ]);
  });

  it("builds prompt handler maps from manifest entries", async () => {
    const handler = buildPromptHandlerMap(promptManifest).get("choose_tool_for_task");

    await expect(
      handler?.(
        { task: "Look up docs" },
        { env: {}, request: new Request("https://example.com/mcp", { method: "POST" }) }
      )
    ).resolves.toEqual({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Pick the best Toolhive MCP tool for: Look up docs"
          }
        }
      ]
    });
  });

  it("exposes manifest-backed built-in prompts and resolves them by name", () => {
    const prompts = getEnabledPrompts({});
    const names = prompts.map((prompt) => prompt.name);

    expect(names).toContain("choose_tool_for_task");
    expect(names).toContain("research_with_sources");
    expect(names).toContain("developer_utility_workflow");
    expect(findEnabledPrompt("research_with_sources", {})?.name).toBe("research_with_sources");
  });

  it("documents resources and prompts in generated README content", () => {
    expect(readme).toContain("Built-in resources");
    expect(readme).toContain("resource://toolhive/overview");
    expect(readme).toContain("(text/markdown, static)");
    expect(readme).toContain("resource://toolhive/runtime/enabled");
    expect(readme).toContain("(application/json, runtime)");
    expect(readme).toContain("Built-in prompts");
    expect(readme).toContain("choose_tool_for_task");

    expect(readmeZhCn).toContain("内置 Resources");
    expect(readmeZhCn).toContain("resource://toolhive/overview");
    expect(readmeZhCn).toContain("(text/markdown, static)");
    expect(readmeZhCn).toContain("resource://toolhive/runtime/enabled");
    expect(readmeZhCn).toContain("(application/json, runtime)");
    expect(readmeZhCn).toContain("内置 Prompts");
    expect(readmeZhCn).toContain("choose_tool_for_task");
  });
});
