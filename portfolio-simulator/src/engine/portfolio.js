export function createPortfolio(startValue, allocation) {
  return {
    value: startValue,
    allocation: { ...allocation } // decimals that sum to 1
  };
}

export function applyContribution(portfolio, amount) {
  portfolio.value += amount;
}

export function applyFees(portfolio, annualFeeRate) {
  // annualFeeRate = 0.002 (0.2%)
  portfolio.value *= (1 - annualFeeRate);
}

export function applyReturn(portfolio, weightedReturn) {
  portfolio.value *= (1 + weightedReturn);
}
