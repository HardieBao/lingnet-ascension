// Launch contract: model tokens are not game Token or a monetary price cap.
export const MODEL_CONTRACT = {
  id: "gpt-5.6-sol",
  tokenBudget: 30000,
  maxOutputTokens: 2048,
  budgetAccounting: "input+output",
} as const;
