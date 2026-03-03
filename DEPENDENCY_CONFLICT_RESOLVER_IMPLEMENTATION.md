# Extension Dependency Version Conflict Resolver - Implementation

## Overview

The Extension Dependency Version Conflict Resolver is a comprehensive system for detecting, analyzing, and resolving version conflicts between extension dependencies in the Ghost CLI ecosystem. It implements npm-style peer dependency resolution with deduplication algorithms and provides actionable resolution strategies with impact analysis.

## Features Implemented

### 1. Version Conflict Detection (`detectVersionConflicts()`)

Detects when multiple extensions require incompatible semver ranges of the same dependency.

**Example:**
```
ext-A requires sdk@^1.0.0  (allows 1.x.x)
ext-B requires sdk@^2.0.0  (allows 2.x.x)
→ Conflict: No version satisfies both requirements
```

**Implementation Details:**
- Collects all dependency requirements across extensions
- Analyzes semver range compatibility using `_rangesOverlap()`
- Identifies incompatible pairs and unsatisfied requirements
- Returns detailed conflict reports with extension and constraint information

### 2. Topological Sort with Deduplication (`topologicalSort()`)

Orders extensions based on dependencies ensuring dependencies load before dependents.

**Algorithm:** Kahn's algorithm with in-degree tracking
- Handles both `dependencies` and `extensionDependencies`
- Detects circular dependencies during sort
- Ensures correct load order for extension initialization

### 3. Best Version Resolution (`findBestVersion()`)

Implements npm-style peer dependency resolution algorithm.

**Strategy:**
- Sort available versions in descending order (prefer latest)
- Find highest version satisfying all constraints
- Uses semver constraint evaluation for each requirement
- Returns `null` if no satisfying version exists

**Example:**
```javascript
constraints = ['^1.0.0', '~1.2.0', '>=1.1.0']
availableVersions = ['1.0.0', '1.1.0', '1.2.0', '1.2.5', '2.0.0']
result = '1.2.5'  // Highest version satisfying all constraints
```

### 4. Conflict Resolution (`resolveConflicts()`)

Generates multiple resolution strategies with impact analysis for each conflict.

**Three Resolution Strategies:**

#### Strategy 1: Common Version
Find a single version that satisfies all requirements.

```
Strategy: common-version
Resolution: Install version 1.5.0
Impact:
  - Upgrades: ext-a, ext-c
  - Downgrades: none
  - Unaffected: ext-d
Recommendation: Install version 1.5.0 (satisfies all requirements)
```

#### Strategy 2: Favor Extension
Install version preferred by specific extension (shows breaking changes).

```
Strategy: favor-extension
Favoring: ext-a
Resolution: Install version 1.0.0
Impact:
  - Breaking: ext-b (requires ^2.0.0, would get 1.0.0)
  - Satisfied: ext-a
Recommendation: Install version 1.0.0 for ext-a (breaks 1 extension)
```

#### Strategy 3: Duplicate Versions
Install multiple versions side-by-side (peer dependency pattern).

```
Strategy: duplicate
Resolution: multiple-versions
Impact:
  - Installations:
    • ext-a → 1.0.0
    • ext-b → 2.0.0
  - Disk space: increased
  - Complexity: high
Recommendation: Install separate versions for each extension
```

### 5. Comprehensive Diagnosis (`diagnoseConflicts()`)

Static method that runs full dependency health check.

**Analyzes:**
- Version conflicts
- Version constraint violations
- Circular dependencies
- Capability conflicts
- Resolution strategies
- Dependency trees
- Actionable recommendations

**Returns:**
```javascript
{
  healthy: false,
  versionConflicts: [...],
  versionIssues: [...],
  circularDependencies: [...],
  capabilityConflicts: [...],
  resolutionStrategies: [...],
  summary: {
    totalConflicts: 2,
    resolvableConflicts: 1,
    requiresManualIntervention: 1,
    affectedExtensions: 3
  },
  dependencyTrees: [...],
  recommendations: [...],
  graph: {...}
}
```

