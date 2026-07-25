export interface ModelCostRates {
  inputCostPerMilleCents: number;
  outputCostPerMilleCents: number;
}

export function estimateCostCents(usage: { inputTokens: number; outputTokens: number }, rates: ModelCostRates): number {
  const inputCost = (usage.inputTokens / 1000) * rates.inputCostPerMilleCents;
  const outputCost = (usage.outputTokens / 1000) * rates.outputCostPerMilleCents;
  return Number((inputCost + outputCost).toFixed(4));
}
