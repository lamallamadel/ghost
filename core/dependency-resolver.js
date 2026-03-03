/**
 * DependencyResolver - Extension Dependency Resolution with Version Conflict Detection
 * 
 * RESPONSIBILITY: 
 * - Build dependency graphs from extension manifests
 * - Perform topological sort to determine load order
 * - Detect circular dependencies with full chain visualization
 * - Validate version constraints using semver
 * - Detect capability conflicts across extensions
 * - Detect version conflicts when multiple extensions require incompatible semver ranges
 * - Implement npm-style peer dependency resolution with deduplication
 * - Generate conflict resolution reports with impact analysis
 * - Provide dependency tree visualization and fix recommendations
 * 
 * ALGORITHMS:
 * - Topological Sort: Kahn's algorithm with DFS for cycle detection
 * - Version Matching: Semver constraint evaluation (^, ~, >, <, =, ranges)
 * - Circular Detection: Tarjan's strongly connected components
 * - Conflict Detection: Capability overlap analysis + version range incompatibility
 * - Version Resolution: npm-style peer dependency resolution with findBestVersion
 * 
 * USAGE:
 * 
 * Command line:
 *   ghost extension doctor                    Run dependency diagnosis
 *   ghost extension doctor --tree             Show full dependency trees
 *   ghost extension doctor --json             Export report as JSON
 *   ghost extension doctor --versions '{...}' Provide available versions for resolution
 * 
 * Programmatic:
 *   const DependencyResolver = require('./core/dependency-resolver');
 *   const report = DependencyResolver.diagnoseConflicts(manifests, options);
 * 
 * CONFLICT DETECTION:
 * 
 * The resolver detects when multiple extensions require incompatible semver ranges:
 *   ext-A requires sdk@^1.0.0 (allows 1.x.x)
 *   ext-B requires sdk@^2.0.0 (allows 2.x.x)
 *   → Conflict: no version satisfies both
 * 
 * RESOLUTION STRATEGIES:
 * 
 * 1. common-version: Find a single version that satisfies all requirements
 *    - Uses findBestVersion() to select highest compatible version
 *    - Impact analysis shows which extensions upgrade/downgrade
 * 
 * 2. favor-extension: Install version for specific extension
 *    - Shows which other extensions would break
 *    - Provides impact analysis for each choice
 * 
 * 3. duplicate: Install multiple versions (npm peer dependency style)
 *    - Each extension gets its required version
 *    - Increases disk space and complexity
 * 
 * IMPACT ANALYSIS:
 * 
 * Each strategy includes:
 *   - breaking: Extensions that would fail to load
 *   - upgrades: Extensions that would be upgraded
 *   - downgrades: Extensions that would be downgraded
 *   - satisfied: Extensions that remain compatible
 * 
 * RECOMMENDATIONS:
 * 
 * Generated recommendations include:
 *   - Severity level (critical, high, medium, low)
 *   - Action type (install, upgrade, downgrade, refactor, review-load-order)
 *   - Command to execute (e.g., "npm install sdk@2.0.0")
 *   - Affected extensions
 *   - Reason and suggestion
 */

class DependencyResolver {
    constructor() {
        this.graph = new Map();
        this.versionConflicts = [];
        this.resolutionStrategies = [];
    }

    /**
     * Build dependency graph from extension manifests
     * 
     * @param {Map<string, Object>} manifests - Map of extension ID to manifest data
     * @returns {Map<string, Object>} Dependency graph with nodes and edges
     */
    buildDependencyGraph(manifests) {
        const graph = new Map();

        // Initialize nodes
        for (const [extId, extData] of manifests) {
            graph.set(extId, {
                id: extId,
                version: extData.manifest.version,
                dependencies: extData.manifest.dependencies || {},
                extensionDependencies: extData.manifest.extensionDependencies || {},
                peerDependencies: extData.manifest.peerDependencies || {},
                dependents: new Set(),
                capabilities: extData.manifest.capabilities
            });
        }

        // Build edges
        for (const [extId, node] of graph) {
            // Handle both npm-style dependencies and extension dependencies
            const allDeps = { 
                ...node.dependencies, 
                ...node.extensionDependencies 
            };
            
            for (const depId of Object.keys(allDeps)) {
                if (graph.has(depId)) {
                    graph.get(depId).dependents.add(extId);
                }
            }
        }

        this.graph = graph;
        return graph;
    }

