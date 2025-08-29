/**
 * Test file for PDF JSON parsing improvements
 * Tests the robust JSON parser with various malformed responses
 */

import { RobustJSONParser } from '../utils/jsonParser';

// Mock AI responses that could cause JSON parse errors
const testResponses = {
  truncatedJson: `Here's the analysis:
\`\`\`json
{
  "project": {
    "name": "Test Project",
    "address": "123 Main St"
  },
  "takeoff": [
    {
      "itemId": "ITEM_001",
      "uom": "EA",
      "qty": 10,
      "material": {
        "spec": "2x4 SPF"`,
  
  missingClosingBrace: `\`\`\`json
{
  "project": {
    "name": "Test Project"
  },
  "takeoff": [],
  "flags": [],
  "confidence": 0.8
\`\`\``,

  incompleteArray: `\`\`\`json
{
  "project": {
    "name": "Test Project"
  },
  "takeoff": [
    {
      "itemId": "ITEM_001",
      "uom": "EA"
  ],
  "flags": [],
  "confidence": 0.8
}
\`\`\``,

  validJson: `\`\`\`json
{
  "project": {
    "name": "Test Project",
    "address": "123 Main St",
    "levels": ["L1"]
  },
  "takeoff": [
    {
      "itemId": "ITEM_001",
      "uom": "EA",
      "qty": 10,
      "material": {
        "spec": "2x4 SPF",
        "grade": "Standard"
      }
    }
  ],
  "flags": [],
  "confidence": 0.8
}
\`\`\``,

  noJson: `I couldn't analyze the PDF properly. The document appears to be corrupted or unreadable.`,

  partialValidJson: `\`\`\`json
{
  "project": {
    "name": "Test Project"
  },
  "takeoff": "invalid_array",
  "flags": [],
  "confidence": 0.8
}
\`\`\``,
};

export function testJSONParsing() {
  console.log('🧪 Testing PDF JSON parsing improvements...');

  // Test 1: Valid JSON should parse successfully
  console.log('\n📝 Test 1: Valid JSON');
  const validResult = RobustJSONParser.extractJSON(testResponses.validJson);
  console.log(`   Result: ${validResult.success ? '✅ Success' : '❌ Failed'}`);
  if (validResult.success) {
    console.log(`   Project: ${validResult.data.project.name}`);
    console.log(`   Takeoff items: ${validResult.data.takeoff.length}`);
  }

  // Test 2: Truncated JSON should be repaired
  console.log('\n📝 Test 2: Truncated JSON');
  const truncatedResult = RobustJSONParser.extractJSON(testResponses.truncatedJson, {
    attemptRepair: true,
    maxRepairAttempts: 3,
  });
  console.log(`   Result: ${truncatedResult.success ? '✅ Repaired' : '❌ Failed'}`);
  if (truncatedResult.repairAttempted) {
    console.log('   ✅ Repair was attempted');
  }

  // Test 3: Missing closing brace should be fixed
  console.log('\n📝 Test 3: Missing closing brace');
  const missingBraceResult = RobustJSONParser.extractJSON(testResponses.missingClosingBrace, {
    attemptRepair: true,
  });
  console.log(`   Result: ${missingBraceResult.success ? '✅ Repaired' : '❌ Failed'}`);
  if (missingBraceResult.success) {
    console.log(`   Confidence: ${missingBraceResult.data.confidence}`);
  }

  // Test 4: Incomplete array should be handled
  console.log('\n📝 Test 4: Incomplete array');
  const incompleteResult = RobustJSONParser.extractJSON(testResponses.incompleteArray, {
    attemptRepair: true,
  });
  console.log(`   Result: ${incompleteResult.success ? '✅ Repaired' : '❌ Failed'}`);

  // Test 5: No JSON should fail gracefully
  console.log('\n📝 Test 5: No JSON content');
  const noJsonResult = RobustJSONParser.extractJSON(testResponses.noJson);
  console.log(`   Result: ${noJsonResult.success ? '❌ Unexpected success' : '✅ Failed gracefully'}`);
  console.log(`   Error: ${noJsonResult.error}`);

  // Test 6: Partial valid JSON with fallback
  console.log('\n📝 Test 6: Partial valid JSON');
  const partialResult = RobustJSONParser.extractJSON(testResponses.partialValidJson, {
    fallbackToPartial: true,
  });
  console.log(`   Result: ${partialResult.success ? '✅ Extracted partial' : '❌ Failed'}`);
  if (partialResult.partialData) {
    console.log('   ✅ Partial data available');
  }

  // Test 7: JSON validation
  console.log('\n📝 Test 7: JSON structure validation');
  const validationTest = {
    takeoff: [
      { itemId: 'test', uom: 'EA', qty: 5 }
    ],
    flags: [],
    confidence: 0.8
  };
  const validation = RobustJSONParser.validateJSONStructure(validationTest);
  console.log(`   Valid: ${validation.valid ? '✅ Yes' : '❌ No'}`);
  if (validation.errors.length > 0) {
    console.log(`   Errors: ${validation.errors.join(', ')}`);
  }
  if (validation.warnings.length > 0) {
    console.log(`   Warnings: ${validation.warnings.join(', ')}`);
  }

  console.log('\n🎉 JSON parsing test completed!');
}

// Export test responses for manual testing
export { testResponses };