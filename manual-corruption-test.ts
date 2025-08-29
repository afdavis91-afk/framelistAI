/**
 * Manual test script to simulate JSON corruption scenarios
 * Run this to test the robust storage implementation
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createRobustJSONStorage, validatePricingPreferences, validateConstructionState } from "../utils/storageUtils";

// Test scenarios for manual corruption
const corruptionScenarios = {
  truncatedJson: '{"preferences":{"defaultLocation":{"city":"Denver","state":"CO"',
  invalidJson: "not-json-at-all",
  partialCorruption: '{"preferences":{"defaultLocation":null},"comparisons":{}}',
  emptyString: "",
  malformedArray: '{"projects":[{"id":"test","name":"Test"',
  missingClosingBrace: '{"constructionStandards":{"studSpacingDefault":16',
};

export async function testCorruptionRecovery() {
  console.log("🧪 Testing JSON corruption recovery...");
  
  const pricingStorage = createRobustJSONStorage({
    validateState: validatePricingPreferences,
    onError: (error, key) => {
      console.log(`✅ Pricing storage error handled for ${key}: ${error.message}`);
    }
  });

  const constructionStorage = createRobustJSONStorage({
    validateState: validateConstructionState,
    onError: (error, key) => {
      console.log(`✅ Construction storage error handled for ${key}: ${error.message}`);
    }
  });

  // Test each corruption scenario
  for (const [scenario, corruptData] of Object.entries(corruptionScenarios)) {
    console.log(`\n📝 Testing scenario: ${scenario}`);
    
    // Simulate corrupted data in AsyncStorage
    await AsyncStorage.setItem("test-pricing-key", corruptData);
    await AsyncStorage.setItem("test-construction-key", corruptData);
    
    // Test pricing storage recovery
    const pricingResult = await pricingStorage.getItem("test-pricing-key");
    console.log(`   Pricing result: ${pricingResult === null ? "✅ Recovered (null)" : "❌ Failed"}`);
    
    // Test construction storage recovery
    const constructionResult = await constructionStorage.getItem("test-construction-key");
    console.log(`   Construction result: ${constructionResult === null ? "✅ Recovered (null)" : "❌ Failed"}`);
  }

  // Test valid data passes through
  console.log("\n📝 Testing valid data preservation...");
  
  const validPricingData = JSON.stringify({
    preferences: {
      defaultLocation: {
        city: "Denver",
        state: "CO",
        costIndex: 1.12,
        region: "west"
      },
      preferredSuppliers: [],
      maxPriceAge: 24,
      confidenceThreshold: 0.7,
      enableLiveRetail: true,
      enableBaseline: true,
      wasteFactorOverrides: {},
      budgetBuffer: 10
    },
    comparisons: {}
  });

  await AsyncStorage.setItem("test-valid-pricing", validPricingData);
  const validResult = await pricingStorage.getItem("test-valid-pricing");
  console.log(`   Valid data preserved: ${validResult !== null ? "✅ Yes" : "❌ No"}`);

  // Cleanup test keys
  await AsyncStorage.multiRemove([
    "test-pricing-key",
    "test-construction-key", 
    "test-valid-pricing"
  ]);

  console.log("\n🎉 Corruption recovery test completed!");
}

// Export for manual testing
export { corruptionScenarios };