    /**
     * Detect version conflicts when multiple extensions require incompatible semver ranges
     * Returns detailed conflict information for diagnosis
     * 
     * @param {Map<string, Object>} manifests - Map of extension manifests
     * @returns {Array<Object>} Array of version conflicts with extension details
     */
    detectVersionConflicts(manifests) {
        const conflicts = [];
        const dependencyRequirements = new Map(); // depId -> [{extensionId, constraint}]

        // Collect all dependency requirements across extensions
        for (const [extId, extData] of manifests) {
            const manifest = extData.manifest;
            const allDeps = {
                ...(manifest.dependencies || {}),
                ...(manifest.extensionDependencies || {}),
                ...(manifest.peerDependencies || {})
            };

            for (const [depId, constraint] of Object.entries(allDeps)) {
                if (!dependencyRequirements.has(depId)) {
                    dependencyRequirements.set(depId, []);
                }
                dependencyRequirements.get(depId).push({
                    extensionId: extId,
                    constraint: constraint,
                    version: manifest.version
                });
            }
        }

        // Check for incompatible version ranges
        for (const [depId, requirements] of dependencyRequirements) {
            if (requirements.length < 2) continue;

            const depData = manifests.get(depId);
            const installedVersion = depData ? depData.manifest.version : null;

            // Check if any requirements are incompatible
            const incompatible = [];
            for (let i = 0; i < requirements.length; i++) {
                for (let j = i + 1; j < requirements.length; j++) {
                    const req1 = requirements[i];
                    const req2 = requirements[j];

                    if (!this._rangesOverlap(req1.constraint, req2.constraint)) {
                        incompatible.push({ req1, req2 });
                    }
                }
            }

            if (incompatible.length > 0 || (installedVersion && !this._allSatisfied(installedVersion, requirements))) {
                conflicts.push({
                    dependency: depId,
                    installedVersion,
                    requirements: requirements.map(r => ({
                        extension: r.extensionId,
                        constraint: r.constraint,
                        satisfied: installedVersion ? this.satisfiesConstraint(installedVersion, r.constraint) : false
                    })),
                    incompatiblePairs: incompatible,
                    type: 'version-conflict'
                });
            }
        }

        this.versionConflicts = conflicts;
        return conflicts;
    }

    /**
     * Check if two version ranges overlap (have any common version)
     * 
     * @param {string} range1 - First version range
     * @param {string} range2 - Second version range
     * @returns {boolean} True if ranges overlap
     */
    _rangesOverlap(range1, range2) {
        // Wildcards always overlap
        if (range1 === '*' || range2 === '*') return true;

        // Parse ranges into version bounds
        const bounds1 = this._parseRangeBounds(range1);
        const bounds2 = this._parseRangeBounds(range2);

        if (!bounds1 || !bounds2) return false;

        // Check if ranges overlap: [min1, max1] intersects [min2, max2]
        // Ranges overlap if: min1 <= max2 AND min2 <= max1
        const overlap = (
            this.compareVersions(bounds1.min, bounds2.max) <= 0 &&
            this.compareVersions(bounds2.min, bounds1.max) <= 0
        );

        return overlap;
    }

    /**
     * Parse version range into min/max bounds
     * 
     * @param {string} range - Version range constraint
     * @returns {{min: string, max: string, minInclusive: boolean, maxInclusive: boolean}}
     */
    _parseRangeBounds(range) {
        range = range.trim();

        // Exact version
        if (/^\d+\.\d+\.\d+$/.test(range)) {
            return { min: range, max: range, minInclusive: true, maxInclusive: true };
        }

        // Caret: ^1.2.3 -> [1.2.3, 2.0.0)
        if (range.startsWith('^')) {
            const version = range.slice(1);
            const parts = version.split('.').map(Number);
            const [major, minor, patch] = parts;
            
            if (major > 0) {
                return {
                    min: version,
                    max: `${major + 1}.0.0`,
                    minInclusive: true,
                    maxInclusive: false
                };
            } else if (minor > 0) {
                return {
                    min: version,
                    max: `0.${minor + 1}.0`,
                    minInclusive: true,
                    maxInclusive: false
                };
            } else {
                return {
                    min: version,
                    max: `0.0.${patch + 1}`,
                    minInclusive: true,
                    maxInclusive: false
                };
            }
        }

        // Tilde: ~1.2.3 -> [1.2.3, 1.3.0)
        if (range.startsWith('~')) {
            const version = range.slice(1);
            const parts = version.split('.').map(Number);
            const [major, minor] = parts;
            return {
                min: version,
                max: `${major}.${minor + 1}.0`,
                minInclusive: true,
                maxInclusive: false
            };
        }

        // Greater than or equal: >=1.2.3
        if (range.startsWith('>=')) {
            return {
                min: range.slice(2),
                max: '999.999.999',
                minInclusive: true,
                maxInclusive: true
            };
        }

        // Greater than: >1.2.3
        if (range.startsWith('>')) {
            return {
                min: range.slice(1),
                max: '999.999.999',
                minInclusive: false,
                maxInclusive: true
            };
        }

        // Less than or equal: <=1.2.3
        if (range.startsWith('<=')) {
            return {
                min: '0.0.0',
                max: range.slice(2),
                minInclusive: true,
                maxInclusive: true
            };
        }

        // Less than: <1.2.3
        if (range.startsWith('<')) {
            return {
                min: '0.0.0',
                max: range.slice(1),
                minInclusive: true,
                maxInclusive: false
            };
        }

        return null;
    }

