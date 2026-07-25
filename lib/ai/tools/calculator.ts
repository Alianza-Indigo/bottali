// Hand-rolled recursive-descent parser for +,-,*,/,(,) and decimal numbers.
// Deliberately does NOT use eval()/Function() — this is a user-facing "internal tool"
// (§15) and must not be able to execute arbitrary code.

class CalculatorSyntaxError extends Error {}

function tokenize(expression: string): string[] {
  const tokens = expression.match(/\d+(\.\d+)?|[+\-*/()]/g);
  if (!tokens || tokens.join("") !== expression.replace(/\s+/g, "")) {
    throw new CalculatorSyntaxError("La expresión contiene caracteres no permitidos.");
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: string[]) {}

  private peek(): string | undefined {
    return this.tokens[this.pos];
  }

  private consume(): string {
    const token = this.tokens[this.pos];
    if (token === undefined) throw new CalculatorSyntaxError("Expresión incompleta.");
    this.pos += 1;
    return token;
  }

  parseExpression(): number {
    let value = this.parseTerm();
    while (this.peek() === "+" || this.peek() === "-") {
      const op = this.consume();
      const rhs = this.parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  private parseTerm(): number {
    let value = this.parseFactor();
    while (this.peek() === "*" || this.peek() === "/") {
      const op = this.consume();
      const rhs = this.parseFactor();
      if (op === "/" && rhs === 0) throw new CalculatorSyntaxError("División entre cero.");
      value = op === "*" ? value * rhs : value / rhs;
    }
    return value;
  }

  private parseFactor(): number {
    if (this.peek() === "-") {
      this.consume();
      return -this.parseFactor();
    }
    if (this.peek() === "(") {
      this.consume();
      const value = this.parseExpression();
      if (this.consume() !== ")") throw new CalculatorSyntaxError("Falta un paréntesis de cierre.");
      return value;
    }
    const token = this.consume();
    const value = Number(token);
    if (Number.isNaN(value)) throw new CalculatorSyntaxError(`Token inesperado: ${token}`);
    return value;
  }
}

export function evaluateArithmeticExpression(expression: string): number {
  const tokens = tokenize(expression);
  const parser = new Parser(tokens);
  const result = parser.parseExpression();
  if (!Number.isFinite(result)) throw new CalculatorSyntaxError("El resultado no es un número finito.");
  return result;
}
