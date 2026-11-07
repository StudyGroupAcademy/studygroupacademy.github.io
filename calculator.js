import { $, showToast } from "./core.js";

function calculate(expression) {
  const tokens = expression.match(/\d+(?:\.\d*)?|\.\d+|[()+\-*/%]/g) || [];
  if (tokens.join("") !== expression.replace(/\s/g, "")) {
    throw new Error("Use numbers and +, −, ×, ÷, %, and parentheses.");
  }
  let position = 0;

  function parseExpression() {
    let value = parseTerm();
    while (tokens[position] === "+" || tokens[position] === "-") {
      const operator = tokens[position++];
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  function parseTerm() {
    let value = parseFactor();
    while (["*", "/", "%"].includes(tokens[position])) {
      const operator = tokens[position++];
      const right = parseFactor();
      if ((operator === "/" || operator === "%") && right === 0) throw new Error("You can't divide by zero.");
      if (operator === "*") value *= right;
      if (operator === "/") value /= right;
      if (operator === "%") value %= right;
    }
    return value;
  }

  function parseFactor() {
    const token = tokens[position++];
    if (token === "+" || token === "-") {
      const value = parseFactor();
      return token === "-" ? -value : value;
    }
    if (token === "(") {
      const value = parseExpression();
      if (tokens[position++] !== ")") throw new Error("Close the open parenthesis.");
      return value;
    }
    if (!token || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) {
      throw new Error("Enter a complete calculation.");
    }
    return Number(token);
  }

  if (!tokens.length) throw new Error("Enter a calculation first.");
  const value = parseExpression();
  if (position !== tokens.length || !Number.isFinite(value)) throw new Error("Check the calculation and try again.");
  return Number(value.toPrecision(12)).toString();
}

export function initCalculator() {
  const display = $("#calculator-display");
  const result = $("#calculator-result");
  const calculator = $("#calculator");
  if (!display || !result || !calculator) return;

  function evaluate() {
    try {
      result.textContent = calculate(display.value);
    } catch (error) {
      result.textContent = error.message;
    }
  }

  calculator.addEventListener("click", (event) => {
    const button = event.target.closest("[data-calculator-key]");
    if (!button) return;
    const key = button.dataset.calculatorKey;
    if (key === "clear") {
      display.value = "";
      result.textContent = "";
      return;
    }
    if (key === "backspace") {
      display.value = display.value.slice(0, -1);
      result.textContent = "";
      return;
    }
    if (key === "equals") {
      evaluate();
      return;
    }
    if (display.value.length >= 60) {
      showToast("That calculation is too long.");
      return;
    }
    display.value += key;
    result.textContent = "";
  });

  display.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === "=") {
      event.preventDefault();
      evaluate();
    } else if (event.key === "Escape") {
      display.value = "";
      result.textContent = "";
    }
  });
}