    /**
     * Check if installed version satisfies all requirements
     * 
     * @param {string} installedVersion - Installed version
     * @param {Array<Object>} requirements - Array of {extensionId, constraint}
     * @returns {boolean} True if all satisfied
     */
    _allSatisfied(installedVersion, requirements) {
        return requirements.every(req => 
            this.satisfiesConstraint(installedVersion, req.constraint)
        );
    }

    /**
     * Find the best version that satisfies all constraints (npm-style resolution)
     * 
     * @param {Array<string>} constraints - Array of version constraints
     * @param {Array<string>} availableVersions - Array of available versions
     * @returns {string|null} Best matching version or null
     */
    findBestVersion(constraints, availableVersions) {
        if (!constraints || constraints.length === 0) {
            return availableVersions.length > 0 ? availableVersions[availableVersions.length - 1] : null;
        }

        // Sort available versions in descending order (prefer latest)
        const sortedVersions = availableVersions.slice().sort((a, b) => 
            -this.compareVersions(a, b)
        );

        // Find highest version that satisfies all constraints
        for (const version of sortedVersions) {
            if (constraints.every(constraint => this.satisfiesConstraint(version, constraint))) {
                return version;
            }
        }

        return null;
    }

    /**
     * Resolve conflicts with deduplication and generate resolution strategies
     * Each strategy shows which extensions would break and provides impact analysis
     * 
     * @param {Map<string, Object>} manifests - Map of extension manifests
     * @param {Array<string>} availableVersionsMap - Map of depId -> available versions
     * @returns {Object} Resolution report with strategies and impact analysis
     */
    resolveConflicts(manifests, availableVersionsMap = {}) {
        const conflicts = this.detectVersionConflicts(manifests);
        const strategies = [];

        for (const conflict of conflicts) {
            const depId = conflict.dependency;
            const requirements = conflict.requirements;
            const availableVersions = availableVersionsMap[depId] || this._generateVersionRange(requirements);

            // Strategy 1: Find common version (if possible)
            const allConstraints = requirements.map(r => r.constraint);
            const commonVersion = this.findBestVersion(allConstraints, availableVersions);

            if (commonVersion) {
                strategies.push({
                    dependency: depId,
                    strategy: 'common-version',
                    resolution: commonVersion,
                    impact: {
                        breaking: [],
                        upgrades: requirements.filter(r => 
                            this.compareVersions(commonVersion, conflict.installedVersion || '0.0.0') > 0
                        ).map(r => r.extension),
                        downgrades: requirements.filter(r => 
                            conflict.installedVersion && this.compareVersions(commonVersion, conflict.installedVersion) < 0
                        ).map(r => r.extension),
                        unaffected: requirements.filter(r => 
                            commonVersion === conflict.installedVersion
                        ).map(r => r.extension)
                    },
                    recommendation: 'Install version ' + commonVersion + ' (satisfies all requirements)'
                });
            } else {
                // Strategy 2: Multiple strategies for incompatible requirements
                for (const req of requirements) {
                    const satisfyingVersion = this.findBestVersion([req.constraint], availableVersions);
                    
                    if (satisfyingVersion) {
                        const breaking = requirements.filter(r => 
                            r.extension !== req.extension && 
                            !this.satisfiesConstraint(satisfyingVersion, r.constraint)
                        );

                        strategies.push({
                            dependency: depId,
                            strategy: 'favor-extension',
                            favoring: req.extension,
                            resolution: satisfyingVersion,
                            impact: {
                                breaking: breaking.map(r => ({
                                    extension: r.extension,
                                    required: r.constraint,
                                    actual: satisfyingVersion,
                                    reason: `Version ${satisfyingVersion} does not satisfy ${r.constraint}`
                                })),
                                satisfied: [req.extension],
                                partial: []
                            },
                            recommendation: breaking.length > 0 
                                ? `Install version ${satisfyingVersion} for ${req.extension} (breaks ${breaking.length} extension(s))`
                                : `Install version ${satisfyingVersion} for ${req.extension}`
                        });
                    }
                }

                // Strategy 3: Peer dependency duplication (install multiple versions)
                strategies.push({
                    dependency: depId,
                    strategy: 'duplicate',
                    resolution: 'multiple-versions',
                    impact: {
                        installations: requirements.map(r => ({
                            extension: r.extension,
                            version: this.findBestVersion([r.constraint], availableVersions) || r.constraint
                        })),
                        diskSpace: 'increased',
                        complexity: 'high'
                    },
                    recommendation: 'Install separate versions for each extension (increases complexity)'
                });
            }
        }

        this.resolutionStrategies = strategies;

        return {
            conflicts,
            strategies,
            summary: {
                totalConflicts: conflicts.length,
                resolvableConflicts: strategies.filter(s => s.strategy === 'common-version').length,
                requiresManualIntervention: strategies.filter(s => s.strategy !== 'common-version').length,
                affectedExtensions: new Set(conflicts.flatMap(c => c.requirements.map(r => r.extension))).size
            }
        };
    }

