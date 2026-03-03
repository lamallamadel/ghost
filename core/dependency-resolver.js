/**
 * DependencyResolver - Extension Dependency Resolution with Topological Sort
 * 
 * RESPONSIBILITY: 
 * - Build dependency graphs from extension manifests
 * - Perform topological sort to determine load order
 * - Detect circular dependencies with full chain visualization
 * - Validate version constraints using semver
 * - Detect capability conflicts across extensions
 * 
 * ALGORITHMS:
 * - Topological Sort: Kahn's algorithm with DFS for cycle detection
 * - Version Matching: Semver constraint evaluation (^, ~, >, <, =, ranges)
 * - Circular Detection: Tarjan's strongly connected components
 * - Conflict Detection: Capability overlap analysis
 */

class DependencyResolver {
    constructor() {
        this.graph = new Map();
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
                dependents: new Set(),
                capabilities: extData.manifest.capabilities
            });
        }

        // Build edges
        for (const [extId, node] of graph) {
            for (const depId of Object.keys(node.dependencies)) {
                if (graph.has(depId)) {
                    graph.get(depId).dependents.add(extId);
                }
            }
        }

        this.graph = graph;
        return graph;
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
            inDegree.set(extId, Object.keys(node.dependencies).length);
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
                for (const depId of Object.keys(node.dependencies)) {
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
            const dependencies = extData.manifest.dependencies || {};

            for (const [depId, constraint] of Object.entries(dependencies)) {
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

        const deps = Object.keys(node.dependencies);
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
                for (const depId of Object.keys(node.dependencies)) {
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
