import type { AppEnv } from "../lib/env";
import type { ToolExecutionResult } from "../mcp/result";

export type ToolContext = {
  env: AppEnv;
  request: Request;
};

export type ToolHandler = (args: unknown, context: ToolContext) => Promise<ToolExecutionResult>;
