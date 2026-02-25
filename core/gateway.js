#!/usr/bin/env node

/**
 * Gateway - Pure Extension Orchestration Layer
 * 
 * RESPONSIBILITY: Extension discovery, registry management, and deterministic routing
 * 
 * ARCHITECTURE:
 * - ZERO business logic - delegates all domain operations to extensions and pipeline layers
 * - FAIL-CLOSED security model - manifest validation failures prevent extension loading
 * - Deterministic routing - user extensions override bundled, first-registered wins
 * 
 * ORCHESTRATION FLOW:
 * 1. Discovery Phase
 *    - Delegates to ExtensionLoader for filesystem discovery
 *    - Loader validates manifests (fail-closed on validation failure)
 *    - Loader instantiates extension modules
 * 
 * 2. Registry Phase
 *    - Maintains in-memory Map of extension ID → extension metadata
 *    - User extensions take precedence over bundled extensions (deterministic collision resolution)
 *    - No modification of extension instances (pure orchestration)
 * 
 * 3. Routing Phase
 *    - Routes execution requests to registered extension instances
 *    - Validates extension existence and method availability
 *    - Delegates actual execution to extension instance (zero business logic)
 * 
 * FAIL-CLOSED ERROR HANDLING:
 * - Manifest validation failures: Extension is NOT loaded (ExtensionLoader enforces)
 * - Missing extension instance: Logs warning but completes loading (allows metadata-only extensions)
 * - Invalid method invocation: Throws error (caller must handle)
 * - Cleanup failures: Logged but do not block shutdown (graceful degradation)
 * 
 * DETERMINISTIC ROUTING BEHAVIOR:
 * - Extension ID collisions: First registered wins (user extensions loaded before bundled)
 * - Method resolution: Direct delegation to extension instance (no interception)
 * - Registry order: Insertion order preserved via Map (predictable iteration)
 * - Shutdown order: All extensions cleaned up in parallel (independent operations)
 */

const path = require('path');
const ExtensionLoader = require('./extension-loader');

class Gateway {
    /**
     * Initialize Gateway orchestrator
     * 
     * @param {Object} options - Configuration options
     * @param {string} options.extensionsDir - User extensions directory path
     * @param {string} options.bundledExtensionsDir - Bundled extensions directory path (optional)
     */
    constructor(options = {}) {
        this.options = {
            extensionsDir: options.extensionsDir || path.join(require('os').homedir(), '.ghost', 'extensions'),
            bundledExtensionsDir: options.bundledExtensionsDir || null,
            ...options
        };
        
        // Delegate discovery to ExtensionLoader (separation of concerns)
        this.loader = new ExtensionLoader(this.options.extensionsDir);
        this.bundledLoader = this.options.bundledExtensionsDir 
            ? new ExtensionLoader(this.options.bundledExtensionsDir)
            : null;
        
        // Extension registry: Map<extensionId, extensionMetadata>
        // Preserves insertion order for deterministic behavior
        this.extensions = new Map();
    }

    /**
     * Initialize Gateway by discovering and registering extensions
     * 
     * ORCHESTRATION SEQUENCE:
     * 1. Discover user extensions via ExtensionLoader (fail-closed manifest validation)
     * 2. Register user extensions in registry (first-registered)
     * 3. Discover bundled extensions via ExtensionLoader (fail-closed manifest validation)
     * 4. Register bundled extensions only if not already registered (deterministic collision resolution)
     * 
     * FAIL-CLOSED BEHAVIOR:
     * - ExtensionLoader.discoverAndLoad() catches individual extension failures
     * - Invalid manifests are rejected during validation (not loaded into registry)
     * - Gateway continues loading valid extensions (graceful degradation)
     * 
     * @returns {Object} Initialization result with loaded extension count and IDs
     */
    async initialize() {
        // Delegate discovery to ExtensionLoader (no business logic here)
        const loadedExtensions = await this.loader.discoverAndLoad();
        
        // Register user extensions (first-registered priority)
        for (const ext of loadedExtensions) {
            this.extensions.set(ext.manifest.id, ext);
        }
        
        // Load bundled extensions if configured
        if (this.bundledLoader) {
            const bundledExtensions = await this.bundledLoader.discoverAndLoad();
            
            // Deterministic collision resolution: skip if already registered
            for (const ext of bundledExtensions) {
                if (!this.extensions.has(ext.manifest.id)) {
                    this.extensions.set(ext.manifest.id, ext);
                }
            }
        }
        
        // Pure orchestration: return metadata only (no side effects)
        return {
            success: true,
            loaded: this.extensions.size,
            extensions: Array.from(this.extensions.keys())
        };
    }

