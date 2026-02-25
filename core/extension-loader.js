const fs = require('fs');
const path = require('path');

const MANIFEST_SCHEMA = require('./manifest-schema.json');

/**
 * ExtensionLoader - Extension Discovery and Loading
 * 
 * RESPONSIBILITY: Filesystem discovery, manifest validation, and module instantiation
 * 
 * FAIL-CLOSED SECURITY MODEL:
 * - Manifest validation failures prevent extension loading (security-first approach)
 * - Invalid JSON manifests are rejected (parse errors are failures)
 * - Missing required fields cause load failure (strict validation)
 * - Malformed capability declarations are rejected (no assumptions)
 * 
 * GRACEFUL DEGRADATION:
 * - Individual extension failures do not stop batch loading
 * - Extension instantiation failures are logged but not fatal (allows metadata-only extensions)
 * - Missing main file is fatal (fail-closed on required resources)
 */

class ExtensionLoader {
    constructor(extensionsDir) {
        this.extensionsDir = extensionsDir;
        this.loadedExtensions = [];
    }

    /**
     * Discover and load all extensions from the configured directory
     * 
     * FAIL-CLOSED BEHAVIOR:
     * - Creates directory if missing (setup convenience)
     * - Skips non-directory entries (deterministic filtering)
     * - Skips directories without manifest.json (fail-closed: manifest required)
     * - Catches individual extension failures to enable batch loading
     * - Logs errors for failed extensions (visibility without blocking)
     * 
     * @returns {Promise<Array>} Array of successfully loaded extension metadata
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
        const extensions = [];

        for (const entry of entries) {
            // Deterministic filtering: only process directories
            if (!entry.isDirectory()) {
                continue;
            }

            const extPath = path.join(this.extensionsDir, entry.name);
            const manifestPath = path.join(extPath, 'manifest.json');

            // Fail-closed: manifest.json is required
            if (!fs.existsSync(manifestPath)) {
                console.warn(`[ExtensionLoader] Skipping ${entry.name}: no manifest.json found`);
                continue;
            }

            try {
                // Delegate to loadExtension (fail-closed validation inside)
                const extension = await this.loadExtension(extPath, manifestPath);
                extensions.push(extension);
                this.loadedExtensions.push(extension);
            } catch (error) {
                // Graceful degradation: log but continue loading other extensions
                console.error(`[ExtensionLoader] Failed to load ${entry.name}:`, error.message);
            }
        }

        return extensions;
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

        // Attempt to instantiate extension module (graceful: allows metadata-only)
        let instance = null;
        try {
            const ExtensionModule = require(mainFile);
            instance = typeof ExtensionModule === 'function' ? new ExtensionModule() : ExtensionModule;
        } catch (error) {
            // Graceful degradation: log warning but continue (allows metadata-only extensions)
            console.warn(`[ExtensionLoader] Could not instantiate ${manifest.id}:`, error.message);
        }

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
     * - Throws on ANY validation failure (fail-closed security model)
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
        if (!manifest.capabilities || typeof manifest.capabilities !== 'object') {
            errors.push('Missing or invalid "capabilities" field');
        } else {
            // Delegate capability validation (fail-closed: accumulates errors)
            this.validateCapabilities(manifest.capabilities, errors);
        }

        // Fail-closed: throw on any validation failure
        if (errors.length > 0) {
            throw new Error(`Manifest validation failed:\n  - ${errors.join('\n  - ')}`);
        }

        return true;
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
            loaded: ext.loaded
        }));
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
}

module.exports = ExtensionLoader;