### 6. Ghost Extension Doctor Command

New CLI command for interactive dependency diagnosis.

**Usage:**
```bash
# Basic diagnosis
ghost extension doctor

# Show full dependency trees
ghost extension doctor --tree

# Export report as JSON
ghost extension doctor --json

# Provide available versions for resolution testing
ghost extension doctor --versions '{"sdk":["1.0.0","1.5.0","2.0.0"]}'
```

**Output Sections:**
1. Health Status (✓ or ✗)
2. Summary Statistics
3. Version Conflicts (with requirements and incompatible pairs)
4. Version Issues (missing or mismatched)
5. Circular Dependencies (with cycle paths)
6. Capability Conflicts (with resolution strategy)
7. Resolution Strategies (with impact analysis)
8. Dependency Trees (with --tree flag)
9. Recommendations (by severity: critical, high, medium, low)

## Architecture

### Core Components

```
core/dependency-resolver.js
├── DependencyResolver (class)
│   ├── detectVersionConflicts()       # Conflict detection
│   ├── findBestVersion()              # npm-style resolution
│   ├── resolveConflicts()             # Strategy generation
│   ├── topologicalSort()              # Load order
│   ├── diagnoseConflicts() [static]   # Full analysis
│   └── _generateRecommendations()     # Fix suggestions
│
ghost.js
├── handleExtensionCommand()
│   └── 'doctor' subcommand
│       └── _handleExtensionDoctorCommand()
│           ├── Collect manifests from Gateway
│           ├── Call DependencyResolver.diagnoseConflicts()
│           └── Format and display report
```

### Data Flow

```
1. User runs: ghost extension doctor
                    ↓
2. GatewayLauncher._handleExtensionDoctorCommand()
   - Collects extension manifests from Gateway
                    ↓
3. DependencyResolver.diagnoseConflicts(manifests)
   - Builds dependency graph
   - Detects conflicts (version, circular, capability)
   - Generates resolution strategies
   - Creates recommendations
                    ↓
4. Format and display report
   - Health status
   - Conflict details
   - Resolution strategies with impact
   - Actionable recommendations
```

## Semver Range Analysis

### Range Overlap Detection (`_rangesOverlap()`)

Determines if two version ranges have any common version.

**Supported Ranges:**
- Exact: `1.2.3`
- Caret: `^1.2.3` → `[1.2.3, 2.0.0)`
- Tilde: `~1.2.3` → `[1.2.3, 1.3.0)`
- Greater: `>1.2.3`, `>=1.2.3`
- Less: `<2.0.0`, `<=2.0.0`
- Wildcard: `*`

**Algorithm:**
```javascript
// Parse ranges into bounds
range1 = ^1.2.0 → [1.2.0, 2.0.0)
range2 = ~1.5.0 → [1.5.0, 1.6.0)

// Check overlap: [min1, max1] ∩ [min2, max2]
overlap = (min1 <= max2) && (min2 <= max1)
        = (1.2.0 <= 1.6.0) && (1.5.0 <= 2.0.0)
        = true
```

### Range Bounds Parsing (`_parseRangeBounds()`)

Converts semver range to min/max version bounds.

**Examples:**
```javascript
^1.2.3  → { min: '1.2.3', max: '2.0.0', minInclusive: true, maxInclusive: false }
~1.2.3  → { min: '1.2.3', max: '1.3.0', minInclusive: true, maxInclusive: false }
>=1.2.3 → { min: '1.2.3', max: '999.999.999', minInclusive: true, maxInclusive: true }
<2.0.0  → { min: '0.0.0', max: '2.0.0', minInclusive: true, maxInclusive: false }
```

## Impact Analysis

Each resolution strategy includes comprehensive impact analysis:

### Breaking Changes
Extensions that would fail to load under the strategy:
```javascript
{
  extension: 'ext-b',
  required: '^2.0.0',
  actual: '1.5.0',
  reason: 'Version 1.5.0 does not satisfy ^2.0.0'
}
```

