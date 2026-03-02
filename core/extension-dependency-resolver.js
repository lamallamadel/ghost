/**
 * ExtensionDependencyResolver - Extension Dependency Resolution System
 * 
 * RESPONSIBILITY: Resolve inter-extension dependencies, perform topological sorting,
 * validate version constraints, detect conflicts, and prevent circular dependencies.
 * 
 * FEATURES:
 * - Inter-extension dependency declaration via manifest.extensionDependencies
 * - Topological sorting for correct load order
 * - Semver range validation (^, ~, >=, <=, >, <, =, x, *)
 * - Conflict detection for duplicate capabilities
 * - Circular dependency prevention
 * - Missing dependency detection
 * - Version compatibility checking
 * 
 * FAIL-CLOSED SECURITY MODEL:
 * - Missing dependencies cause resolution failure
 * - Circular dependencies cause resolution failure
 * - Version constraint violations cause resolution failure
 * - Capability conflicts cause resolution failure
 * - Invalid semver ranges cause resolution failure
 */

class ExtensionDependencyResolver {
    constructor() {
        this.extensions = new Map();
        this.resolvedOrder = [];
        this.conflicts = [];
        this.errors = [];
    }

    /**
     * Register an extension with its manifest
     * 
     * @param {Object} extension - Extension object with manifest, path, etc.
     */
    register(extension) {
        if (!extension.manifest || !extension.manifest.id) {
            throw new Error('Extension must have a manifest with an id');
        }

        const id = extension.manifest.id;
        
        if (this.extensions.has(id)) {
            throw new Error(`Extension ${id} is already registered`);
        }

        this.extensions.set(id, extension);
    }

    /**
     * Resolve all dependencies and return load order
     * 
     * FAIL-CLOSED BEHAVIOR:
     * - Throws on missing dependencies
     * - Throws on circular dependencies
     * - Throws on version constraint violations
     * - Throws on capability conflicts
     * 
     * @returns {Array<Object>} Extensions in load order
     * @throws {Error} If resolution fails
     */
    resolve() {
        this.resolvedOrder = [];
        this.conflicts = [];
        this.errors = [];

        // Step 1: Validate all dependencies exist
        this._validateDependenciesExist();
        
        if (this.errors.length > 0) {
            throw new Error(
                `Dependency resolution failed:\n  - ${this.errors.join('\n  - ')}`
            );
        }

        // Step 2: Validate version constraints
        this._validateVersionConstraints();
        
        if (this.errors.length > 0) {
            throw new Error(
                `Version constraint validation failed:\n  - ${this.errors.join('\n  - ')}`
            );
        }

        // Step 3: Detect circular dependencies
        this._detectCircularDependencies();
        
        if (this.errors.length > 0) {
            throw new Error(
                `Circular dependency detected:\n  - ${this.errors.join('\n  - ')}`
            );
        }

        // Step 4: Perform topological sort
        this._topologicalSort();
        
        if (this.errors.length > 0) {
            throw new Error(
                `Topological sort failed:\n  - ${this.errors.join('\n  - ')}`
            );
        }

        // Step 5: Detect capability conflicts
        this._detectCapabilityConflicts();
        
        if (this.conflicts.length > 0) {
            const conflictDetails = this.conflicts.map(c => 
                `${c.capability} provided by [${c.extensions.join(', ')}]`
            ).join('\n  - ');
            
            throw new Error(
                `Capability conflicts detected:\n  - ${conflictDetails}`
            );
        }

        // Return extensions in resolved load order
        return this.resolvedOrder.map(id => this.extensions.get(id));
    }

    /**
     * Get dependency graph as adjacency list
     * 
     * @returns {Object} Dependency graph
     */
    getDependencyGraph() {
        const graph = {};
        
        for (const [id, extension] of this.extensions) {
            const deps = this._getExtensionDependencies(extension);
            graph[id] = deps.map(d => d.id);
        }
        
        return graph;
    }

    /**
     * Get reverse dependency graph (dependents)
     * 
     * @returns {Object} Reverse dependency graph
     */
    getReverseDependencyGraph() {
        const graph = {};
        
        for (const id of this.extensions.keys()) {
            graph[id] = [];
        }
        
        for (const [id, extension] of this.extensions) {
            const deps = this._getExtensionDependencies(extension);
            for (const dep of deps) {
                if (!graph[dep.id]) {
                    graph[dep.id] = [];
                }
                graph[dep.id].push(id);
            }
        }
        
        return graph;
    }

