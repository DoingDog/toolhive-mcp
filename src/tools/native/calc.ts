import { validationError } from "../../lib/errors";
import { evaluateMathExpression } from "../../lib/math/evaluate";
import type { ToolContext } from "../types";
import type { ToolExecutionResult } from "../../mcp/result";

type CalcArgs = {
  expression?: unknown;
  expr?: unknown;
  input?: unknown;
};

export async function handleCalc(args: unknown, _context: ToolContext): Promise<ToolExecutionResult> {
  const calcArgs = (args ?? {}) as CalcArgs;
  const expression = calcArgs.expression ?? calcArgs.expr ?? calcArgs.input;

  if (typeof expression !== "string" || expression.trim() === "") {
    return validationError("expression, expr, or input must be a non-empty string");
  }

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
