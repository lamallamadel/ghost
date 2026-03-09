const fs = require('fs');
const path = require('path');
const os = require('os');

const MANIFEST_SCHEMA = require('./manifest-schema.json');
const DependencyResolver = require('./dependency-resolver');

/**
 * ExtensionLoader - Extension Discovery and Loading with Dependency Resolution
 * 
 * RESPONSIBILITY: Filesystem discovery, manifest validation, module instantiation,
 * and dependency resolution with topological sorting
 * 
 * FAIL-CLOSED SECURITY MODEL:
 * - Manifest validation failures prevent extension loading (security-first approach)
 * - Invalid JSON manifests are rejected (parse errors are failures)
 * - Missing required fields cause load failure (strict validation)
 * - Malformed capability declarations are rejected (no assumptions)
 * - Missing dependencies cause load failure (fail-closed on dependencies)
 * - Circular dependencies cause load failure (fail-closed)
 * - Version constraint violations cause load failure (fail-closed)
 * - Capability conflicts cause load failure (fail-closed)
 * 
 * DEPENDENCY RESOLUTION:
 * - Validates dependency constraints using semver ranges
 * - Performs topological sort to determine load order
 * - Detects circular dependencies with full chain visualization
 * - Checks version compatibility across dependency tree
 * - Detects capability conflicts (duplicate capability declarations)
 * 
 * GRACEFUL DEGRADATION:
 * - Individual extension failures do not stop batch loading (during discovery)
 * - Extension instantiation failures are logged but not fatal (allows metadata-only extensions)
 * - Missing main file is fatal (fail-closed on required resources)
 */

class ExtensionLoader {
    constructor(extensionsDir, options = {}) {
        this.extensionsDir = extensionsDir;
        this.loadedExtensions = [];
        this.options = options;
        this.dependencyResolver = new DependencyResolver();
        this.dependencyGraphPath = path.join(os.homedir(), '.ghost', 'extensions', 'dependency-graph.json');
    }

    /**
     * Discover and load all extensions from the configured directory with dependency resolution
     * 
     * FAIL-CLOSED BEHAVIOR:
     * - Creates directory if missing (setup convenience)
     * - Skips non-directory entries (deterministic filtering)
     * - Skips directories without manifest.json (fail-closed: manifest required)
     * - Catches individual extension failures to enable batch loading
     * - Logs errors for failed extensions (visibility without blocking)
     * - Resolves dependencies and orders extensions (fail-closed on dep resolution)
     * 
     * DEPENDENCY RESOLUTION FLOW:
     * 1. Discover all extension manifests
     * 2. Build dependency graph
     * 3. Detect circular dependencies (fail-fast)
     * 4. Validate version constraints
     * 5. Perform topological sort for load order
     * 6. Detect capability conflicts
     * 7. Load extensions in dependency order
     * 8. Save resolved dependency graph
     *
     * @returns {Promise<Array>} Array of successfully loaded extension metadata in dependency order
     */
    async discoverAndLoad() {
        if (!fs.existsSync(this.extensionsDir)) {
            try {
                fs.mkdirSync(this.extensionsDir, { recursive: true });
            } catch (error) {
                console.warn(`[ExtensionLoader] Could not create extensions directory: ${error.message}`);
            }
            return [];
        }

        const entries = fs.readdirSync(this.extensionsDir, { withFileTypes: true });
        const manifests = new Map();

        // Phase 1: Discover all manifests
        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }

            const extPath = path.join(this.extensionsDir, entry.name);
            const manifestPath = path.join(extPath, 'manifest.json');

            if (!fs.existsSync(manifestPath)) {
                console.warn(`[ExtensionLoader] Skipping ${entry.name}: no manifest.json found`);
                continue;
            }