    /**
     * Generate a range of versions for testing resolution strategies
     * 
     * @param {Array<Object>} requirements - Requirements array
     * @returns {Array<string>} Generated version range
     */
    _generateVersionRange(requirements) {
        const versions = new Set();
        
        for (const req of requirements) {
            const bounds = this._parseRangeBounds(req.constraint);
            if (bounds) {
                versions.add(bounds.min);
                versions.add(bounds.max);
            }
        }

        return Array.from(versions).filter(v => v !== '999.999.999').sort((a, b) => 
            this.compareVersions(a, b)
        );
    }

    /**
     * Diagnose dependency conflicts and generate comprehensive report
     * Used by `ghost extension doctor` command
     * 
     * @param {Map<string, Object>} manifests - Map of extension manifests
     * @param {Object} options - Options for diagnosis
     * @returns {Object} Diagnostic report with tree visualization and recommendations
     */
    static diagnoseConflicts(manifests, options = {}) {
        const resolver = new DependencyResolver();
        const graph = resolver.buildDependencyGraph(manifests);
        
        // Detect all types of issues
        const versionConflicts = resolver.detectVersionConflicts(manifests);
        const versionIssues = resolver.validateVersionConstraints(manifests);
        const circularDeps = resolver.detectCircularDependencies(graph);
        const capabilityConflicts = resolver.detectCapabilityConflicts(manifests, resolver.topologicalSort(graph));
        
        // Generate resolution strategies
        const resolutionReport = resolver.resolveConflicts(manifests, options.availableVersions || {});
        
        // Build dependency tree visualization
        const trees = [];
        for (const [extId] of manifests) {
            trees.push({
                extension: extId,
                tree: resolver.generateDependencyTree(graph, extId)
            });
        }

        // Generate recommendations
        const recommendations = resolver._generateRecommendations({
            versionConflicts,
            versionIssues,
            circularDeps,
            capabilityConflicts,
            resolutionReport
        });

        return {
            healthy: versionConflicts.length === 0 && versionIssues.length === 0 && 
                     circularDeps.length === 0 && capabilityConflicts.length === 0,
            versionConflicts,
            versionIssues,
            circularDependencies: circularDeps,
            capabilityConflicts,
            resolutionStrategies: resolutionReport.strategies,
            summary: resolutionReport.summary,
            dependencyTrees: trees,
            recommendations,
            graph: resolver._serializeGraph(graph)
        };
    }

