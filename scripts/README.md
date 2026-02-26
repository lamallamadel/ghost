# Scripts

This directory contains utility scripts for profiling and benchmarking the Ghost CLI pipeline.

## Available Scripts

### profile-load-test.js

Automated profiling script that runs the full pipeline load test with Node.js profiling flags.

**Usage:**
```bash
# CPU profiling only
node scripts/profile-load-test.js cpu

# Heap profiling only
node scripts/profile-load-test.js heap

# Both CPU and heap profiling
node scripts/profile-load-test.js both
```

**Outputs:**
- `profiling-output/cpu-profile.txt` - Processed CPU profile
- `profiling-output/heap-profile.heapprofile` - Heap allocation profile (open in Chrome DevTools)

### benchmark-hotspots.js

Micro-benchmark script that directly measures the performance of the three critical hotspot functions.

**Usage:**
```bash
node scripts/benchmark-hotspots.js
```

**Outputs:**
- Console output with detailed statistics (mean, p50, p95, p99, min, max)
- `profiling-output/benchmark-results.json` - JSON results for automation

**Performance Targets:**
- `IntentSchema.validate()` - <1ms per call
- `TokenBucket.classify()` - <0.5ms per call
- `PathValidator.isPathAllowed()` - <2ms per call

### compare-benchmarks.js

Compare two benchmark result files to analyze improvements.

**Usage:**
```bash
# Save before benchmark
node scripts/benchmark-hotspots.js
cp profiling-output/benchmark-results.json profiling-output/before.json

# Make optimizations...

# Save after benchmark
node scripts/benchmark-hotspots.js
cp profiling-output/benchmark-results.json profiling-output/after.json

# Compare
node scripts/compare-benchmarks.js profiling-output/before.json profiling-output/after.json
```

**Outputs:**
- Side-by-side comparison with improvement percentages
- Target achievement status for each function
- Overall summary with average improvement

## Profiling Workflow

1. **Run baseline benchmarks:**
   ```bash
   node scripts/benchmark-hotspots.js
   ```

2. **Run full profiling suite:**
   ```bash
   node scripts/profile-load-test.js both
   ```

3. **Analyze CPU profile:**
   ```bash
   cat profiling-output/cpu-profile.txt | less
   ```
   Look for functions with high tick counts and self-time percentages.

4. **Analyze heap profile:**
   - Open Chrome DevTools
   - Go to Memory tab
   - Click "Load" button
   - Select `profiling-output/heap-profile.heapprofile`
   - Analyze allocation patterns and memory growth

5. **Make optimizations** based on profiling data

6. **Re-run benchmarks** to validate improvements

## Interpreting Results

### CPU Profile

Key metrics to look for:
- **Self Time %** - Time spent in the function itself (excluding callees)
- **Total Time %** - Time including all function calls
- **Ticks** - Number of samples captured in the function

High self-time indicates CPU-intensive operations that are good optimization targets.

### Heap Profile

Key metrics to look for:
- **Shallow Size** - Memory directly held by objects
- **Retained Size** - Total memory kept alive by references
- **Allocation Count** - Number of allocations (high count = GC pressure)

Look for:
- Objects with large retained sizes
- High allocation rates in hot paths
- Memory leaks (objects not being collected)

### Micro-benchmarks

Key metrics:
- **Mean** - Average execution time (primary metric)
- **p95/p99** - Tail latency (important for SLA guarantees)
- **Min/Max** - Range (large spread indicates variance/jitter)

## Common Optimization Patterns

Based on Sprint 9 profiling work:

1. **Replace Array.includes() with Set.has()** - O(n) → O(1)
2. **Memoize expensive operations** - Cache validation results
3. **Pre-compile regex patterns** - Don't recompile on every call
4. **Object pooling** - Reuse objects instead of allocating new ones
5. **Pre-compute constants** - Move calculations out of hot paths
6. **Early returns** - Skip work when possible
7. **Batch operations** - Amortize overhead across multiple items

## See Also

- [core/SPRINT9_PERFORMANCE.md](../core/SPRINT9_PERFORMANCE.md) - Complete optimization documentation
- [test/gateway/pipeline-load.test.js](../test/gateway/pipeline-load.test.js) - Load test suite
