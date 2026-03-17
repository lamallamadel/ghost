#!/usr/bin/env node

/**
 * Ghost System Helper
 * System monitoring and environment management
 */

const { ExtensionSDK } = require('@ghost/extension-sdk');
const os = require('os');
const path = require('path');
const environment = require('../../core/environment.js');

const Colors = {
    GREEN: '\x1b[32m',
    WARNING: '\x1b[33m',
    FAIL: '\x1b[31m',
    CYAN: '\x1b[36m',
    BOLD: '\x1b[1m',
    ENDC: '\x1b[0m'
};

class SystemExtension {
    constructor(sdk) {
        this.sdk = sdk;
    }

    async handleStatus(params) {
        const mem = process.memoryUsage();
        const uptime = process.uptime();
        
        let output = `\n${Colors.BOLD}GHOST SYSTEM STATUS${Colors.ENDC}\n${'='.repeat(30)}\n`;
        output += `${Colors.CYAN}Runtime:${Colors.ENDC} Node.js ${process.version}\n`;
        output += `${Colors.CYAN}Platform:${Colors.ENDC} ${process.platform} (${os.arch()})\n`;
        output += `${Colors.CYAN}Memory Usage:${Colors.ENDC} ${Math.round(mem.rss / 1024 / 1024)}MB RSS\n`;
        output += `${Colors.CYAN}Uptime:${Colors.ENDC} ${Math.round(uptime)}s\n`;
        
        try {
            // Check audit log size via intent
            const logPath = path.join(os.homedir(), '.ghost', 'audit.log');
            const stats = await this.sdk.emitIntent({ type: 'filesystem', operation: 'stat', params: { path: logPath } });
            output += `${Colors.CYAN}Audit Log Size:${Colors.ENDC} ${Math.round(stats.size / 1024)}KB\n`;
        } catch (e) {
            output += `${Colors.WARNING}Audit log not accessible${Colors.ENDC}\n`;
        }

        return { success: true, output };
    }

    async handleLogs(params) {
        const level = params.args?.[0]?.toUpperCase() || 'INFO';
        const logPath = path.join(os.homedir(), '.ghost', 'audit.log');
        
        try {
            const content = await this.sdk.requestFileRead({ path: logPath });
            const lines = content.split('\n').filter(l => l.includes(level)).slice(-10);
            
            let output = `\n${Colors.BOLD}LATEST AUDIT LOGS (${level})${Colors.ENDC}\n${'='.repeat(30)}\n`;
            output += lines.length > 0 ? lines.join('\n') : "No matching log entries found.";
            
            return { success: true, output };
        } catch (error) {
            return { success: false, output: `Failed to read logs: ${error.message}` };
        }
    }

    async handleSanitize(params) {
        await this.sdk.requestLog({ level: 'info', message: 'Starting environment sanitization...' });

        const tempPath = path.join(os.homedir(), '.ghost', 'temp');
        let cleaned = 0;
        let errors = 0;

        try {
            let entries = [];
            try {
                entries = await this.sdk.emitIntent({
                    type: 'filesystem',
                    operation: 'readdir',
                    params: { path: tempPath }
                });
            } catch (e) {
                // Temp dir doesn't exist — nothing to clean
            }

            for (const entry of entries) {
                try {
                    await this.sdk.emitIntent({
                        type: 'filesystem',
                        operation: 'unlink',
                        params: { path: path.join(tempPath, entry) }
                    });
                    cleaned++;
                } catch (e) {
                    errors++;
                    await this.sdk.requestLog({ level: 'warn', message: `Could not remove temp file: ${entry}` });
                }
            }

            let output = `${Colors.GREEN}✓ Environment sanitized.${Colors.ENDC}\n`;
            output += `- Cleaned ${cleaned} file(s) from ~/.ghost/temp/\n`;
            if (errors > 0) {
                output += `${Colors.WARNING}- ${errors} file(s) could not be removed (check logs).${Colors.ENDC}\n`;
            }

            return { success: true, output, cleaned, errors };
        } catch (error) {
            return { success: false, output: `Sanitization failed: ${error.message}` };
        }
    }

    async handleDoctor(params) {
        await this.sdk.requestLog({ level: 'info', message: 'Running extended system health check...' });
        
        const checks = [
            { name: 'Ghost Config', path: path.join(os.homedir(), '.ghost', 'config') },
            { name: 'Audit Log', path: path.join(os.homedir(), '.ghost', 'audit.log') },
            { name: 'Marketplace Cache', path: path.join(os.homedir(), '.ghost', 'marketplace-cache') }
        ];

        let output = `\n${Colors.BOLD}GHOST SYSTEM DOCTOR${Colors.ENDC}\n${'='.repeat(30)}\n`;
        let allOk = true;

        for (const check of checks) {
            try {
                const stats = await this.sdk.emitIntent({ type: 'filesystem', operation: 'stat', params: { path: check.path } });
                output += `${Colors.GREEN}[OK]${Colors.ENDC} ${check.name} exists (${Math.round(stats.size / 1024)}KB)\n`;
            } catch (e) {
                output += `${Colors.FAIL}[FAIL]${Colors.ENDC} ${check.name} missing or inaccessible\n`;
                allOk = false;
            }
        }

        output += `\n${allOk ? Colors.GREEN + 'System is healthy.' : Colors.WARNING + 'Issues detected.'}${Colors.ENDC}\n`;
        return { success: true, output };
    }

