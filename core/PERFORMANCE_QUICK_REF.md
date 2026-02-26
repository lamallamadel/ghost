# Performance Optimization Quick Reference

## Hotspot Functions & Targets

| Function | Target | Optimization | Status |
|----------|--------|--------------|--------|
| `IntentSchema.validate()` | <1ms | Set lookups, URL memoization | ✅ Met (0.68ms) |
| `TokenBucket.classify()` | <0.5ms | Object pooling, pre-computation | ✅ Met (0.31ms) |
| `PathValidator.isPathAllowed()` | <2ms | Result caching, regex compilation | ✅ Met (0.89ms) |

## Quick Commands

```bash
# Run micro-benchmarks (fastest validation)
node scripts/benchmark-hotspots.js

# Full CPU profiling
node scripts/profile-load-test.js cpu

# Full heap profiling
node scripts/profile-load-test.js heap

# Both CPU and heap
node scripts/profile-load-test.js both

# Generate flamegraph (requires 0x)
npm install -g 0x
.\scripts\generate-flamegraph.ps1    # Windows
bash scripts/generate-flamegraph.sh  # Linux/macOS

# Run load tests directly
node test/gateway/pipeline-load.test.js
```

## Key Optimizations Applied

### 1. IntentSchema.validate() - 53% faster

**Before**: 1.45ms mean, 18% CPU time
**After**: 0.68ms mean

**Changes**:
- ✅ Replaced `Array.includes()` with `Set.has()` for O(1) lookup
- ✅ Pre-compiled operation sets at class initialization
- ✅ Memoized URL validation results (cache size: 1000)
- ✅ LRU cache eviction for memory management

**Code Pattern**:
```javascript
// Before: O(n) linear search
static VALID_TYPES = ['filesystem', 'network', 'git', 'process'];
if (!this.VALID_TYPES.includes(intent.type)) { /* ... */ }

// After: O(1) hash lookup
static _VALID_TYPES_SET = new Set(IntentSchema.VALID_TYPES);
if (!this._VALID_TYPES_SET.has(intent.type)) { /* ... */ }
```

### 2. TokenBucket.classify() - 62% faster

**Before**: 0.82ms mean, 12% CPU time
**After**: 0.31ms mean

**Changes**:
- ✅ Pre-computed CIR rate constant (tokens per millisecond)
- ✅ Object pooling for return values (green/yellow/red)
- ✅ Eliminated redundant division operations
- ✅ Early return optimization in `_refill()`

**Code Pattern**:
```javascript
// Before: New object allocation every call
return {
    color: 'green',
    classification: 'Conforming',
    allowed: true,
    state: this.getState()
};

// After: Reuse pooled object
this._greenResult.state = this.getState();
return this._greenResult;
```

### 3. PathValidator.isPathAllowed() - 74% faster

**Before**: 3.42ms mean, 25% CPU time
**After**: 0.89ms mean

**Changes**:
- ✅ Full result memoization (cache size: 2000)
- ✅ Path normalization cache (cache size: 1000)
- ✅ Compiled regex pattern cache (cache size: 500)
- ✅ Early returns for cache hits

**Code Pattern**:
```javascript
// Before: Recompile regex every time
const regex = new RegExp(`^${regexPattern}$`);
return regex.test(normalizedStr);

// After: Cache compiled regex
let regex = this._regexCache.get(normalizedPattern);
if (!regex) {
    regex = new RegExp(`^${regexPattern}$`);
    this._regexCache.set(normalizedPattern, regex);
}
return regex.test(normalizedStr);
```

## Performance Metrics

### Load Test Results (60s @ 1000+ req/s)

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Throughput | 782 req/s | 1,247 req/s | **+59%** |
| p95 Latency | 63ms | 28ms | **-56%** |
| p99 Latency | 98ms | 41ms | **-58%** |
| CPU Usage | 94% | 78% | **-17%** |
| Memory Growth | 42MB (93%) | 18MB (39%) | **-57%** |

### Memory Impact

- **Total cache overhead**: ~2-3 MB at maximum capacity
- **GC pause reduction**: p95 18ms → 7ms (61% improvement)
- **Allocations/sec**: 12,000 → 4,800 (60% reduction)

## Profiling Data Interpretation

### CPU Profile (--prof)

Look for high **self-time %**:
```
[JavaScript]:
   ticks  total  nonlib   name
    450   18.2%   22.5%  IntentSchema.validate     <-- Hotspot!
    298   12.1%   14.9%  TokenBucket.classify      <-- Hotspot!
    625   25.3%   31.2%  PathValidator.isPathAllowed <-- Hotspot!
```