### Version Changes
Extensions affected by version upgrade/downgrade:
```javascript
{
  upgrades: ['ext-a', 'ext-c'],      // Would be upgraded
  downgrades: ['ext-d'],              // Would be downgraded
  unaffected: ['ext-e']               // Already compatible
}
```

### Installation Complexity
For duplicate strategy:
```javascript
{
  installations: [
    { extension: 'ext-a', version: '1.0.0' },
    { extension: 'ext-b', version: '2.0.0' }
  ],
  diskSpace: 'increased',
  complexity: 'high'
}
```

## Recommendations System

Generates actionable fix recommendations with severity levels.

### Recommendation Types

**1. Version Conflicts (severity: high/critical)**
```javascript
{
  severity: 'high',
  type: 'version-conflict',
  dependency: 'sdk',
  action: 'upgrade',
  target: '2.0.0',
  command: 'npm install sdk@2.0.0',
  reason: 'Resolves conflict between 2 extensions',
  affected: ['ext-a', 'ext-b']
}
```

**2. Missing Dependencies (severity: critical)**
```javascript
{
  severity: 'critical',
  type: 'missing-dependency',
  dependency: 'helper-lib',
  action: 'install',
  target: '^1.0.0',
  command: 'npm install helper-lib@^1.0.0',
  reason: 'Required by ext-a',
  affected: ['ext-a']
}
```

**3. Version Mismatches (severity: high)**
```javascript
{
  severity: 'high',
  type: 'version-mismatch',
  dependency: 'utils',
  action: 'upgrade',
  target: '^2.0.0',
  current: '1.5.0',
  command: 'npm install utils@^2.0.0',
  reason: 'Version mismatch: requires ^2.0.0, found 1.5.0',
  affected: ['ext-c']
}
```

**4. Circular Dependencies (severity: critical)**
```javascript
{
  severity: 'critical',
  type: 'circular-dependency',
  action: 'refactor',
  cycle: ['ext-a', 'ext-b', 'ext-c', 'ext-a'],
  reason: 'Circular dependencies prevent proper initialization',
  suggestion: 'Refactor to remove circular dependencies or use lazy loading'
}
```

**5. Capability Conflicts (severity: medium)**
```javascript
{
  severity: 'medium',
  type: 'capability-conflict',
  capability: 'command:deploy',
  action: 'review-load-order',
  winner: 'ext-deploy',
  affected: ['ext-deploy', 'ext-cd'],
  reason: 'Multiple extensions claim capability "command:deploy"',
  suggestion: 'Review extension load order or remove conflicting extension'
}
```

## Dependency Tree Visualization

Generates ASCII tree representation of dependencies:

```
Extension Dependency Trees:

ext-a@1.0.0
  shared-lib@1.5.0
    utils@2.0.0
  helper-lib@1.2.0

ext-b@2.0.0
  shared-lib@1.5.0
    utils@2.0.0
  another-dep@3.0.0
```

## Integration with Gateway

The doctor command integrates seamlessly with the existing Gateway architecture:

1. **No Business Logic**: `_handleExtensionDoctorCommand()` only orchestrates
2. **Pure Delegation**: Calls `DependencyResolver.diagnoseConflicts()`
3. **Format & Display**: Formats report for console output
4. **JSON Support**: Supports `--json` flag for programmatic use

## Testing

### Manual Test Example

Create test extensions with conflicting dependencies:

**ext-a/manifest.json:**
```json
{
  "id": "ext-a",
  "version": "1.0.0",
  "dependencies": {
    "sdk": "^1.0.0"
  }
}
```

**ext-b/manifest.json:**
```json
{
  "id": "ext-b",
  "version": "1.0.0",
  "dependencies": {
    "sdk": "^2.0.0"
  }
}
```

**Run diagnosis:**
```bash
ghost extension doctor
```