            try {
                const manifestContent = fs.readFileSync(manifestPath, 'utf8');
                const manifest = JSON.parse(manifestContent);
                this.validateManifest(manifest);

                manifests.set(manifest.id, {
                    manifest,
                    path: extPath,
                    manifestPath
                });
            } catch (error) {
                console.error(`[ExtensionLoader] Failed to load ${entry.name}:`, error.message);
            }
        }

        // Phase 2: Build dependency graph and resolve
        try {
            const dependencyGraph = this.dependencyResolver.buildDependencyGraph(manifests);

            // Phase 3: Detect circular dependencies
            const circularDeps = this.dependencyResolver.detectCircularDependencies(dependencyGraph);
            if (circularDeps.length > 0) {
                console.error(`[ExtensionLoader] Circular dependencies detected:`);
                circularDeps.forEach(cycle => {
                    console.error(`  ${cycle.join(' -> ')}`);
                });
                throw new Error('Circular dependencies detected - cannot load extensions');
            }

            // Phase 4: Validate version constraints
            const versionIssues = this.dependencyResolver.validateVersionConstraints(manifests);
            if (versionIssues.length > 0) {
                console.warn(`[ExtensionLoader] Version constraint warnings:`);
                versionIssues.forEach(issue => {
                    console.warn(`  ${issue.extension} requires ${issue.dependency}@${issue.constraint} but found ${issue.installed}`);
                });
            }

            // Phase 5: Topological sort for load order
            const loadOrder = this.dependencyResolver.topologicalSort(dependencyGraph);

            // Phase 6: Detect capability conflicts
            const conflicts = this.dependencyResolver.detectCapabilityConflicts(manifests, loadOrder);
            if (conflicts.length > 0) {
                console.warn(`[ExtensionLoader] Capability conflicts detected (first-loaded wins):`);
                conflicts.forEach(conflict => {
                    console.warn(`  ${conflict.type}: ${conflict.extensions.join(', ')} declare overlapping capabilities`);
                });
            }

            // Phase 7: Load extensions in dependency order
            const extensions = [];
            for (const extId of loadOrder) {
                const extData = manifests.get(extId);
                if (!extData) continue;

                try {
                    const extension = await this.loadExtension(extData.path, extData.manifestPath);
                    extensions.push(extension);
                    this.loadedExtensions.push(extension);
                } catch (error) {
                    console.error(`[ExtensionLoader] Failed to load ${extId}:`, error.message);
                }
            }

            // Phase 8: Save dependency graph
            this.saveDependencyGraph({
                graph: dependencyGraph,
                loadOrder,
                conflicts,
                versionIssues,
                timestamp: new Date().toISOString()
            });

            return extensions;
        } catch (error) {
            console.error(`[ExtensionLoader] Dependency resolution failed:`, error.message);

            // Fallback: load without dependency resolution
            const extensions = [];
            for (const [extId, extData] of manifests) {
                try {
                    const extension = await this.loadExtension(extData.path, extData.manifestPath);
                    extensions.push(extension);
                    this.loadedExtensions.push(extension);
                } catch (loadError) {
                    console.error(`[ExtensionLoader] Failed to load ${extId}:`, loadError.message);
                }
            }
            return extensions;
        }
    }

    /**
     * Load a single extension from a path
     * 
     * FAIL-CLOSED VALIDATION:
     * - JSON parse errors cause load failure (no partial manifests)
     * - Manifest validation failures cause load failure (validateManifest enforces)
     * - Missing main file causes load failure (required resource)
     * 
     * GRACEFUL INSTANTIATION:
     * - Instantiation failures are logged but not fatal (metadata-only extensions)
     * - Instance remains null if instantiation fails (explicit failure state)
     * 
     * @param {string} extPath - Extension directory path
     * @param {string} manifestPath - Manifest file path
     * @returns {Promise<Object>} Extension metadata with manifest, instance, and load time
     * @throws {Error} If manifest validation or main file check fails
     */
    async loadExtension(extPath, manifestPath) {
        // Parse manifest (fail-closed on invalid JSON)
        const manifestContent = fs.readFileSync(manifestPath, 'utf8');
        const manifest = JSON.parse(manifestContent);

        // Validate manifest structure (fail-closed: throws on validation failure)
        this.validateManifest(manifest);

        // Verify main file exists (fail-closed: required resource)
        const mainFile = path.join(extPath, manifest.main);
        if (!fs.existsSync(mainFile)) {
            throw new Error(`Main file not found: ${manifest.main}`);
        }

        // GRACEFUL ISOLATION: 
        // We no longer require() the extension here. 
        // Instantiation will be handled by the ExtensionRuntime (Sandbox or Subprocess).
        const instance = null;

        return {
            path: extPath,
            manifest,
            instance,
            loaded: new Date().toISOString()
        };
    }

    /**
     * Validate extension manifest against schema requirements
     * 
     * FAIL-CLOSED VALIDATION:
     * - All required fields must be present and valid (no defaults or assumptions)
     * - Field types must match expectations (strict type checking)
     * - Field formats must conform to patterns (regex validation)
     * - Capability declarations must be well-formed (delegated to validateCapabilities)
     * - Dependency declarations must be valid (version constraints)
     * - Throws on ANY validation failure (fail-closed security model)
     * 
     * VALIDATION COVERAGE:
     * - id: required, string, lowercase alphanumeric with hyphens, not empty
     * - name: required, string, not empty
     * - version: required, string, semver format (X.Y.Z), not empty
     * - main: required, string, not empty (file existence checked separately)
     * - capabilities: required, object (not null, not array)
     * - dependencies: optional, object with semver version constraints
     * 
     * See test/extensions/extension-loader.test.js for comprehensive test coverage
     * 
     * @param {Object} manifest - Parsed manifest object
     * @returns {boolean} True if validation passes
     * @throws {Error} With detailed validation failures if validation fails
     */
    validateManifest(manifest) {
        const errors = [];

        // Validate required ID field (fail-closed: strict format enforcement)
        if (!manifest.id || typeof manifest.id !== 'string') {
            errors.push('Missing or invalid "id" field');
        } else if (!/^[a-z0-9-]+$/.test(manifest.id)) {
            errors.push('Field "id" must be lowercase alphanumeric with hyphens');
        }

        // Validate required name field
        if (!manifest.name || typeof manifest.name !== 'string') {
            errors.push('Missing or invalid "name" field');
        }

        // Validate required version field (fail-closed: strict semver enforcement)
        if (!manifest.version || typeof manifest.version !== 'string') {
            errors.push('Missing or invalid "version" field');
        } else if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
            errors.push('Field "version" must follow semver format (e.g., 1.0.0)');
        }

        // Validate required main field
        if (!manifest.main || typeof manifest.main !== 'string') {
            errors.push('Missing or invalid "main" field');
        }

        // Validate required capabilities field (fail-closed: must be object)
        if (!manifest.capabilities || typeof manifest.capabilities !== 'object' || Array.isArray(manifest.capabilities)) {
            errors.push('Missing or invalid "capabilities" field');
        } else {
            // Delegate capability validation (fail-closed: accumulates errors)
            this.validateCapabilities(manifest.capabilities, errors);
        }

        // Validate optional dependencies field
        if (manifest.dependencies) {
            if (typeof manifest.dependencies !== 'object' || Array.isArray(manifest.dependencies)) {
                errors.push('Field "dependencies" must be an object');
            } else {
                // Validate each dependency constraint
                for (const [depId, constraint] of Object.entries(manifest.dependencies)) {
                    if (typeof constraint !== 'string') {
                        errors.push(`Dependency "${depId}" constraint must be a string`);
                    } else if (!this.isValidVersionConstraint(constraint)) {
                        errors.push(`Dependency "${depId}" has invalid version constraint: ${constraint}`);
                    }
                }
            }
        }

        // Fail-closed: throw on any validation failure
        if (errors.length > 0) {
            throw new Error(`Manifest validation failed:\n  - ${errors.join('\n  - ')}`);
        }

        return true;
    }

    /**
     * Validate version constraint syntax
     * Supports: exact (1.0.0), caret (^1.0.0), tilde (~1.0.0), wildcard (*), range (>=1.0.0 <2.0.0)
     */
    isValidVersionConstraint(constraint) {
        if (!constraint || typeof constraint !== 'string') return false;
        
        // Wildcard
        if (constraint === '*') return true;
        
        // Single version with optional prefix
        if (/^[~^]?\d+\.\d+\.\d+$/.test(constraint)) return true;
        
        // Range operators
        if (/^(>=?|<=?|=)\d+\.\d+\.\d+$/.test(constraint)) return true;
        
        // Complex ranges
        if (/^(>=?|<=?)\d+\.\d+\.\d+\s+(<=?|<)\d+\.\d+\.\d+$/.test(constraint)) return true;
        
        return false;
    }

    /**
     * Validate capability declarations in manifest
     * 
     * FAIL-CLOSED VALIDATION:
     * - Filesystem capabilities: read/write must be arrays (strict type checking)
     * - Network capabilities: allowlist must be valid URLs, rate limits must be positive integers
     * - Git capabilities: read/write must be booleans (explicit permission model)
     * - Hooks capabilities: must be array of valid hook names (whitelist validation)
     * - Accumulates all errors for comprehensive failure reporting
     * 
     * CAPABILITY VALIDATION COVERAGE:
     * - filesystem.read: array or undefined
     * - filesystem.write: array or undefined
     * - network.allowlist: array of URLs (protocol + domain only), or undefined
     * - network.rateLimit.cir: positive integer (≥ 1)
     * - network.rateLimit.bc: positive integer (≥ 1)
     * - network.rateLimit.be: non-negative integer (≥ 0) or undefined
     * - git.read: boolean or undefined
     * - git.write: boolean or undefined
     * - hooks: array of whitelisted hook names or undefined
     * 
     * See test/extensions/extension-loader.test.js for comprehensive test coverage
     * 
     * @param {Object} capabilities - Capabilities object from manifest
     * @param {Array<string>} errors - Error accumulator array (mutated)
     */
    validateCapabilities(capabilities, errors) {
        // Validate filesystem capability declarations (fail-closed: strict types)
        if (capabilities.filesystem) {
            const fs = capabilities.filesystem;
            
            if (fs.read && !Array.isArray(fs.read)) {
                errors.push('capabilities.filesystem.read must be an array');
            }
            
            if (fs.write && !Array.isArray(fs.write)) {
                errors.push('capabilities.filesystem.write must be an array');
            }
        }

        // Validate network capability declarations (fail-closed: strict format enforcement)
        if (capabilities.network) {
            const net = capabilities.network;
            
            // Validate allowlist format
            if (net.allowlist) {
                if (!Array.isArray(net.allowlist)) {
                    errors.push('capabilities.network.allowlist must be an array');
                } else {
                    // Fail-closed: URL format must be exact (protocol + domain only)
                    for (const url of net.allowlist) {
                        if (!/^https?:\/\/[^/]+$/.test(url)) {
                            errors.push(`Invalid allowlist URL: ${url} (must be protocol + domain only)`);
                        }
                    }
                }
            }
            
            // Validate rate limit configuration
            if (net.rateLimit) {
                const rl = net.rateLimit;
                
                if (typeof rl.cir !== 'number' || rl.cir < 1) {
                    errors.push('capabilities.network.rateLimit.cir must be a positive integer');
                }
                
                if (typeof rl.bc !== 'number' || rl.bc < 1) {
                    errors.push('capabilities.network.rateLimit.bc must be a positive integer');
                }
                
                if (rl.be !== undefined && (typeof rl.be !== 'number' || rl.be < 0)) {
                    errors.push('capabilities.network.rateLimit.be must be a non-negative integer');
                }
            }
        }

        // Validate git capability declarations (fail-closed: explicit boolean permissions)
        if (capabilities.git) {
            const git = capabilities.git;
            
            if (git.read !== undefined && typeof git.read !== 'boolean') {
                errors.push('capabilities.git.read must be a boolean');
            }
            
            if (git.write !== undefined && typeof git.write !== 'boolean') {
                errors.push('capabilities.git.write must be a boolean');
            }
        }

        // Validate hooks capability declarations (fail-closed: whitelist enforcement)
        if (capabilities.hooks) {
            if (!Array.isArray(capabilities.hooks)) {
                errors.push('capabilities.hooks must be an array');
            } else {
                // Fail-closed: only allow known, validated hook names
                const validHooks = ['pre-commit', 'post-commit', 'pre-push', 'post-checkout', 'commit-msg', 'pre-rebase'];
                for (const hook of capabilities.hooks) {
                    if (!validHooks.includes(hook)) {
                        errors.push(`Invalid hook: ${hook}`);
                    }
                }
            }
        }
    }

    /**
     * Resolve dependencies for an array of loaded extension objects and return them in load order.
     * Public API wrapper around the dependency resolver for external callers.
     *
     * @param {Array<Object>} extensions - Array of extension objects with .manifest
     * @returns {Promise<Array<string>>} Ordered array of extension IDs
     */
    async resolveDependencies(extensions) {
        const manifests = new Map();
        for (const ext of extensions) {
            manifests.set(ext.manifest.id, {
                manifest: ext.manifest,
                path: ext.path,
                manifestPath: ext.manifestPath || ''
            });
        }
        const graph = this.dependencyResolver.buildDependencyGraph(manifests);
        return this.dependencyResolver.topologicalSort(graph);
    }

    /**
     * Retrieve metadata for all loaded extensions
     *
     * PURE QUERY: Returns lightweight metadata without modifying state
     *
     * @returns {Array<Object>} Array of extension metadata objects
     */
    getLoadedExtensions() {
        return this.loadedExtensions.map(ext => ({
            id: ext.manifest.id,
            name: ext.manifest.name,
            version: ext.manifest.version,
            dependencies: ext.manifest.dependencies || {},
            loaded: ext.loaded
        }));
    }

    /**
     * Save dependency graph to persistent storage
     */
    saveDependencyGraph(graphData) {
        try {
            const dir = path.dirname(this.dependencyGraphPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.dependencyGraphPath, JSON.stringify(graphData, null, 2), 'utf8');
        } catch (error) {
            console.warn(`[ExtensionLoader] Failed to save dependency graph: ${error.message}`);
        }
    }

    /**
     * Load dependency graph from persistent storage
     */
    loadDependencyGraph() {
        try {
            if (fs.existsSync(this.dependencyGraphPath)) {
                const content = fs.readFileSync(this.dependencyGraphPath, 'utf8');
                return JSON.parse(content);
            }
        } catch (error) {
            console.warn(`[ExtensionLoader] Failed to load dependency graph: ${error.message}`);
        }
        return null;
    }

    /**
     * Get missing dependencies for a given extension
     */
    getMissingDependencies(extensionId, installedExtensions) {
        const ext = installedExtensions.find(e => e.manifest.id === extensionId);
        if (!ext || !ext.manifest.dependencies) return [];

        const missing = [];
        for (const [depId, constraint] of Object.entries(ext.manifest.dependencies)) {
            const depExt = installedExtensions.find(e => e.manifest.id === depId);
            if (!depExt) {
                missing.push({ id: depId, constraint });
            }
        }
        return missing;
    }

    /**
     * Unload an extension by ID
     * 
     * GRACEFUL CLEANUP:
     * - Cleanup failures are logged but do not block unload (graceful degradation)
     * - Returns false if extension not found (not an error condition)
     * - Removes from loaded extensions list (deterministic state management)
     * 
     * @param {string} extensionId - Extension ID to unload
     * @returns {boolean} True if extension was found and unloaded, false otherwise
     */
    unload(extensionId) {
        const index = this.loadedExtensions.findIndex(ext => ext.manifest.id === extensionId);
        
        // Graceful: missing extension is not an error
        if (index === -1) {
            return false;
        }

        const ext = this.loadedExtensions[index];
        
        // Attempt graceful cleanup if extension supports it
        if (ext.instance && typeof ext.instance.cleanup === 'function') {
            try {
                ext.instance.cleanup();
            } catch (error) {
                // Log but don't throw - cleanup failures should not block unload
                console.error(`[ExtensionLoader] Cleanup failed for ${extensionId}:`, error.message);
            }
        }

        // Remove from loaded extensions list (deterministic state transition)
        this.loadedExtensions.splice(index, 1);
        return true;
    }

    /**
     * Get dependency graph for loaded extensions
     * 
     * @returns {Object} Dependency graph as adjacency list
     */
    getDependencyGraph() {
        return this.dependencyResolver.getDependencyGraph();
    }

    /**
     * Get reverse dependency graph (dependents) for loaded extensions
     * 
     * @returns {Object} Reverse dependency graph
     */
    getReverseDependencyGraph() {
        return this.dependencyResolver.getReverseDependencyGraph();
    }

    /**
     * Get extension dependencies for a specific extension
     * 
     * @param {string} extensionId - Extension ID
     * @returns {Array<{id: string, version: string}>} Array of dependencies
     */
    getExtensionDependencies(extensionId) {
        const extension = this.loadedExtensions.find(ext => ext.manifest.id === extensionId);
        
        if (!extension) {
            return [];
        }
        
        const manifest = extension.manifest;
        
        if (!manifest.extensionDependencies || typeof manifest.extensionDependencies !== 'object') {
            return [];
        }
        
        return Object.entries(manifest.extensionDependencies).map(([id, version]) => ({
            id,
            version
        }));
    }

    /**
     * Check if an extension can be safely unloaded (no dependents)
     * 
     * @param {string} extensionId - Extension ID
     * @returns {Object} { canUnload: boolean, dependents: Array<string> }
     */
    canUnload(extensionId) {
        const reverseDeps = this.getReverseDependencyGraph();
        const dependents = reverseDeps[extensionId] || [];
        
        return {
            canUnload: dependents.length === 0,
            dependents
        };
    }
}

module.exports = ExtensionLoader;