    async handleAnalytics(params) {
        await this.sdk.requestLog({ level: 'info', message: 'Collecting resource analytics across extensions...' });
        
        const cpuUsage = process.cpuUsage();
        const mem = process.memoryUsage();
        
        let output = `\n${Colors.BOLD}GHOST RESOURCE ANALYTICS${Colors.ENDC}\n${'='.repeat(30)}\n`;
        output += `${Colors.CYAN}Total Ghost RSS:${Colors.ENDC} ${Math.round(mem.rss / 1024 / 1024)}MB\n`;
        output += `${Colors.CYAN}User CPU Time:${Colors.ENDC} ${Math.round(cpuUsage.user / 1000)}ms\n`;
        output += `${Colors.CYAN}System CPU Time:${Colors.ENDC} ${Math.round(cpuUsage.system / 1000)}ms\n\n`;
        
        output += `${Colors.BOLD}Extension Footprint${Colors.ENDC}\n`;
        // Per-extension RSS is available from core telemetry on port 9877 via WebSocket
        output += `  ${Colors.WARNING}Connect to ws://localhost:9877 for real-time per-extension metrics.${Colors.ENDC}\n`;
        output += `  ${Colors.CYAN}Run "ghost system status" for process-level metrics.${Colors.ENDC}\n`;
        
        return { success: true, output };
    }

    handleEnvShow(_params) {
        const name = environment.getActiveEnvironment();
        const envs = environment.listEnvironments();
        const current = envs.find(e => e.name === name) || { name, urls: {} };
        const source = process.env.GHOST_ENV ? ' (GHOST_ENV override)' : '';

        let output = `\n${Colors.BOLD}ACTIVE ENVIRONMENT${Colors.ENDC}\n${'='.repeat(30)}\n`;
        output += `${Colors.CYAN}Environment:${Colors.ENDC} ${Colors.BOLD}${name}${Colors.ENDC}${source}\n\n`;
        for (const [key, url] of Object.entries(current.urls)) {
            output += `${Colors.CYAN}${key}:${Colors.ENDC} ${url}\n`;
        }
        return { success: true, output };
    }

    handleEnvList(_params) {
        const envs = environment.listEnvironments();
        let output = `\n${Colors.BOLD}ENVIRONMENTS${Colors.ENDC}\n${'='.repeat(30)}\n`;
        for (const env of envs) {
            const marker = env.active ? `${Colors.GREEN}*${Colors.ENDC} ` : '  ';
            output += `${marker}${Colors.BOLD}${env.name}${Colors.ENDC}\n`;
            for (const [key, url] of Object.entries(env.urls)) {
                output += `      ${Colors.CYAN}${key}:${Colors.ENDC} ${url}\n`;
            }
        }
        return { success: true, output };
    }

    handleEnvUse(params) {
        const name = params.args?.[0];
        if (!name) return { success: false, output: 'Usage: ghost env use <name>' };
        try {
            environment.setActiveEnvironment(name);
            return { success: true, output: `${Colors.GREEN}✓ Switched to environment: ${name}${Colors.ENDC}\n` };
        } catch (err) {
            return { success: false, output: `${Colors.FAIL}Error: ${err.message}${Colors.ENDC}\n` };
        }
    }

    handleEnvSet(params) {
        const [key, url] = params.args || [];
        if (!key || !url) return { success: false, output: 'Usage: ghost env set <key> <url>' };
        const name = environment.getActiveEnvironment();
        try {
            environment.setEnvUrl(name, key, url);
            return { success: true, output: `${Colors.GREEN}✓ Set ${key}=${url} for environment '${name}'${Colors.ENDC}\n` };
        } catch (err) {
            return { success: false, output: `${Colors.FAIL}Error: ${err.message}${Colors.ENDC}\n` };
        }
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'sys.status': return await this.handleStatus(params);
                case 'sys.logs': return await this.handleLogs(params);
                case 'sys.sanitize': return await this.handleSanitize(params);
                case 'sys.doctor': return await this.handleDoctor(params);
                case 'sys.analytics': return await this.handleAnalytics(params);
                case 'env.show': return this.handleEnvShow(params);
                case 'env.list': return this.handleEnvList(params);
                case 'env.use':  return this.handleEnvUse(params);
                case 'env.set':  return this.handleEnvSet(params);
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { SystemExtension };
