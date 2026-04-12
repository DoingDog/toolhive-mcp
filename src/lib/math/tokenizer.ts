export type MathToken = string;

export function tokenize(expression: string): MathToken[] {
  return expression.match(/\d*\.?\d+|[A-Za-z_][A-Za-z0-9_]*|\S/g) ?? [];
}