**Expected output:**
```
✗ Dependency issues detected

Summary:
  Total conflicts: 1
  Resolvable: 0
  Requires manual intervention: 1
  Affected extensions: 2

Version Conflicts (1):
  sdk (installed: 1.5.0)
    ✗ ext-a requires ^1.0.0
    ✗ ext-b requires ^2.0.0
    ⚠ Incompatible requirements:
      ext-a (^1.0.0) ↔ ext-b (^2.0.0)

Resolution Strategies:
  sdk - favor-extension
    Favor: ext-a with version 1.9.9
    ✗ Breaking:
      ext-b: requires ^2.0.0, would get 1.9.9
    Recommendation: Install version 1.9.9 for ext-a (breaks 1 extension)

  sdk - favor-extension
    Favor: ext-b with version 2.1.0
    ✗ Breaking:
      ext-a: requires ^1.0.0, would get 2.1.0
    Recommendation: Install version 2.1.0 for ext-b (breaks 1 extension)

  sdk - duplicate
    ⚠ Install multiple versions
      ext-a → 1.9.9
      ext-b → 2.1.0
    Recommendation: Install separate versions (increases complexity)

Recommendations:

  CRITICAL (1):
    manual-resolution: No common version satisfies all requirements
      Affected: ext-a, ext-b
```

### Programmatic Test

```javascript
const DependencyResolver = require('./core/dependency-resolver');

const manifests = new Map([
  ['ext-a', {
    manifest: {
      id: 'ext-a',
      version: '1.0.0',
      dependencies: { 'sdk': '^1.0.0' }
    }
  }],
  ['ext-b', {
    manifest: {
      id: 'ext-b',
      version: '1.0.0',
      dependencies: { 'sdk': '^2.0.0' }
    }
  }]
]);

const report = DependencyResolver.diagnoseConflicts(manifests, {
  availableVersions: {
    'sdk': ['1.0.0', '1.5.0', '1.9.9', '2.0.0', '2.1.0']
  }
});

console.log('Healthy:', report.healthy);
console.log('Conflicts:', report.versionConflicts.length);
console.log('Strategies:', report.resolutionStrategies.length);
```

## Command Reference

```bash
# Basic diagnosis
ghost extension doctor

# Show full dependency trees
ghost extension doctor --tree

# Export as JSON
ghost extension doctor --json

# Provide version map for resolution
ghost extension doctor --versions '{"sdk":["1.0.0","2.0.0"]}'

# Combine flags
ghost extension doctor --tree --json > report.json
```

## Extension Manifest Support

The resolver supports multiple dependency types in manifests:

```json
{
  "id": "my-extension",
  "version": "1.0.0",
  "dependencies": {
    "npm-package": "^1.0.0"
  },
  "extensionDependencies": {
    "other-extension": "^2.0.0"
  },
  "peerDependencies": {
    "peer-dep": ">=1.0.0"
  }
}
```

All three types are analyzed for conflicts.

## Performance Considerations

- **O(E + V)** complexity for topological sort
- **O(E²)** for pairwise conflict detection
- **O(V * S)** for resolution strategy generation (V = extensions, S = strategies)
- Efficient semver range parsing and comparison
- Lazy evaluation of dependency trees (only with --tree flag)

## Future Enhancements

Potential improvements:
1. Automatic conflict resolution with user confirmation
2. Integration with npm registry for version availability checks
3. Conflict resolution history tracking
4. Extension compatibility database
5. Automated migration scripts for breaking changes
6. Dependency update suggestions based on security advisories
7. Visual dependency graph generation (DOT format export)
8. Batch resolution for multiple conflicts

## Summary

The Extension Dependency Version Conflict Resolver provides:
- ✅ Version conflict detection (`detectVersionConflicts()`)
- ✅ npm-style resolution algorithm (`findBestVersion()`)
- ✅ Topological sort with deduplication (`topologicalSort()`)
- ✅ Multiple resolution strategies with impact analysis (`resolveConflicts()`)
- ✅ Comprehensive diagnosis report (`diagnoseConflicts()`)
- ✅ CLI command (`ghost extension doctor`)
- ✅ Dependency tree visualization
- ✅ Actionable recommendations with severity levels
- ✅ JSON export support
- ✅ Full integration with Ghost Gateway architecture

All functionality is implemented and ready for use.
