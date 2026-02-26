# Ghost CLI - Performance Optimization Guide

## Quick Start

### Validate Performance

```bash
# Quick check (30 seconds)
node scripts/benchmark-hotspots.js
```

**Expected Output:**
```
✅ IntentSchema.validate()  - Mean: 0.68ms  Target: <1ms   ✅
✅ TokenBucket.classify()   - Mean: 0.31ms  Target: <0.5ms ✅
✅ PathValidator.isPathAllowed() - Mean: 0.89ms  Target: <2ms   ✅
```

### Run Load Tests

```bash
# Full load test suite (5 minutes)
node test/gateway/pipeline-load.test.js
```

**Expected Results:**
- Throughput: >1000 req/s
- p95 Latency: <50ms
- Memory Growth: <50% over 60s

## Current Performance (Sprint 9)

### Throughput & Latency

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Throughput | 1,247 req/s | 1000+ req/s | ✅ +24% |
| p95 Latency | 28ms | <50ms | ✅ -44% |
| p99 Latency | 41ms | <100ms | ✅ -59% |

### Resource Utilization

| Metric | Value | Notes |
|--------|-------|-------|
| CPU Usage | 78% | Down from 94% |
| Memory Growth | 39% | Down from 93% |
| GC Pause (p95) | 7ms | Down from 18ms |

### Hotspot Functions

| Function | Mean Time | Target | Status |
|----------|-----------|--------|--------|
| `IntentSchema.validate()` | 0.68ms | <1ms | ✅ 53% faster |
| `TokenBucket.classify()` | 0.31ms | <0.5ms | ✅ 62% faster |
| `PathValidator.isPathAllowed()` | 0.89ms | <2ms | ✅ 74% faster |

## Optimization Techniques

### 1. Set-based Lookups (O(1) vs O(n))

**Impact**: 53% faster validation

```javascript
// Before: O(n) linear search
if (VALID_TYPES.includes(type)) { }

// After: O(1) hash lookup
if (VALID_TYPES_SET.has(type)) { }
```

### 2. Memoization

**Impact**: >95% cache hit rate

```javascript
// Cache expensive operations
const cache = new Map();
if (cache.has(key)) return cache.get(key);

const result = expensiveOperation(key);
cache.set(key, result);
return result;
```

### 3. Object Pooling

**Impact**: 60% fewer allocations

```javascript
// Reuse objects instead of creating new ones
this._resultPool = { green: { color: 'green', state: null } };
this._resultPool.green.state = newState;
return this._resultPool.green;
```

### 4. Regex Compilation Caching

**Impact**: Eliminates compilation overhead

```javascript
// Cache compiled regex patterns
const regexCache = new Map();
let regex = regexCache.get(pattern);
if (!regex) {
    regex = new RegExp(pattern);
    regexCache.set(pattern, regex);
}
```

### 5. Pre-computation

**Impact**: Faster calculations in hot paths

```javascript
// Pre-compute constants at initialization
this._rateConstant = cir / 60000; // Once
// Use in hot path
const tokens = elapsed * this._rateConstant; // No division
```

## Profiling Tools

### Quick Benchmarks

```bash
node scripts/benchmark-hotspots.js
```

Measures performance of the three hotspot functions with statistical analysis.

### CPU Profiling

```bash
node scripts/profile-load-test.js cpu
```

Generates V8 CPU profile showing where time is spent.

**Output**: `profiling-output/cpu-profile.txt`

### Heap Profiling

```bash
node scripts/profile-load-test.js heap
```

Generates heap allocation profile for memory analysis.

**Output**: `profiling-output/heap-profile.heapprofile` (open in Chrome DevTools)

### Flamegraphs

```bash
# Linux/macOS
bash scripts/generate-flamegraph.sh

# Windows
.\scripts\generate-flamegraph.ps1
```

Visual CPU profile with interactive exploration.

### Compare Before/After

```bash
# Before
node scripts/benchmark-hotspots.js
cp profiling-output/benchmark-results.json profiling-output/before.json

# After changes...
node scripts/benchmark-hotspots.js

# Compare
node scripts/compare-benchmarks.js \
    profiling-output/before.json \
    profiling-output/benchmark-results.json
```

## Cache Configuration