    /**
     * Generate fix recommendations based on detected issues
     * 
     * @param {Object} issues - All detected issues
     * @returns {Array<Object>} Array of recommendations
     */
    _generateRecommendations(issues) {
        const recommendations = [];

        // Version conflict recommendations
        for (const conflict of issues.versionConflicts) {
            const strategy = issues.resolutionReport.strategies.find(s => 
                s.dependency === conflict.dependency && s.strategy === 'common-version'
            );

            if (strategy) {
                recommendations.push({
                    severity: 'high',
                    type: 'version-conflict',
                    dependency: conflict.dependency,
                    action: 'upgrade',
                    target: strategy.resolution,
                    command: `npm install ${conflict.dependency}@${strategy.resolution}`,
                    reason: `Resolves conflict between ${conflict.requirements.length} extensions`,
                    affected: conflict.requirements.map(r => r.extension)
                });
            } else {
                recommendations.push({
                    severity: 'critical',
                    type: 'version-conflict',
                    dependency: conflict.dependency,
                    action: 'manual-resolution',
                    reason: `No common version satisfies all requirements`,
                    affected: conflict.requirements.map(r => r.extension),
                    options: issues.resolutionReport.strategies
                        .filter(s => s.dependency === conflict.dependency)
                        .map(s => s.recommendation)
                });
            }
        }

        // Missing dependency recommendations
        for (const issue of issues.versionIssues) {
            if (!issue.installed) {
                recommendations.push({
                    severity: 'critical',
                    type: 'missing-dependency',
                    dependency: issue.dependency,
                    action: 'install',
                    target: issue.constraint,
                    command: `npm install ${issue.dependency}@${issue.constraint}`,
                    reason: `Required by ${issue.extension}`,
                    affected: [issue.extension]
                });
            } else {
                recommendations.push({
                    severity: 'high',
                    type: 'version-mismatch',
                    dependency: issue.dependency,
                    action: issue.constraint.startsWith('^') || issue.constraint.startsWith('~') ? 'upgrade' : 'change',
                    target: issue.constraint,
                    current: issue.installed,
                    command: `npm install ${issue.dependency}@${issue.constraint}`,
                    reason: `Version mismatch: requires ${issue.constraint}, found ${issue.installed}`,
                    affected: [issue.extension]
                });
            }
        }

        // Circular dependency recommendations
        for (const cycle of issues.circularDeps) {
            recommendations.push({
                severity: 'critical',
                type: 'circular-dependency',
                action: 'refactor',
                cycle: cycle,
                reason: 'Circular dependencies prevent proper initialization order',
                suggestion: 'Refactor to remove circular dependencies or use lazy loading'
            });
        }

        // Capability conflict recommendations
        for (const conflict of issues.capabilityConflicts) {
            if (conflict.resolution === 'first-loaded-wins') {
                recommendations.push({
                    severity: 'medium',
                    type: 'capability-conflict',
                    capability: conflict.capability,
                    action: 'review-load-order',
                    winner: conflict.winner,
                    affected: conflict.extensions,
                    reason: `Multiple extensions claim capability "${conflict.capability}"`,
                    suggestion: 'Review extension load order or remove conflicting extension'
                });
            }
        }

        return recommendations;
    }

    /**
     * Serialize graph to plain object for JSON output
     * 
     * @param {Map<string, Object>} graph - Dependency graph
     * @returns {Object} Serialized graph
     */
    _serializeGraph(graph) {
        const serialized = {};
        for (const [id, node] of graph) {
            serialized[id] = {
                id: node.id,
                version: node.version,
                dependencies: node.dependencies,
                extensionDependencies: node.extensionDependencies,
                peerDependencies: node.peerDependencies,
                dependents: Array.from(node.dependents)
            };
        }
        return serialized;
    }

    /**
     * Perform topological sort using Kahn's algorithm
     * Returns load order where dependencies come before dependents
     * 
     * @param {Map<string, Object>} graph - Dependency graph
     * @returns {Array<string>} Extension IDs in load order
     */
    topologicalSort(graph) {
        const inDegree = new Map();
        const result = [];
        const queue = [];

        // Calculate in-degree for each node
        for (const [extId, node] of graph) {
            const allDeps = {
                ...node.dependencies,
                ...node.extensionDependencies
            };
            inDegree.set(extId, Object.keys(allDeps).length);
            if (inDegree.get(extId) === 0) {
                queue.push(extId);
            }
        }

        // Process nodes with zero in-degree
        while (queue.length > 0) {
            const extId = queue.shift();
            result.push(extId);

            const node = graph.get(extId);
            if (node) {
                // Reduce in-degree for dependents
                for (const dependent of node.dependents) {
                    const degree = inDegree.get(dependent) - 1;
                    inDegree.set(dependent, degree);
                    if (degree === 0) {
                        queue.push(dependent);
                    }
                }
            }
        }

        // If not all nodes processed, there's a cycle
        if (result.length !== graph.size) {
            throw new Error('Circular dependency detected during topological sort');
        }

        return result;
    }

