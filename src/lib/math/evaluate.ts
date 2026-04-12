import { validationError } from "../errors";
import { parseMathExpression } from "./parser";
import { tokenize } from "./tokenizer";
import type { ToolExecutionResult } from "../../mcp/result";

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E
};

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  pow: Math.pow
};

class ExpressionParser {
  private index = 0;

  constructor(private readonly tokens: string[]) {}

  parse(): number {
    const value = this.parseExpression();

    if (this.peek() !== undefined) {
      throw new Error(`Unexpected token: ${this.peek()}`);
    }

    if (!Number.isFinite(value)) {
      throw new Error("Expression did not evaluate to a finite number");
    }

    return value;
  }

  private parseExpression(): number {
    let value = this.parseTerm();

    while (true) {
      const token = this.peek();
      if (token === "+") {
        this.index += 1;
        value += this.parseTerm();
        continue;
      }
      if (token === "-") {
        this.index += 1;
        value -= this.parseTerm();
        continue;
      }
      return value;
    }
  }

  private parseTerm(): number {
    let value = this.parsePower();

    while (true) {
      const token = this.peek();
      if (token === "*") {
        this.index += 1;
        value *= this.parsePower();
        continue;
      }
      if (token === "/") {
        this.index += 1;
        value /= this.parsePower();
        continue;
      }
      return value;
    }
  }

  private parsePower(): number {
    let value = this.parseUnary();

    if (this.peek() === "^") {
      this.index += 1;
      value = value ** this.parsePower();
    }

    return value;
  }

  private parseUnary(): number {
    const token = this.peek();
    if (token === "+") {
      this.index += 1;
      return this.parseUnary();
    }
    if (token === "-") {
      this.index += 1;
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const token = this.consume();

    if (token === undefined) {
      throw new Error("Expression is empty");
    }

    if (/^\d*\.?\d+$/.test(token)) {
      return Number(token);
    }

    if (token === "(") {
      const value = this.parseExpression();
      this.expect(")");
      return value;
    }

    const constant = CONSTANTS[token];
    if (constant !== undefined) {
      return constant;
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
      const fn = FUNCTIONS[token];
      if (!fn) {
        throw new Error(`Unsupported identifier: ${token}`);
      }

      this.expect("(");
      const args: number[] = [];
      if (this.peek() !== ")") {
        args.push(this.parseExpression());
        while (this.peek() === ",") {
          this.index += 1;
          args.push(this.parseExpression());
        }
      }
      this.expect(")");

      const value = fn(...args);
      if (!Number.isFinite(value)) {
        throw new Error(`Function ${token} returned a non-finite result`);
      }
      return value;
    }

    throw new Error(`Unexpected token: ${token}`);
  }

  private expect(token: string): void {
    const actual = this.consume();
    if (actual !== token) {
      throw new Error(`Expected ${token} but received ${actual ?? "end of input"}`);
    }
  }

  private consume(): string | undefined {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  }

  private peek(): string | undefined {
    return this.tokens[this.index];
  }
}

export function evaluateMathExpression(expression: unknown): ToolExecutionResult {
  if (typeof expression !== "string" || expression.trim() === "") {
    return validationError("expression must be a non-empty string");
  }

  const tokens = tokenize(expression);

  try {
    parseMathExpression(tokens);
    const result = new ExpressionParser(tokens).parse();
    return {
      ok: true,
      data: { result }
    };
  } catch (error) {
    return validationError(
      error instanceof Error ? error.message : "expression is invalid"
    );
  }
}