    /**
     * Validate all dependencies exist
     */
    _validateDependenciesExist() {
        for (const [id, extension] of this.extensions) {
            const deps = this._getExtensionDependencies(extension);
            
            for (const dep of deps) {
                if (!this.extensions.has(dep.id)) {
                    this.errors.push(
                        `Extension ${id} depends on ${dep.id}@${dep.version}, but ${dep.id} is not available`
                    );
                }
            }
        }
    }

    /**
     * Validate version constraints for all dependencies
     */
    _validateVersionConstraints() {
        for (const [id, extension] of this.extensions) {
            const deps = this._getExtensionDependencies(extension);
            
            for (const dep of deps) {
                const depExtension = this.extensions.get(dep.id);
                
                if (depExtension) {
                    const actualVersion = depExtension.manifest.version;
                    
                    if (!this._versionSatisfies(actualVersion, dep.version)) {
                        this.errors.push(
                            `Extension ${id} requires ${dep.id}@${dep.version}, but ${actualVersion} is available`
                        );
                    }
                }
            }
        }
    }

    /**
     * Detect circular dependencies using DFS
     */
    _detectCircularDependencies() {
        const visited = new Set();
        const recursionStack = new Set();
        const cycles = [];
        
        const dfs = (id, path = []) => {
            visited.add(id);
            recursionStack.add(id);
            path.push(id);
            
            const extension = this.extensions.get(id);
            const deps = this._getExtensionDependencies(extension);
            
            for (const dep of deps) {
                if (!this.extensions.has(dep.id)) {
                    continue;
                }
                
                if (!visited.has(dep.id)) {
                    dfs(dep.id, [...path]);
                } else if (recursionStack.has(dep.id)) {
                    // Cycle detected
                    const cycleStart = path.indexOf(dep.id);
                    const cycle = [...path.slice(cycleStart), dep.id];
                    cycles.push(cycle.join(' -> '));
                }
            }
            
            recursionStack.delete(id);
        };
        
        for (const id of this.extensions.keys()) {
            if (!visited.has(id)) {
                dfs(id);
            }
        }
        
        if (cycles.length > 0) {
            for (const cycle of cycles) {
                this.errors.push(`Circular dependency: ${cycle}`);
            }
        }
    }

    /**
     * Perform topological sort using DFS
     */
    _topologicalSort() {
        const visited = new Set();
        const stack = [];
        
        const dfs = (id) => {
            visited.add(id);
            
            const extension = this.extensions.get(id);
            const deps = this._getExtensionDependencies(extension);
            
            for (const dep of deps) {
                if (!this.extensions.has(dep.id)) {
                    continue;
                }
                
                if (!visited.has(dep.id)) {
                    dfs(dep.id);
                }
            }
            
            stack.push(id);
        };
        
        for (const id of this.extensions.keys()) {
            if (!visited.has(id)) {
                dfs(id);
            }
        }
        
        this.resolvedOrder = stack;
    }

    /**
     * Detect capability conflicts (multiple extensions providing same capability)
     */
    _detectCapabilityConflicts() {
        const capabilityProviders = new Map();
        
        for (const [id, extension] of this.extensions) {
            const capabilities = this._getProvidedCapabilities(extension);
            
            for (const capability of capabilities) {
                if (!capabilityProviders.has(capability)) {
                    capabilityProviders.set(capability, []);
                }
                capabilityProviders.get(capability).push(id);
            }
        }
        
        for (const [capability, providers] of capabilityProviders) {
            if (providers.length > 1) {
                this.conflicts.push({
                    capability,
                    extensions: providers
                });
            }
        }
    }

    /**
     * Get extension dependencies from manifest
     * 
     * @param {Object} extension - Extension object
     * @returns {Array<{id: string, version: string}>}
     */
    _getExtensionDependencies(extension) {
        const manifest = extension.manifest;
        
        if (!manifest.extensionDependencies) {
            return [];
        }
        
        if (typeof manifest.extensionDependencies !== 'object') {
            return [];
        }
        
        return Object.entries(manifest.extensionDependencies).map(([id, version]) => ({
            id,
            version
        }));
    }

