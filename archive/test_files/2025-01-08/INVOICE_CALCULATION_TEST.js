/**
 * Invoice Calculation Test Suite
 * Run this to verify calculations are correct
 */

const testCalculations = () => {
  const testCases = [
    {
      name: "Basic calculation with discount",
      input: {
        subtotal: 40,
        discount: 8,
        taxRate: 0.12,
        delivery: 0
      },
      expected: {
        taxable: 32,
        tax: 3.84,
        roundOff: 0.16,
        netAmount: 36
      }
    },
    {
      name: "With delivery charges",
      input: {
        subtotal: 100,
        discount: 10,
        taxRate: 0.18,
        delivery: 5
      },
      expected: {
        taxable: 90,
        tax: 16.2,
        roundOff: -0.2,
        netAmount: 111
      }
    }
  ];

  testCases.forEach(test => {
    const taxable = test.input.subtotal - test.input.discount;
    const tax = taxable * test.input.taxRate;
    const preRound = taxable + tax + test.input.delivery;
    const roundOff = Math.round(preRound) - preRound;
    const netAmount = Math.round(preRound);

    const passed = 
      taxable === test.expected.taxable &&
      tax === test.expected.tax &&
      Math.abs(roundOff - test.expected.roundOff) < 0.01 &&
      netAmount === test.expected.netAmount;

    console.log(`Test: ${test.name}`);
    console.log(`  Taxable: ${taxable} (expected: ${test.expected.taxable})`);
    console.log(`  Tax: ${tax} (expected: ${test.expected.tax})`);
    console.log(`  Round Off: ${roundOff.toFixed(2)} (expected: ${test.expected.roundOff})`);
    console.log(`  Net Amount: ${netAmount} (expected: ${test.expected.netAmount})`);
    console.log(`  Result: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log('');
  });
};

// Export for use in components
export default testCalculations;

// Run if executed directly
if (typeof module !== 'undefined' && require.main === module) {
  testCalculations();
}