    /**
     * Detect circular dependencies using DFS
     * Returns array of circular dependency chains
     * 
     * @param {Map<string, Object>} graph - Dependency graph
     * @returns {Array<Array<string>>} Array of dependency cycles
     */
    detectCircularDependencies(graph) {
        const visited = new Set();
        const recursionStack = new Set();
        const cycles = [];

        const dfs = (extId, path) => {
            if (recursionStack.has(extId)) {
                // Found cycle - extract the cycle path
                const cycleStart = path.indexOf(extId);
                const cycle = [...path.slice(cycleStart), extId];
                cycles.push(cycle);
                return true;
            }

            if (visited.has(extId)) {
                return false;
            }

            visited.add(extId);
            recursionStack.add(extId);
            path.push(extId);

            const node = graph.get(extId);
            if (node) {
                const allDeps = {
                    ...node.dependencies,
                    ...node.extensionDependencies
                };
                for (const depId of Object.keys(allDeps)) {
                    if (graph.has(depId)) {
                        dfs(depId, [...path]);
                    }
                }
            }

            recursionStack.delete(extId);
            return false;
        };

        for (const extId of graph.keys()) {
            if (!visited.has(extId)) {
                dfs(extId, []);
            }
        }

        return cycles;
    }

    /**
     * Validate version constraints across dependency tree
     * Checks if installed versions satisfy declared constraints
     * 
     * @param {Map<string, Object>} manifests - Map of extension manifests
     * @returns {Array<Object>} Array of version constraint issues
     */
    validateVersionConstraints(manifests) {
        const issues = [];

        for (const [extId, extData] of manifests) {
            const allDeps = {
                ...(extData.manifest.dependencies || {}),
                ...(extData.manifest.extensionDependencies || {}),
                ...(extData.manifest.peerDependencies || {})
            };

            for (const [depId, constraint] of Object.entries(allDeps)) {
                const depData = manifests.get(depId);

                if (!depData) {
                    issues.push({
                        extension: extId,
                        dependency: depId,
                        constraint,
                        installed: null,
                        satisfied: false,
                        message: `Dependency not found: ${depId}`
                    });
                    continue;
                }

                const installedVersion = depData.manifest.version;
                const satisfied = this.satisfiesConstraint(installedVersion, constraint);

                if (!satisfied) {
                    issues.push({
                        extension: extId,
                        dependency: depId,
                        constraint,
                        installed: installedVersion,
                        satisfied: false,
                        message: `Version mismatch: requires ${constraint}, found ${installedVersion}`
                    });
                }
            }
        }

        return issues;
    }

