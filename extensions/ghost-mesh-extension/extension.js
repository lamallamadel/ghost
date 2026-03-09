#!/usr/bin/env node

/**
 * Ghost Mesh Master
 * Service discovery and dependency management
 */

const { ExtensionSDK } = require('@ghost/extension-sdk');
const path = require('path');

const Colors = {
    GREEN: '\x1b[32m',
    CYAN: '\x1b[36m',
    BOLD: '\x1b[1m',
    WARNING: '\x1b[33m',
    FAIL: '\x1b[31m',
    ENDC: '\x1b[0m'
};

class MeshExtension {
    constructor(sdk) {
        this.sdk = sdk;
        this.services = new Map();
    }

    async handleRoutes(params) {
        await this.sdk.requestLog({ level: 'info', message: 'Discovering available services in Ghost Mesh...' });
        
        // 1. Scan extensions directory for manifests
        const extensionsDir = 'extensions';
        const serviceMap = {};

        try {
            const dirs = await this.sdk.emitIntent({ type: 'filesystem', operation: 'readdir', params: { path: extensionsDir } });
            
            for (const dir of dirs) {
                try {
                    const manifestPath = path.join(extensionsDir, dir, 'manifest.json');
                    const content = await this.sdk.requestFileRead({ path: manifestPath });
                    const manifest = JSON.parse(content);
                    
                    // Map commands as services
                    if (manifest.commands) {
                        for (const cmd of manifest.commands) {
                            const serviceName = `${manifest.id.split('-')[1] || 'core'}:${cmd}`;
                            serviceMap[serviceName] = {
                                provider: manifest.id,
                                version: manifest.version,
                                type: 'command'
                            };
                        }
                    }
                } catch (e) { /* Skip invalid extensions */ }
            }

            let output = `\n${Colors.BOLD}GHOST SERVICE ROUTES${Colors.ENDC}\n${'='.repeat(30)}\n`;
            for (const [service, info] of Object.entries(serviceMap)) {
                output += `${Colors.CYAN}${service.padEnd(20)}${Colors.ENDC} → ${info.provider} (${info.version})\n`;
            }

            return { success: true, output, services: serviceMap };
        } catch (error) {
            return { success: false, output: `Discovery failed: ${error.message}` };
        }
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'mesh.routes': return await this.handleRoutes(params);
                case 'mesh.map': return { success: true, output: 'Dependency mapping pending Phase 2.' };
                case 'mesh.health': return { success: true, output: 'Health monitoring pending Phase 2.' };
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { MeshExtension };