    /**
     * Get capabilities provided by extension
     * 
     * @param {Object} extension - Extension object
     * @returns {Array<string>}
     */
    _getProvidedCapabilities(extension) {
        const manifest = extension.manifest;
        const capabilities = [];
        
        // Commands are capabilities
        if (manifest.commands && Array.isArray(manifest.commands)) {
            for (const cmd of manifest.commands) {
                capabilities.push(`command:${cmd}`);
            }
        }
        
        // Hooks are capabilities
        if (manifest.capabilities && manifest.capabilities.hooks) {
            for (const hook of manifest.capabilities.hooks) {
                capabilities.push(`hook:${hook}`);
            }
        }
        
        // Explicit capability declarations (if added in future)
        if (manifest.provides && Array.isArray(manifest.provides)) {
            for (const cap of manifest.provides) {
                capabilities.push(cap);
            }
        }
        
        return capabilities;
    }

    /**
     * Check if a version satisfies a semver range
     * 
     * Supports:
     * - Exact: 1.0.0
     * - Caret: ^1.0.0 (compatible with 1.x.x)
     * - Tilde: ~1.0.0 (compatible with 1.0.x)
     * - Greater than: >1.0.0, >=1.0.0
     * - Less than: <2.0.0, <=2.0.0
     * - Wildcard: 1.x, 1.*.*, *
     * - Range: 1.0.0 - 2.0.0
     * 
     * @param {string} version - Actual version
     * @param {string} range - Version range/constraint
     * @returns {boolean}
     */
    _versionSatisfies(version, range) {
        // Parse version
        const vParts = this._parseVersion(version);
        if (!vParts) return false;
        
        // Handle wildcards
        if (range === '*' || range === 'x' || range === 'X') {
            return true;
        }
        
        // Handle range (e.g., "1.0.0 - 2.0.0")
        if (range.includes(' - ')) {
            const [min, max] = range.split(' - ').map(r => r.trim());
            return this._versionSatisfies(version, `>=${min}`) && 
                   this._versionSatisfies(version, `<=${max}`);
        }
        
        // Handle caret (^)
        if (range.startsWith('^')) {
            const rParts = this._parseVersion(range.slice(1));
            if (!rParts) return false;
            
            // ^1.2.3 := >=1.2.3 <2.0.0
            // ^0.2.3 := >=0.2.3 <0.3.0
            // ^0.0.3 := >=0.0.3 <0.0.4
            
            if (vParts.major !== rParts.major) {
                return false;
            }
            
            if (rParts.major > 0) {
                return this._compareVersions(vParts, rParts) >= 0;
            }
            
            if (vParts.minor !== rParts.minor) {
                return false;
            }
            
            if (rParts.minor > 0) {
                return this._compareVersions(vParts, rParts) >= 0;
            }
            
            return this._compareVersions(vParts, rParts) >= 0 && 
                   vParts.patch === rParts.patch;
        }
        
        // Handle tilde (~)
        if (range.startsWith('~')) {
            const rParts = this._parseVersion(range.slice(1));
            if (!rParts) return false;
            
            // ~1.2.3 := >=1.2.3 <1.3.0
            return vParts.major === rParts.major &&
                   vParts.minor === rParts.minor &&
                   vParts.patch >= rParts.patch;
        }
        
        // Handle >=, <=, >, <
        if (range.startsWith('>=')) {
            const rParts = this._parseVersion(range.slice(2));
            if (!rParts) return false;
            return this._compareVersions(vParts, rParts) >= 0;
        }
        
        if (range.startsWith('<=')) {
            const rParts = this._parseVersion(range.slice(2));
            if (!rParts) return false;
            return this._compareVersions(vParts, rParts) <= 0;
        }
        
        if (range.startsWith('>')) {
            const rParts = this._parseVersion(range.slice(1));
            if (!rParts) return false;
            return this._compareVersions(vParts, rParts) > 0;
        }
        
        if (range.startsWith('<')) {
            const rParts = this._parseVersion(range.slice(1));
            if (!rParts) return false;
            return this._compareVersions(vParts, rParts) < 0;
        }
        
        // Handle wildcard patterns (1.x, 1.2.x, 1.*.*)
        if (range.includes('x') || range.includes('X') || range.includes('*')) {
            const rParts = range.split('.');
            const versionParts = [vParts.major, vParts.minor, vParts.patch];
            
            for (let i = 0; i < rParts.length; i++) {
                const rPart = rParts[i];
                if (rPart === 'x' || rPart === 'X' || rPart === '*') {
                    continue;
                }
                if (parseInt(rPart, 10) !== versionParts[i]) {
                    return false;
                }
            }
            return true;
        }
        
        // Exact match (with optional = prefix)
        const exactRange = range.startsWith('=') ? range.slice(1) : range;
        const rParts = this._parseVersion(exactRange);
        if (!rParts) return false;
        
        return this._compareVersions(vParts, rParts) === 0;
    }

