#!/usr/bin/env node
/**
 * Micro-benchmark for Pipeline Hotspots
 * 
 * Directly benchmarks the three critical functions:
 * - IntentSchema.validate()
 * - TokenBucket.classify()
 * - PathValidator.isPathAllowed()
 * 
 * Reports before/after performance with statistical analysis.
 */

const { performance } = require('perf_hooks');
const { IntentSchema } = require('../core/pipeline/intercept');
const { SingleRateThreeColorTokenBucket } = require('../core/qos/token-bucket');
const PathValidator = require('../core/validators/path-validator');

const ITERATIONS = 10000;

function benchmark(name, fn, iterations = ITERATIONS) {
    const times = [];
    
    // Warmup
    for (let i = 0; i < 100; i++) {
        fn();
    }
    
    // Actual benchmark
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        fn();
        const end = performance.now();
        times.push(end - start);
    }
    
    // Calculate statistics
    times.sort((a, b) => a - b);
    const sum = times.reduce((acc, t) => acc + t, 0);
    const mean = sum / times.length;
    const min = times[0];
    const max = times[times.length - 1];
    const p50 = times[Math.floor(times.length * 0.50)];
    const p95 = times[Math.floor(times.length * 0.95)];
    const p99 = times[Math.floor(times.length * 0.99)];
    
    return { name, mean, min, max, p50, p95, p99, iterations };
}

function printResults(results, target = null) {
    console.log(`\n📊 ${results.name}`);
    console.log(`   Iterations: ${results.iterations.toLocaleString()}`);
    console.log(`   Mean:  ${results.mean.toFixed(4)}ms`);
    console.log(`   Min:   ${results.min.toFixed(4)}ms`);
    console.log(`   Max:   ${results.max.toFixed(4)}ms`);
    console.log(`   p50:   ${results.p50.toFixed(4)}ms`);
    console.log(`   p95:   ${results.p95.toFixed(4)}ms`);
    console.log(`   p99:   ${results.p99.toFixed(4)}ms`);
    
    if (target) {
        const status = results.mean < target ? '✅' : '❌';
        console.log(`   Target: <${target}ms ${status}`);
    }
}

console.log('🔬 Pipeline Hotspot Micro-benchmarks');
console.log('=====================================\n');

// Benchmark 1: IntentSchema.validate()
console.log('▶ Benchmarking IntentSchema.validate()...');
const intentSchemaResults = benchmark(
    'IntentSchema.validate()',
    () => {
        IntentSchema.validate({
            type: 'filesystem',
            operation: 'read',
            params: { path: '/test/path.txt' },
            extensionId: 'test-ext'
        });
    }
);
printResults(intentSchemaResults, 1.0);

// Benchmark 2: TokenBucket.classify()
console.log('\n▶ Benchmarking TokenBucket.classify()...');
const bucket = new SingleRateThreeColorTokenBucket({
    cir: 6000,
    bc: 5000,
    be: 2500
});
const tokenBucketResults = benchmark(
    'TokenBucket.classify()',
    () => {
        bucket.classify(1);
    }
);
printResults(tokenBucketResults, 0.5);

// Benchmark 3: PathValidator.isPathAllowed()
console.log('\n▶ Benchmarking PathValidator.isPathAllowed()...');
const validator = new PathValidator({
    rootDirectory: process.cwd(),
    allowedPatterns: ['**/*'],
    deniedPaths: []
});
const pathValidatorResults = benchmark(
    'PathValidator.isPathAllowed()',
    () => {
        validator.isPathAllowed('./test/fixtures/sample.txt');
    }
);
printResults(pathValidatorResults, 2.0);

// Summary
console.log('\n=====================================');
console.log('📈 Summary');
console.log('=====================================');

const allPassed = 
    intentSchemaResults.mean < 1.0 &&
    tokenBucketResults.mean < 0.5 &&
    pathValidatorResults.mean < 2.0;

if (allPassed) {
    console.log('✅ All targets met!');
} else {
    console.log('⚠️  Some targets not met - see details above');
}

// Export results for documentation
const resultsJson = {
    timestamp: new Date().toISOString(),
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
    benchmarks: {
        intentSchema: intentSchemaResults,
        tokenBucket: tokenBucketResults,
        pathValidator: pathValidatorResults
    },
    targets: {
        intentSchema: 1.0,
        tokenBucket: 0.5,
        pathValidator: 2.0
    },
    allTargetsMet: allPassed
};

const fs = require('fs');
const path = require('path');
const outputDir = path.join(__dirname, '..', 'profiling-output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}
const outputFile = path.join(outputDir, 'benchmark-results.json');
fs.writeFileSync(outputFile, JSON.stringify(resultsJson, null, 2));
console.log(`\n💾 Results saved to: ${outputFile}\n`);
