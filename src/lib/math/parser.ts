import type { MathToken } from "./tokenizer";

export type MathAst = number;

export function parseMathExpression(tokens: MathToken[]): MathAst {
  return tokens.length;
}