    /**
     * Retrieve extension metadata from registry
     * 
     * PURE ORCHESTRATION: Returns reference without modification
     * 
     * @param {string} id - Extension ID
     * @returns {Object|undefined} Extension metadata or undefined if not found
     */
    getExtension(id) {
        return this.extensions.get(id);
    }

    /**
     * List all registered extensions with metadata
     * 
     * PURE ORCHESTRATION: Maps registry to lightweight metadata objects
     * 
     * @returns {Array<Object>} Array of extension metadata objects
     */
    listExtensions() {
        return Array.from(this.extensions.values()).map(ext => ({
            id: ext.manifest.id,
            name: ext.manifest.name,
            version: ext.manifest.version,
            capabilities: ext.manifest.capabilities
        }));
    }

    /**
     * Execute a method on a registered extension instance
     * 
     * PURE ROUTING: Validates and delegates, implements ZERO business logic
     * 
     * DETERMINISTIC BEHAVIOR:
     * - Looks up extension by exact ID match
     * - Validates instance and method existence (fail-closed)
     * - Delegates execution to extension instance (no interception or transformation)
     * 
     * FAIL-CLOSED ERROR HANDLING:
     * - Missing extension: Throws error immediately
     * - Missing instance: Throws error immediately
     * - Missing method: Throws error immediately
     * - Execution errors: Propagated to caller (no swallowing)
     * 
     * @param {string} id - Extension ID
     * @param {string} method - Method name to invoke
     * @param {...any} args - Arguments to pass to method
     * @returns {Promise<any>} Result from extension method
     * @throws {Error} If extension, instance, or method not found
     */
    async executeExtension(id, method, ...args) {
        const ext = this.extensions.get(id);
        
        // Fail-closed: Extension must exist
        if (!ext) {
            throw new Error(`Extension not found: ${id}`);
        }

        // Fail-closed: Instance must exist and have requested method
        if (!ext.instance || typeof ext.instance[method] !== 'function') {
            throw new Error(`Method ${method} not found in extension ${id}`);
        }

        // Pure delegation: Execute method without transformation or interception
        return await ext.instance[method](...args);
    }

    /**
     * Unload an extension from the registry
     * 
     * ORCHESTRATION WITH GRACEFUL CLEANUP:
     * - Invokes cleanup if available (optional lifecycle hook)
     * - Removes from registry (deterministic state management)
     * - Returns success status (no exceptions on missing extension)
     * 
     * @param {string} id - Extension ID
     * @returns {boolean} True if extension was found and unloaded, false otherwise
     */
    unloadExtension(id) {
        const ext = this.extensions.get(id);
        
        // Graceful degradation: Missing extension is not an error
        if (!ext) {
            return false;
        }

        // Attempt graceful cleanup if extension supports it
        if (ext.instance && typeof ext.instance.cleanup === 'function') {
            try {
                ext.instance.cleanup();
            } catch (error) {
                // Log but don't throw - cleanup failures should not block unload
                console.warn(`[Gateway] Cleanup failed for ${id}: ${error.message}`);
            }
        }

        // Remove from registry (deterministic state transition)
        this.extensions.delete(id);
        return true;
    }

    /**
     * Shutdown gateway and cleanup all registered extensions
     * 
     * ORCHESTRATION WITH GRACEFUL SHUTDOWN:
     * - Iterates all registered extensions
     * - Invokes cleanup for each (if available)
     * - Clears registry (deterministic final state)
     * - Does not throw on individual cleanup failures (graceful degradation)
     */
    shutdown() {
        for (const [id, ext] of this.extensions) {
            // Attempt graceful cleanup if extension supports it
            if (ext.instance && typeof ext.instance.cleanup === 'function') {
                try {
                    ext.instance.cleanup();
                } catch (error) {
                    // Log but don't throw - cleanup failures should not block shutdown
                    console.warn(`[Gateway] Cleanup failed for ${id}: ${error.message}`);
                }
            }
        }
        
        // Clear registry (deterministic final state)
        this.extensions.clear();
    }
}

module.exports = Gateway;
