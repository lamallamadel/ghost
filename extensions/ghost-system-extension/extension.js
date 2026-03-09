#!/usr/bin/env node

/**
 * Ghost System Helper
 * System monitoring and environment management
 */

const { ExtensionSDK } = require('@ghost/extension-sdk');
const os = require('os');
const path = require('path');

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

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'sys.status': return await this.handleStatus(params);
                case 'sys.logs': return await this.handleLogs(params);
                case 'sys.sanitize': return { success: true, output: 'Sanitization pending Phase 2.' };
                case 'sys.doctor': return { success: true, output: 'Extended doctor pending Phase 2.' };
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { SystemExtension };
