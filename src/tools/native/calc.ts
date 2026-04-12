import { validationError } from "../../lib/errors";
import { evaluateMathExpression } from "../../lib/math/evaluate";
import type { ToolContext } from "../types";
import type { ToolExecutionResult } from "../../mcp/result";

export async function handleCalc(args: unknown, _context: ToolContext): Promise<ToolExecutionResult> {
  const expression =
    typeof args === "object" && args !== null && "expression" in args
      ? (args as { expression?: unknown }).expression
      : undefined;

  return evaluateMathExpression(expression);
}

export async function callNativeTool(name: string, args: unknown, context: ToolContext): Promise<ToolExecutionResult> {
  switch (name) {
    case "calc":
      return handleCalc(args, context);
    default:
      return validationError(`Unsupported native tool: ${name}`);
  }
}