    /**
     * Check if a version satisfies a constraint
     * Supports semver constraints: ^, ~, >, <, >=, <=, =, *, ranges
     * 
     * @param {string} version - Installed version (e.g., "1.2.3")
     * @param {string} constraint - Version constraint (e.g., "^1.0.0")
     * @returns {boolean} True if version satisfies constraint
     */
    satisfiesConstraint(version, constraint) {
        if (constraint === '*') return true;

        const versionParts = version.split('.').map(Number);
        const [vMajor, vMinor, vPatch] = versionParts;

        // Caret range: ^1.2.3 allows >=1.2.3 and <2.0.0
        if (constraint.startsWith('^')) {
            const constraintVersion = constraint.slice(1);
            const [cMajor, cMinor, cPatch] = constraintVersion.split('.').map(Number);
            
            if (vMajor !== cMajor) return false;
            if (cMajor > 0) {
                return vMajor === cMajor && (vMinor > cMinor || (vMinor === cMinor && vPatch >= cPatch));
            }
            if (cMinor > 0) {
                return vMajor === cMajor && vMinor === cMinor && vPatch >= cPatch;
            }
            return vMajor === cMajor && vMinor === cMinor && vPatch === cPatch;
        }

        // Tilde range: ~1.2.3 allows >=1.2.3 and <1.3.0
        if (constraint.startsWith('~')) {
            const constraintVersion = constraint.slice(1);
            const [cMajor, cMinor, cPatch] = constraintVersion.split('.').map(Number);
            return vMajor === cMajor && vMinor === cMinor && vPatch >= cPatch;
        }

        // Exact version
        if (/^\d+\.\d+\.\d+$/.test(constraint)) {
            return version === constraint;
        }

        // Comparison operators
        if (constraint.startsWith('>=')) {
            return this.compareVersions(version, constraint.slice(2)) >= 0;
        }
        if (constraint.startsWith('<=')) {
            return this.compareVersions(version, constraint.slice(2)) <= 0;
        }
        if (constraint.startsWith('>')) {
            return this.compareVersions(version, constraint.slice(1)) > 0;
        }
        if (constraint.startsWith('<')) {
            return this.compareVersions(version, constraint.slice(1)) < 0;
        }
        if (constraint.startsWith('=')) {
            return version === constraint.slice(1);
        }

        // Range: ">=1.0.0 <2.0.0"
        const rangeMatch = constraint.match(/^(>=?|<=?)\s*(\d+\.\d+\.\d+)\s+(<=?|<)\s*(\d+\.\d+\.\d+)$/);
        if (rangeMatch) {
            const [, lowerOp, lowerVer, upperOp, upperVer] = rangeMatch;
            const lowerSat = this.satisfiesConstraint(version, lowerOp + lowerVer);
            const upperSat = this.satisfiesConstraint(version, upperOp + upperVer);
            return lowerSat && upperSat;
        }

        return false;
    }

    /**
     * Compare two semantic versions
     * 
     * @param {string} v1 - First version
     * @param {string} v2 - Second version
     * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
     */
    compareVersions(v1, v2) {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);

        for (let i = 0; i < 3; i++) {
            if (parts1[i] > parts2[i]) return 1;
            if (parts1[i] < parts2[i]) return -1;
        }

