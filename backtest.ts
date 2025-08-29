#!/usr/bin/env ts-node

import { providerRunner, PricingRequest } from "../src/pricing/ProviderRunner";
import { SpecKey } from "../src/pricing/SpecKey";
import { Qty } from "../src/pricing/Uom";
import * as fs from "fs";
import * as path from "path";

interface BacktestCase {
  name: string;
  specKey: SpecKey;
  qty: Qty;
  expected: {
    unitPrice: number;
    tolerance: number;
  };
}

interface BacktestResult {
  case: BacktestCase;
  actual: {
    unitPrice: number;
    score: number;
    p25: number;
    p75: number;
    selectionBasis: string;
  };
  passed: boolean;
  error?: string;
  mape: number;
}

interface BacktestSummary {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  averageMape: number;
  coverage: number;
  results: BacktestResult[];
}

// Golden test cases
const GOLDEN_CASES: BacktestCase[] = [
  {
    name: "2x4x8 SPF",
    specKey: {
      mat: "LUMBER",
      species: "SPF",
      profile: "2x4",
      length_in: 96,
      region: "Seattle-Tacoma-Bellevue, WA",
      asOf: "2025-08-01"
    },
    qty: { value: 100, uom: "EA" },
    expected: { unitPrice: 3.25, tolerance: 0.15 }
  },
  {
    name: "Plywood 4x8 1/2",
    specKey: {
      mat: "SHEATHING",
      profile: "PLY",
      thickness_in: 0.5,
      region: "Denver-Aurora-Lakewood, CO",
      asOf: "2025-08-01"
    },
    qty: { value: 50, uom: "SHEET" },
    expected: { unitPrice: 28.99, tolerance: 2.00 }
  },
  {
    name: "2x6x10 SYP",
    specKey: {
      mat: "LUMBER",
      species: "SYP",
      profile: "2x6",
      length_in: 120,
      region: "Portland-Vancouver-Hillsboro, OR-WA",
      asOf: "2025-08-01"
    },
    qty: { value: 75, uom: "EA" },
    expected: { unitPrice: 5.75, tolerance: 0.25 }
  }
];

async function runBacktest(asOf: string): Promise<BacktestSummary> {
  console.log(`Running pricing backtest for ${asOf}...\n`);
  
  const results: BacktestResult[] = [];
  let totalMape = 0;
  let validCases = 0;
  
  for (const testCase of GOLDEN_CASES) {
    try {
      // Update asOf date
      const updatedSpecKey = { ...testCase.specKey, asOf };
      
      const request: PricingRequest = {
        specKey: updatedSpecKey,
        qty: testCase.qty,
        options: {
          useRegionalIndex: true,
          useLanded: false,
          blendCatalogLive: 0.6,
          requireInStock: false,
          maxQuoteAgeDays: 30,
          minAccept: 0.85,
          priceAsOf: asOf,
          currency: "USD",
          fxRate: 1.0,
          preferVendors: []
        }
      };
      
      const pricingResult = await providerRunner.getBestQuotes(request);
      
      // Calculate MAPE
      const mape = Math.abs((pricingResult.unitPrice - testCase.expected.unitPrice) / testCase.expected.unitPrice) * 100;
      const passed = mape <= testCase.expected.tolerance;
      
      if (isFinite(mape)) {
        totalMape += mape;
        validCases++;
      }
      
      const result: BacktestResult = {
        case: testCase,
        actual: {
          unitPrice: pricingResult.unitPrice,
          score: pricingResult.score,
          p25: pricingResult.p25,
          p75: pricingResult.p75,
          selectionBasis: pricingResult.selectionBasis
        },
        passed,
        mape
      };
      
      results.push(result);
      
      // Print individual result
      const status = passed ? "✅ PASS" : "❌ FAIL";
      console.log(`${status} ${testCase.name}`);
      console.log(`  Expected: $${testCase.expected.unitPrice.toFixed(2)} ± $${testCase.expected.tolerance.toFixed(2)}`);
      console.log(`  Actual:   $${pricingResult.unitPrice.toFixed(2)} (${pricingResult.selectionBasis})`);
      console.log(`  MAPE:     ${mape.toFixed(1)}%`);
      console.log(`  Score:    ${pricingResult.score.toFixed(3)}`);
      console.log(`  Range:    $${pricingResult.p25.toFixed(2)} - $${pricingResult.p75.toFixed(2)}`);
      console.log("");
      
    } catch (error) {
      const result: BacktestResult = {
        case: testCase,
        actual: {
          unitPrice: 0,
          score: 0,
          p25: 0,
          p75: 0,
          selectionBasis: "ERROR"
        },
        passed: false,
        error: error instanceof Error ? error.message : "Unknown error",
        mape: 100
      };
      
      results.push(result);
      
      console.log(`❌ ERROR ${testCase.name}`);
      console.log(`  Error: ${result.error}`);
      console.log("");
    }
  }
  
  const passedCases = results.filter(r => r.passed).length;
  const averageMape = validCases > 0 ? totalMape / validCases : 0;
  const coverage = (validCases / GOLDEN_CASES.length) * 100;
  
  return {
    totalCases: GOLDEN_CASES.length,
    passedCases,
    failedCases: GOLDEN_CASES.length - passedCases,
    averageMape,
    coverage,
    results
  };
}

function printSummary(summary: BacktestSummary): void {
  console.log("=" * 60);
  console.log("BACKTEST SUMMARY");
  console.log("=" * 60);
  console.log(`Total Cases: ${summary.totalCases}`);
  console.log(`Passed: ${summary.passedCases}`);
  console.log(`Failed: ${summary.failedCases}`);
  console.log(`Coverage: ${summary.coverage.toFixed(1)}%`);
  console.log(`Average MAPE: ${summary.averageMape.toFixed(1)}%`);
  console.log("");
  
  if (summary.failedCases > 0) {
    console.log("FAILING CASES:");
    summary.results
      .filter(r => !r.passed)
      .forEach(r => {
        console.log(`  ❌ ${r.case.name}: ${r.error || `MAPE ${r.mape.toFixed(1)}%`}`);
      });
    console.log("");
  }
  
  // Determine overall success
  const success = summary.averageMape <= 12 && summary.coverage >= 90;
  const status = success ? "✅ SUCCESS" : "❌ FAILED";
  
  console.log(`OVERALL RESULT: ${status}`);
  console.log(`  MAPE ≤ 12%: ${summary.averageMape <= 12 ? "✅" : "❌"} (${summary.averageMape.toFixed(1)}%)`);
  console.log(`  Coverage ≥ 90%: ${summary.coverage >= 90 ? "✅" : "❌"} (${summary.coverage.toFixed(1)}%)`);
  
  process.exit(success ? 0 : 1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const asOfIndex = args.findIndex(arg => arg.startsWith("--asOf="));
  
  if (asOfIndex === -1) {
    console.error("Usage: ts-node scripts/backtest.ts --asOf=YYYY-MM-DD");
    process.exit(1);
  }
  
  const asOf = args[asOfIndex].split("=")[1];
  
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    console.error("Invalid date format. Use YYYY-MM-DD");
    process.exit(1);
  }
  
  try {
    const summary = await runBacktest(asOf);
    printSummary(summary);
  } catch (error) {
    console.error("Backtest failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
