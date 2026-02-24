#!/usr/bin/env node

/**
 * Ghost Git Extension - Main Entry Point
 * Exports all public APIs for use by Ghost CLI core
 */

const { createExtension, ExtensionRPCClient, GitExtension } = require('./extension.js');
const { validateManifest } = require('./validate-manifest.js');
const fs = require('fs');
const path = require('path');

// Load and validate manifest on import
const manifestPath = path.join(__dirname, 'manifest.json');
let manifest = null;

try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (e) {
    console.error('Failed to load manifest:', e.message);
}

// Validate manifest
if (manifest) {
    const validation = validateManifest(manifestPath);
    if (!validation.valid) {
        console.error('Invalid manifest detected:');
        validation.errors.forEach(err => console.error(`  - ${err}`));
    }
}

module.exports = {
    // Core exports
    createExtension,
    ExtensionRPCClient,
    GitExtension,
    
    // Manifest
    manifest,
    
    // Utilities
    validateManifest,
    
    // Version
    version: manifest ? manifest.version : 'unknown',
    name: manifest ? manifest.name : 'ghost-git-extension',
    
    // Extension info
    getInfo: () => ({
        name: manifest?.name || 'ghost-git-extension',
        version: manifest?.version || 'unknown',
        description: manifest?.description || '',
        capabilities: manifest?.capabilities || {},
        permissions: manifest?.permissions || {}
    })
};