    /**
     * Parse version string to components
     * 
     * @param {string} version - Version string
     * @returns {{major: number, minor: number, patch: number}|null}
     */
    _parseVersion(version) {
        const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
        
        if (!match) {
            return null;
        }
        
        return {
            major: parseInt(match[1], 10),
            minor: parseInt(match[2], 10),
            patch: parseInt(match[3], 10)
        };
    }

    /**
     * Compare two version objects
     * 
     * @param {Object} v1 - Version 1
     * @param {Object} v2 - Version 2
     * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
     */
    _compareVersions(v1, v2) {
        if (v1.major !== v2.major) {
            return v1.major - v2.major;
        }
        if (v1.minor !== v2.minor) {
            return v1.minor - v2.minor;
        }
        return v1.patch - v2.patch;
    }

    /**
     * Clear all state
     */
    clear() {
        this.extensions.clear();
        this.resolvedOrder = [];
        this.conflicts = [];
        this.errors = [];
    }

    /**
     * Generate a visual representation of the dependency graph
     * 
     * @returns {string} ASCII dependency graph
     */
    visualizeDependencies() {
        const graph = this.getDependencyGraph();
        const lines = [];
        
        lines.push('Extension Dependency Graph:');
        lines.push('');
        
        // Show in load order (topologically sorted)
        for (const id of this.resolvedOrder) {
            const deps = graph[id] || [];
            const extension = this.extensions.get(id);
            const version = extension ? extension.manifest.version : 'unknown';
            
            if (deps.length === 0) {
                lines.push(`  ${id}@${version} (no dependencies)`);
            } else {
                lines.push(`  ${id}@${version}`);
                for (let i = 0; i < deps.length; i++) {
                    const depId = deps[i];
                    const depExt = this.extensions.get(depId);
                    const depVersion = depExt ? depExt.manifest.version : 'unknown';
                    const isLast = i === deps.length - 1;
                    const prefix = isLast ? '└──' : '├──';
                    lines.push(`    ${prefix} ${depId}@${depVersion}`);
                }
            }
            lines.push('');
        }
        
        return lines.join('\n');
    }

    /**
     * Get extension metadata including dependencies and dependents
     * 
     * @param {string} extensionId - Extension ID
     * @returns {Object|null} Extension metadata with dependency info
     */
    getExtensionMetadata(extensionId) {
        const extension = this.extensions.get(extensionId);
        
        if (!extension) {
            return null;
        }
        
        const dependencies = this._getExtensionDependencies(extension);
        const reverseDeps = this.getReverseDependencyGraph();
        const dependents = reverseDeps[extensionId] || [];
        const capabilities = this._getProvidedCapabilities(extension);
        
        return {
            id: extensionId,
            version: extension.manifest.version,
            name: extension.manifest.name,
            dependencies: dependencies.map(d => ({
                id: d.id,
                versionConstraint: d.version,
                actualVersion: this.extensions.has(d.id) 
                    ? this.extensions.get(d.id).manifest.version 
                    : null
            })),
            dependents,
            capabilities,
            loadOrder: this.resolvedOrder.indexOf(extensionId) + 1
        };
    }

    /**
     * Export dependency graph in DOT format for visualization tools
     * 
     * @returns {string} DOT format graph
     */
    exportToDot() {
        const lines = [];
        
        lines.push('digraph ExtensionDependencies {');
        lines.push('  rankdir=LR;');
        lines.push('  node [shape=box, style=rounded];');
        lines.push('');
        
        // Add nodes with version labels
        for (const [id, extension] of this.extensions) {
            const version = extension.manifest.version;
            lines.push(`  "${id}" [label="${id}\\n${version}"];`);
        }
        
        lines.push('');
        
        // Add edges
        const graph = this.getDependencyGraph();
        for (const [id, deps] of Object.entries(graph)) {
            for (const dep of deps) {
                lines.push(`  "${id}" -> "${dep}";`);
            }
        }
        
        lines.push('}');
        
        return lines.join('\n');
    }
}

module.exports = ExtensionDependencyResolver;
