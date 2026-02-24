#!/usr/bin/env node

/**
 * Validates the extension manifest.json
 */

const fs = require('fs');
const path = require('path');

function validateManifest(manifestPath) {
    console.log('Validating manifest.json...\n');
    
    const errors = [];
    const warnings = [];
    
    // Check if file exists
    if (!fs.existsSync(manifestPath)) {
        errors.push('manifest.json not found');
        return { valid: false, errors, warnings };
    }
    
    // Parse JSON
    let manifest;
    try {
        const content = fs.readFileSync(manifestPath, 'utf8');
        manifest = JSON.parse(content);
    } catch (e) {
        errors.push(`Invalid JSON: ${e.message}`);
        return { valid: false, errors, warnings };
    }
    
    // Required fields
    const requiredFields = ['name', 'version', 'description', 'main', 'permissions'];
    requiredFields.forEach(field => {
        if (!manifest[field]) {
            errors.push(`Missing required field: ${field}`);
        }
    });
    
    if (errors.length > 0) {
        return { valid: false, errors, warnings };
    }
    
    // Validate name
    if (!/^[a-z0-9-]+$/.test(manifest.name)) {
        errors.push('Name must contain only lowercase letters, numbers, and hyphens');
    }
    
    // Validate version (semver)
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
        errors.push('Version must be in semver format (x.y.z)');
    }
    
    // Validate main file exists
    const mainPath = path.join(path.dirname(manifestPath), manifest.main);
    if (!fs.existsSync(mainPath)) {
        errors.push(`Main file not found: ${manifest.main}`);
    }
    
    // Validate permissions structure
    if (!manifest.permissions || typeof manifest.permissions !== 'object') {
        errors.push('Permissions must be an object');
        return { valid: false, errors, warnings };
    }
    
    // Validate filesystem permissions
    if (manifest.permissions.filesystem) {
        const fs = manifest.permissions.filesystem;
        
        if (!Array.isArray(fs.read)) {
            errors.push('filesystem.read must be an array');
        } else if (fs.read.length === 0) {
            warnings.push('filesystem.read is empty');
        }
        
        if (!Array.isArray(fs.write)) {
            errors.push('filesystem.write must be an array');
        } else if (fs.write.length === 0) {
            warnings.push('filesystem.write is empty - extension cannot write files');
        }
    } else {
        warnings.push('No filesystem permissions declared');
    }
    
    // Validate network permissions
    if (manifest.permissions.network) {
        const net = manifest.permissions.network;
        
        if (!Array.isArray(net.allowed_hosts)) {
            errors.push('network.allowed_hosts must be an array');
        } else {
            net.allowed_hosts.forEach(host => {
                if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) {
                    warnings.push(`Potentially invalid hostname: ${host}`);
                }
            });
        }
        
        if (!Array.isArray(net.protocols)) {
            errors.push('network.protocols must be an array');
        } else {
            const validProtocols = ['http', 'https'];
            net.protocols.forEach(proto => {
                if (!validProtocols.includes(proto)) {
                    errors.push(`Invalid protocol: ${proto}`);
                }
                if (proto === 'http') {
                    warnings.push('HTTP is not secure - consider using HTTPS only');
                }
            });
        }
    } else {
        warnings.push('No network permissions declared - extension cannot make network requests');
    }
    
    // Validate rate limits
    if (manifest.permissions.rateLimits) {
        const rl = manifest.permissions.rateLimits;
        
        const rateFields = ['CIR', 'Bc', 'Be'];
        rateFields.forEach(field => {
            if (!rl[field]) {
                errors.push(`Missing rate limit field: ${field}`);
            } else {
                // Validate format (e.g., "100KB/s", "500KB", "1MB")
                if (!/^\d+[KMG]B(\/s)?$/.test(rl[field])) {
                    errors.push(`Invalid rate limit format for ${field}: ${rl[field]}`);
                }
            }
        });
    } else {
        if (manifest.permissions.network) {
            warnings.push('Network permissions declared but no rate limits specified');
        }
    }
    
    // Validate capabilities (optional)
    if (manifest.capabilities) {
        if (typeof manifest.capabilities !== 'object') {
            errors.push('Capabilities must be an object');
        }
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings,
        manifest
    };
}

function printResults(result) {
    if (result.errors.length > 0) {
        console.log('❌ Validation failed!\n');
        console.log('Errors:');
        result.errors.forEach(err => console.log(`  - ${err}`));
        console.log();
    }
    
    if (result.warnings.length > 0) {
        console.log('⚠️  Warnings:');
        result.warnings.forEach(warn => console.log(`  - ${warn}`));
        console.log();
    }
    
    if (result.valid) {
        console.log('✅ Manifest is valid!\n');
        
        if (result.manifest) {
            console.log('Extension Info:');
            console.log(`  Name: ${result.manifest.name}`);
            console.log(`  Version: ${result.manifest.version}`);
            console.log(`  Description: ${result.manifest.description}`);
            console.log(`  Main: ${result.manifest.main}`);
            
            if (result.manifest.permissions.filesystem) {
                const fs = result.manifest.permissions.filesystem;
                console.log(`\nFilesystem:`);
                console.log(`  Read patterns: ${fs.read.length}`);
                console.log(`  Write patterns: ${fs.write.length}`);
            }
            
            if (result.manifest.permissions.network) {
                const net = result.manifest.permissions.network;
                console.log(`\nNetwork:`);
                console.log(`  Allowed hosts: ${net.allowed_hosts.join(', ')}`);
                console.log(`  Protocols: ${net.protocols.join(', ')}`);
            }
            
            if (result.manifest.permissions.rateLimits) {
                const rl = result.manifest.permissions.rateLimits;
                console.log(`\nRate Limits:`);
                console.log(`  CIR: ${rl.CIR}`);
                console.log(`  Bc: ${rl.Bc}`);
                console.log(`  Be: ${rl.Be}`);
            }
        }
    }
}

if (require.main === module) {
    const manifestPath = path.join(__dirname, 'manifest.json');
    const result = validateManifest(manifestPath);
    printResults(result);
    process.exit(result.valid ? 0 : 1);
}

module.exports = { validateManifest, printResults };
