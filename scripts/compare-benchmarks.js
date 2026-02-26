#!/usr/bin/env node
/**
 * Compare Benchmark Results
 * 
 * Compares two benchmark result files (before/after) and shows improvements.
 * 
 * Usage:
 *   node scripts/compare-benchmarks.js before.json after.json
 */

const fs = require('fs');
const path = require('path');

if (process.argv.length < 4) {
    console.log('Usage: node scripts/compare-benchmarks.js <before.json> <after.json>');
    process.exit(1);
}

const beforeFile = process.argv[2];
const afterFile = process.argv[3];

if (!fs.existsSync(beforeFile)) {
    console.error(`Error: File not found: ${beforeFile}`);
    process.exit(1);
}

if (!fs.existsSync(afterFile)) {
    console.error(`Error: File not found: ${afterFile}`);
    process.exit(1);
}

const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
const after = JSON.parse(fs.readFileSync(afterFile, 'utf8'));

console.log('📊 Benchmark Comparison');
console.log('======================\n');

console.log(`Before: ${before.timestamp} (${before.node_version})`);
console.log(`After:  ${after.timestamp} (${after.node_version})\n`);

function compareMetric(name, beforeValue, afterValue, target, lowerIsBetter = true) {
    const diff = afterValue - beforeValue;
    const percentChange = ((diff / beforeValue) * 100);
    
    let improvement = lowerIsBetter ? -percentChange : percentChange;
    let emoji = '⚪';
    
    if (lowerIsBetter) {
        if (afterValue < target) emoji = '✅';
        else if (afterValue < beforeValue) emoji = '🟡';
        else emoji = '❌';
    } else {
        if (afterValue > target) emoji = '✅';
        else if (afterValue > beforeValue) emoji = '🟡';
        else emoji = '❌';
    }
    
    const targetStatus = lowerIsBetter 
        ? (afterValue < target ? '✅' : '❌')
        : (afterValue > target ? '✅' : '❌');
    
    console.log(`  ${name}:`);
    console.log(`    Before:      ${beforeValue.toFixed(4)}ms`);
    console.log(`    After:       ${afterValue.toFixed(4)}ms`);
    console.log(`    Improvement: ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}% ${emoji}`);
    console.log(`    Target:      <${target}ms ${targetStatus}`);
}

// IntentSchema
console.log('1️⃣  IntentSchema.validate()');
console.log('───────────────────────────');
compareMetric(
    'Mean',
    before.benchmarks.intentSchema.mean,
    after.benchmarks.intentSchema.mean,
    after.targets.intentSchema,
    true
);
console.log('');

// TokenBucket
console.log('2️⃣  TokenBucket.classify()');
console.log('──────────────────────────');
compareMetric(
    'Mean',
    before.benchmarks.tokenBucket.mean,
    after.benchmarks.tokenBucket.mean,
    after.targets.tokenBucket,
    true
);
console.log('');

// PathValidator
console.log('3️⃣  PathValidator.isPathAllowed()');
console.log('──────────────────────────────────');
compareMetric(
    'Mean',
    before.benchmarks.pathValidator.mean,
    after.benchmarks.pathValidator.mean,
    after.targets.pathValidator,
    true
);
console.log('');

// Summary
console.log('📈 Overall Summary');
console.log('==================\n');

const intentImprovement = ((before.benchmarks.intentSchema.mean - after.benchmarks.intentSchema.mean) / before.benchmarks.intentSchema.mean * 100);
const tokenImprovement = ((before.benchmarks.tokenBucket.mean - after.benchmarks.tokenBucket.mean) / before.benchmarks.tokenBucket.mean * 100);
const pathImprovement = ((before.benchmarks.pathValidator.mean - after.benchmarks.pathValidator.mean) / before.benchmarks.pathValidator.mean * 100);

const avgImprovement = (intentImprovement + tokenImprovement + pathImprovement) / 3;

console.log(`IntentSchema:   ${intentImprovement > 0 ? '+' : ''}${intentImprovement.toFixed(1)}% faster`);
console.log(`TokenBucket:    ${tokenImprovement > 0 ? '+' : ''}${tokenImprovement.toFixed(1)}% faster`);
console.log(`PathValidator:  ${pathImprovement > 0 ? '+' : ''}${pathImprovement.toFixed(1)}% faster`);
console.log(`────────────────────────────────`);
console.log(`Average:        ${avgImprovement > 0 ? '+' : ''}${avgImprovement.toFixed(1)}% faster\n`);

const allTargetsMet = after.allTargetsMet;
console.log(`All Targets Met: ${allTargetsMet ? '✅ YES' : '❌ NO'}\n`);

if (allTargetsMet) {
    console.log('🎉 Optimization successful! All targets achieved.');
} else {
    console.log('⚠️  Some targets not met. Further optimization needed.');
}

console.log('');