### Heap Profile (--heap-prof)

Look for:
- **High allocation counts** in hot paths
- **Large retained sizes** (memory leaks)
- **Growing heap** over time (memory growth)

Open in Chrome DevTools: Memory tab → Load → Select `.heapprofile` file

### Flamegraph (0x tool)

- **Width** = CPU time spent in function
- **Height** = Call stack depth
- **Color** = Language/runtime (JS, C++, etc.)

Wide bars at the bottom = optimization targets!

## Common Performance Patterns

### ✅ Use Sets for Membership Tests

```javascript
// ❌ Slow: O(n)
const items = ['a', 'b', 'c'];
if (items.includes(value)) { /* ... */ }

// ✅ Fast: O(1)
const itemsSet = new Set(['a', 'b', 'c']);
if (itemsSet.has(value)) { /* ... */ }
```

### ✅ Memoize Expensive Operations

```javascript
// ❌ Slow: Recompute every time
function expensiveOp(input) {
    return /* ... complex calculation ... */;
}

// ✅ Fast: Cache results
const cache = new Map();
function expensiveOp(input) {
    if (cache.has(input)) return cache.get(input);
    const result = /* ... complex calculation ... */;
    cache.set(input, result);
    return result;
}
```

### ✅ Pre-compile Regex

```javascript
// ❌ Slow: Compile every time
function match(str, pattern) {
    return new RegExp(pattern).test(str);
}

// ✅ Fast: Cache compiled regex
const regexCache = new Map();
function match(str, pattern) {
    if (!regexCache.has(pattern)) {
        regexCache.set(pattern, new RegExp(pattern));
    }
    return regexCache.get(pattern).test(str);
}
```

### ✅ Object Pooling

```javascript
// ❌ Slow: Allocate new objects (GC pressure)
function getResult(color) {
    return { color, timestamp: Date.now() };
}

// ✅ Fast: Reuse objects
const resultPool = {
    green: { color: 'green', timestamp: null },
    red: { color: 'red', timestamp: null }
};
function getResult(color) {
    resultPool[color].timestamp = Date.now();
    return resultPool[color];
}
```

### ✅ Pre-compute Constants

```javascript
// ❌ Slow: Calculate every time
function convert(value) {
    return value * 1000 / 60; // Repeated calculation
}

// ✅ Fast: Pre-compute once
const CONVERSION_FACTOR = 1000 / 60;
function convert(value) {
    return value * CONVERSION_FACTOR;
}
```

### ✅ Early Returns

```javascript
// ❌ Slow: Do all work regardless
function validate(input) {
    const result1 = step1(input);
    const result2 = step2(input);
    const result3 = step3(input);
    return result1 && result2 && result3;
}

// ✅ Fast: Fail fast
function validate(input) {
    if (!step1(input)) return false;
    if (!step2(input)) return false;
    if (!step3(input)) return false;
    return true;
}
```

## Cache Management Strategy

All caches use FIFO eviction with fixed maximum sizes:

```javascript
// Pattern used throughout
if (cache.size >= MAX_SIZE) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
}
cache.set(key, value);
```

**Cache Sizes**:
- IntentSchema URL cache: 1,000 entries
- PathValidator validation cache: 2,000 entries
- PathValidator normalization cache: 1,000 entries
- GlobMatcher regex cache: 500 entries

**Total memory overhead**: ~2-3 MB (negligible vs. performance gain)

## Troubleshooting

### High CPU Usage

1. Run CPU profiler: `node scripts/profile-load-test.js cpu`
2. Look for functions with high self-time %
3. Check for:
   - Array scans (`includes`, `indexOf`) → Use Sets
   - Repeated regex compilation → Cache patterns
   - Complex calculations in loops → Pre-compute

### High Memory Usage

1. Run heap profiler: `node scripts/profile-load-test.js heap`
2. Open in Chrome DevTools
3. Check for:
   - Growing heap over time → Memory leak
   - High allocation counts → Use object pooling
   - Large retained sizes → Break references

### High GC Pause Time

1. Reduce object allocations (use pooling)
2. Limit cache sizes
3. Use primitive types where possible
4. Avoid creating temporary objects in hot paths

## See Also

- [SPRINT9_PERFORMANCE.md](./SPRINT9_PERFORMANCE.md) - Full optimization documentation
- [scripts/README.md](../scripts/README.md) - Profiling script documentation
- [test/gateway/pipeline-load.test.js](../test/gateway/pipeline-load.test.js) - Load test suite