        return 0;
    }

    /**
     * Detect capability conflicts across extensions
     * Identifies overlapping capability declarations
     * 
     * @param {Map<string, Object>} manifests - Map of extension manifests
     * @param {Array<string>} loadOrder - Extension load order
     * @returns {Array<Object>} Array of conflict descriptions
     */
    detectCapabilityConflicts(manifests, loadOrder) {
        const conflicts = [];
        const capabilityRegistry = {
            filesystem: new Map(),
            network: new Map(),
            git: new Map(),
            hooks: new Map(),
            commands: new Map()
        };

        // Process extensions in load order (first-loaded wins)
        for (const extId of loadOrder) {
            const extData = manifests.get(extId);
            if (!extData) continue;

            const manifest = extData.manifest;
            const capabilities = manifest.capabilities || {};

            // Check filesystem patterns
            if (capabilities.filesystem) {
                const readPatterns = capabilities.filesystem.read || [];
                const writePatterns = capabilities.filesystem.write || [];
                
                for (const pattern of [...readPatterns, ...writePatterns]) {
                    if (capabilityRegistry.filesystem.has(pattern)) {
                        conflicts.push({
                            type: 'filesystem',
                            capability: pattern,
                            extensions: [capabilityRegistry.filesystem.get(pattern), extId],
                            resolution: 'first-loaded-wins',
                            winner: capabilityRegistry.filesystem.get(pattern)
                        });
                    } else {
                        capabilityRegistry.filesystem.set(pattern, extId);
                    }
                }
            }

            // Check network allowlist
            if (capabilities.network && capabilities.network.allowlist) {
                for (const url of capabilities.network.allowlist) {
                    if (capabilityRegistry.network.has(url)) {
                        conflicts.push({
                            type: 'network',
                            capability: url,
                            extensions: [capabilityRegistry.network.get(url), extId],
                            resolution: 'first-loaded-wins',
                            winner: capabilityRegistry.network.get(url)
                        });
                    } else {
                        capabilityRegistry.network.set(url, extId);
                    }
                }
            }

            // Check git capabilities
            if (capabilities.git) {
                const gitKey = `read:${capabilities.git.read || false},write:${capabilities.git.write || false}`;
                if (capabilityRegistry.git.has(gitKey)) {
                    const existing = capabilityRegistry.git.get(gitKey);
                    if (existing !== extId) {
                        conflicts.push({
                            type: 'git',
                            capability: gitKey,
                            extensions: [existing, extId],
                            resolution: 'shared',
                            winner: null
                        });
                    }
                }
                capabilityRegistry.git.set(gitKey, extId);
            }

            // Check hooks
            if (capabilities.hooks) {
                for (const hook of capabilities.hooks) {
                    if (capabilityRegistry.hooks.has(hook)) {
                        const existing = capabilityRegistry.hooks.get(hook);
                        conflicts.push({
                            type: 'hook',
                            capability: hook,
                            extensions: [existing, extId],
                            resolution: 'chain',
                            winner: null
                        });
                    }
                    if (!capabilityRegistry.hooks.has(hook)) {
                        capabilityRegistry.hooks.set(hook, extId);
                    }
                }
            }

            // Check command declarations
            if (manifest.commands) {
                for (const command of manifest.commands) {
                    if (capabilityRegistry.commands.has(command)) {
                        conflicts.push({
                            type: 'command',
                            capability: command,
                            extensions: [capabilityRegistry.commands.get(command), extId],
                            resolution: 'first-loaded-wins',
                            winner: capabilityRegistry.commands.get(command)
                        });
                    } else {
                        capabilityRegistry.commands.set(command, extId);
                    }
                }
            }
        }

        return conflicts;
    }

    /**
     * Generate dependency tree visualization
     * 
     * @param {Map<string, Object>} graph - Dependency graph
     * @param {string} rootId - Root extension ID
     * @param {number} depth - Current depth for indentation
     * @returns {string} Tree visualization
     */
    generateDependencyTree(graph, rootId, depth = 0) {
        const node = graph.get(rootId);
        if (!node) return '';

        const indent = '  '.repeat(depth);
        let tree = `${indent}${rootId}@${node.version}\n`;

        const allDeps = {
            ...node.dependencies,
            ...node.extensionDependencies
        };
        const deps = Object.keys(allDeps);
        for (const depId of deps) {
            tree += this.generateDependencyTree(graph, depId, depth + 1);
        }

        return tree;
    }

    /**
     * Get all dependencies (direct and transitive) for an extension
     * 
     * @param {Map<string, Object>} graph - Dependency graph
     * @param {string} extId - Extension ID
     * @returns {Set<string>} Set of all dependency IDs
     */
    getAllDependencies(graph, extId) {
        const allDeps = new Set();
        const visited = new Set();

        const traverse = (id) => {
            if (visited.has(id)) return;
            visited.add(id);

            const node = graph.get(id);
            if (node) {
                const deps = {
                    ...node.dependencies,
                    ...node.extensionDependencies
                };
                for (const depId of Object.keys(deps)) {
                    allDeps.add(depId);
                    traverse(depId);
                }
            }
        };

        traverse(extId);
        return allDeps;
    }
}

module.exports = DependencyResolver;

// Example usage for testing
if (require.main === module) {
    // Test detectVersionConflicts
    const testManifests = new Map([
        ['ext-a', {
            manifest: {
                id: 'ext-a',
                version: '1.0.0',
                dependencies: {
                    'shared-lib': '^1.0.0'
                }
            }
        }],
        ['ext-b', {
            manifest: {
                id: 'ext-b',
                version: '1.0.0',
                dependencies: {
                    'shared-lib': '^2.0.0'
                }
            }
        }],
        ['shared-lib', {
            manifest: {
                id: 'shared-lib',
                version: '1.5.0'
            }
        }]
    ]);

    console.log('Testing DependencyResolver...\n');
    
    const resolver = new DependencyResolver();
    
    // Test version conflict detection
    console.log('1. Detecting version conflicts:');
    const conflicts = resolver.detectVersionConflicts(testManifests);
    console.log(JSON.stringify(conflicts, null, 2));
    console.log('');
    
    // Test resolution strategies
    console.log('2. Generating resolution strategies:');
    const resolutionReport = resolver.resolveConflicts(testManifests, {
        'shared-lib': ['1.0.0', '1.5.0', '2.0.0', '2.1.0']
    });
    console.log(JSON.stringify(resolutionReport, null, 2));
    console.log('');
    
    // Test diagnoseConflicts
    console.log('3. Full diagnosis:');
    const diagnosis = DependencyResolver.diagnoseConflicts(testManifests);
    console.log('Healthy:', diagnosis.healthy);
    console.log('Conflicts:', diagnosis.versionConflicts.length);
    console.log('Strategies:', diagnosis.resolutionStrategies.length);
    console.log('Recommendations:', diagnosis.recommendations.length);
}
