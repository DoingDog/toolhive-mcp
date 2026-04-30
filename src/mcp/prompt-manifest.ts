import type { AppEnv } from "../lib/env";
import type { JsonSchema, PromptDefinition } from "./schema";

export type PromptMessage = {
  role: "user" | "assistant";
  content: {
    type: "text";
    text: string;
  };
};

export type PromptGetResult = {
  messages: PromptMessage[];
};

export type PromptHandlerContext = {
  env: AppEnv;
  request: Request;
};

export type PromptHandler = (args: Record<string, unknown>, context: PromptHandlerContext) => Promise<PromptGetResult>;

export type PromptManifestEntry = PromptDefinition & {
  argumentsSchema: JsonSchema;
  handler: PromptHandler;
};

function userPrompt(text: string): PromptGetResult {
  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text
        }
      }
    ]
  };
}

export const promptManifestEntries: PromptManifestEntry[] = [
  {
    name: "choose_tool_for_task",
    description: "Help choose the best Toolhive MCP tool for a task.",
    arguments: [{ name: "task", required: true, description: "User task description." }],
    argumentsSchema: {
      type: "object",
      properties: {
        task: { type: "string", minLength: 1, description: "User task description." }
      },
      required: ["task"],
      additionalProperties: false
    },
    handler: async ({ task }) =>
      userPrompt(
        [
          "Choose the best Toolhive MCP tool for the following task.",
          "Explain which tool should be called first and why.",
          `Task: ${task}`
        ].join("\n")
      )
  },
  {
    name: "research_with_sources",
    description: "Set up source-backed research using Toolhive MCP capabilities.",
    arguments: [{ name: "topic", required: true, description: "Research topic." }],
    argumentsSchema: {
      type: "object",
      properties: {
        topic: { type: "string", minLength: 1, description: "Research topic." }
      },
      required: ["topic"],
      additionalProperties: false
    },
    handler: async ({ topic }) =>
      userPrompt(
        [
          "Research the topic below using Toolhive MCP tools.",
          "Prefer source-backed findings and cite the URLs or provider outputs you used.",
          `Topic: ${topic}`
        ].join("\n")
      )
  },
  {
    name: "developer_utility_workflow",
    description: "Set up a small developer-utility task with Toolhive MCP.",
    arguments: [{ name: "job", required: true, description: "Utility job to perform." }],
    argumentsSchema: {
      type: "object",
      properties: {
        job: { type: "string", minLength: 1, description: "Utility job to perform." }
      },
      required: ["job"],
      additionalProperties: false
    },
    handler: async ({ job }) =>
      userPrompt(
        [
          "Use the Toolhive MCP developer utilities to complete the following job.",
          "Return the result directly and mention which utility was used.",
          `Job: ${job}`
        ].join("\n")
      )
  }
];
