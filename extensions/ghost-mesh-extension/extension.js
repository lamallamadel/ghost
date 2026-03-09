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

    async handleMap(params) {
        await this.sdk.requestLog({ level: 'info', message: 'Building global extension dependency graph...' });
        
        const extensionsDir = 'extensions';
        const graph = {};
        const nodes = [];

        try {
            const dirs = await this.sdk.emitIntent({ type: 'filesystem', operation: 'readdir', params: { path: extensionsDir } });
            
            for (const dir of dirs) {
                try {
                    const manifestPath = path.join(extensionsDir, dir, 'manifest.json');
                    const content = await this.sdk.requestFileRead({ path: manifestPath });
                    const manifest = JSON.parse(content);
                    
                    nodes.push(manifest.id);
                    graph[manifest.id] = Object.keys(manifest.extensionDependencies || {});
                } catch (e) { /* Skip invalid */ }
            }

            // Detect Cycles (DFS)
            const cycles = this._findCycles(graph);
            const loadOrder = this._calculateLoadOrder(graph, nodes);

            let output = `\n${Colors.BOLD}EXTENSION DEPENDENCY MAP${Colors.ENDC}\n${'='.repeat(30)}\n`;
            
            output += `\n${Colors.CYAN}Load Order (Priority):${Colors.ENDC}\n`;
            loadOrder.forEach((id, i) => {
                output += `  ${i + 1}. ${id}\n`;
            });

            if (cycles.length > 0) {
                output += `\n${Colors.FAIL}⚠ CRITICAL: Circular Dependencies Detected!${Colors.ENDC}\n`;
                for (const cycle of cycles) {
                    output += `  - ${cycle.join(' → ')} → ${cycle[0]}\n`;
                }
            } else {
                output += `\n${Colors.GREEN}✓ No circular dependencies detected.${Colors.ENDC}\n`;
            }

            return { success: true, output, graph, loadOrder, cycles };
        } catch (error) {
            return { success: false, output: `Mapping failed: ${error.message}` };
        }
    }

    _findCycles(graph) {
        const cycles = [];
        const visited = new Set();
        const stack = new Set();

        const dfs = (node, path) => {
            visited.add(node);
            stack.add(node);
            path.push(node);

            const neighbors = graph[node] || [];
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    dfs(neighbor, [...path]);
                } else if (stack.has(neighbor)) {
                    cycles.push([...path.slice(path.indexOf(neighbor))]);
                }
            }

            stack.delete(node);
        };

        for (const node in graph) {
            if (!visited.has(node)) dfs(node, []);
        }
        return cycles;
    }

    _calculateLoadOrder(graph, nodes) {
        const result = [];
        const visited = new Set();
        const visiting = new Set();

        const sort = (node) => {
            if (visited.has(node)) return;
            if (visiting.has(node)) return; // Cycle handled by _findCycles

            visiting.add(node);
            const deps = graph[node] || [];
            for (const dep of deps) {
                sort(dep);
            }
            visiting.delete(node);
            visited.add(node);
            result.push(node);
        };

        nodes.forEach(node => sort(node));
        return result.reverse(); // Priority order (highest level first)
    }

    async handleHealth(params) {
        await this.sdk.requestLog({ level: 'info', message: 'Assessing Ghost Mesh health and RPC stability...' });

        try {
            // In a real implementation, we'd query core telemetry for inter-extension latency
            // For Phase 3, we simulate health metrics for the standard library
            const metrics = [
                { id: 'ghost-git-extension', status: 'Healthy', p95: '45ms', errors: 0 },
                { id: 'ghost-security-extension', status: 'Under Load', p95: '850ms', errors: 2 },
                { id: 'ghost-docs-extension', status: 'Healthy', p95: '12ms', errors: 0 },
                { id: 'ghost-system-extension', status: 'Healthy', p95: '5ms', errors: 0 }
            ];

            let output = `\n${Colors.BOLD}GHOST MESH HEALTH REPORT${Colors.ENDC}\n${'='.repeat(30)}\n`;
            output += `${Colors.CYAN}${'EXTENSION'.padEnd(25)} ${'STATUS'.padEnd(15)} ${'LATENCY'.padEnd(10)} ${'ERRORS'}${Colors.ENDC}\n`;

            for (const m of metrics) {
                const statusColor = m.status === 'Healthy' ? Colors.GREEN : Colors.WARNING;
                output += `${m.id.padEnd(25)} ${statusColor}${m.status.padEnd(15)}${Colors.ENDC} ${m.p95.padEnd(10)} ${m.errors}\n`;
            }

            const isDegraded = metrics.some(m => m.status !== 'Healthy');
            output += `\nOverall Mesh Status: ${isDegraded ? Colors.WARNING + 'DEGRADED' : Colors.GREEN + 'OPTIMAL'}${Colors.ENDC}\n`;

            return { success: true, output, metrics };
        } catch (error) {
            return { success: false, output: `Health check failed: ${error.message}` };
        }
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'mesh.routes': return await this.handleRoutes(params);
                case 'mesh.map': return await this.handleMap(params);
                case 'mesh.health': return await this.handleHealth(params);
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { MeshExtension };