All caches use FIFO eviction with fixed sizes:

| Cache | Max Size | Purpose | Memory |
|-------|----------|---------|--------|
| URL Validation | 1,000 | IntentSchema | ~0.5 MB |
| Path Validation | 2,000 | PathValidator | ~1.0 MB |
| Path Normalization | 1,000 | PathValidator | ~0.5 MB |
| Regex Patterns | 500 | GlobMatcher | ~0.5 MB |
| **Total** | - | - | **~2.5 MB** |

Memory overhead is negligible compared to the 59% throughput gain.

## Architecture

### Pipeline Flow

```
Request → Intercept → Auth → Audit → Execute → Response
            ↓           ↓       ↓        ↓
       IntentSchema  TokenBucket  PathValidator
         (0.68ms)     (0.31ms)     (0.89ms)
```

### Optimized Components

1. **IntentSchema** (`core/pipeline/intercept.js`)
   - Validates intent structure and parameters
   - Uses Set-based lookups
   - Caches URL validation results

2. **TokenBucket** (`core/qos/token-bucket.js`)
   - Implements srTCM rate limiting
   - Uses object pooling
   - Pre-computes rate constants

3. **PathValidator** (`core/validators/path-validator.js`)
   - Validates filesystem paths
   - Caches validation results
   - Caches compiled regex patterns

## Documentation

### Primary Documents

- **[SPRINT9_PERFORMANCE.md](core/SPRINT9_PERFORMANCE.md)** - Complete technical documentation
- **[PERFORMANCE_QUICK_REF.md](core/PERFORMANCE_QUICK_REF.md)** - Quick reference guide
- **[PERFORMANCE_INDEX.md](core/PERFORMANCE_INDEX.md)** - Documentation index
- **[SPRINT9_OPTIMIZATION_SUMMARY.md](SPRINT9_OPTIMIZATION_SUMMARY.md)** - Executive summary

### Supporting Documents

- **[scripts/README.md](scripts/README.md)** - Profiling scripts documentation
- **[profiling-output/README.md](profiling-output/README.md)** - Output interpretation
- **[SPRINT9_CHECKLIST.md](SPRINT9_CHECKLIST.md)** - Completion checklist

## Troubleshooting

### High CPU Usage

1. Run CPU profiler
2. Look for functions with high self-time %
3. Apply optimizations:
   - Replace Array scans with Sets
   - Cache repeated operations
   - Pre-compute constants

### High Memory Usage

1. Run heap profiler
2. Check for:
   - Growing heap (memory leak)
   - High allocation counts (use pooling)
   - Large retained sizes
3. Verify cache sizes are reasonable

### Slow Performance

1. Run micro-benchmarks: `node scripts/benchmark-hotspots.js`
2. Compare with targets (1ms, 0.5ms, 2ms)
3. Run load tests: `node test/gateway/pipeline-load.test.js`
4. Check for regressions

## Best Practices

### ✅ Do

- Measure before optimizing
- Use appropriate data structures (Set vs Array)
- Cache expensive operations with high hit rates
- Pool objects in hot paths
- Pre-compute constants

### ❌ Don't

- Optimize without profiling first
- Create large caches without eviction
- Allocate objects in tight loops
- Perform expensive operations in hot paths
- Assume - always measure

## Performance History

### Sprint 9 Baseline (Before)

- Throughput: 782 req/s
- p95 Latency: 63ms
- CPU: 94%

### Sprint 9 Optimized (After)

- Throughput: 1,247 req/s (+59%)
- p95 Latency: 28ms (-56%)
- CPU: 78% (-17%)

**All targets exceeded** ✅

## Future Optimizations

1. **Worker Threads** - Parallel validation
2. **Native Addons** - N-API for hot paths
3. **Batch Processing** - Amortize overhead
4. **JIT Monitoring** - Track V8 optimization
5. **Stream Processing** - Reduce memory footprint

## See Also

- [Load Tests](test/gateway/pipeline-load.test.js) - Test suite
- [Architecture](core/ARCHITECTURE.md) - System design
- [QoS Documentation](core/qos/) - Rate limiting details

---

**Status**: ✅ All performance targets met and exceeded

**Last Updated**: Sprint 9 - December 2024
