#!/usr/bin/env node

/**
 * Ghost Desktop Extension
 * Manages the Desktop Console UI and unifies it with the CLI
 */

const { ExtensionSDK } = require('@ghost/extension-sdk');
const os = require('os');
const path = require('path');

const Colors = {
    GREEN: '\x1b[32m',
    CYAN: '\x1b[36m',
    BOLD: '\x1b[1m',
    WARNING: '\x1b[33m',
    FAIL: '\x1b[31m',
    ENDC: '\x1b[0m'
};

// Path to the desktop app relative to the Ghost CLI root
const DESKTOP_DIR = path.resolve(__dirname, '..', '..', 'desktop');
// PID file written by the desktop process to allow status checks
const DESKTOP_PID_PATH = path.join(os.homedir(), '.ghost', 'desktop.pid');

class DesktopExtension {
    constructor(sdk) {
        this.sdk = sdk;
    }

    async handleConsole(params) {
        const subcommand = params.subcommand || params.args?.[0] || 'start';
        const flags = params.flags || {};

        if (subcommand === 'start') {
            return await this._startConsole(flags);
        }

        if (subcommand === 'stop') {
            return await this._stopConsole();
        }

        return { success: false, output: `Unknown subcommand: ${subcommand}. Use start|stop.` };
    }

    async _startConsole(flags) {
        await this.sdk.requestLog({ level: 'info', message: 'Starting Ghost Desktop Console...' });

        // 1. Request telemetry server start from core
        try {
            await this.sdk.emitIntent({
                type: 'system',
                operation: 'telemetry-start',
                params: { port: parseInt(flags.port) || 9877 }
            });
        } catch (e) {
            await this.sdk.requestLog({ level: 'warn', message: `Telemetry server may already be running: ${e.message}` });
        }

        // 2. Launch Electron unless --no-ui
        if (!flags['no-ui']) {
            try {
                await this.sdk.emitIntent({
                    type: 'process',
                    operation: 'spawn',
                    params: {
                        command: 'npm',
                        args: ['run', 'desktop:dev'],
                        options: { cwd: DESKTOP_DIR, detached: true }
                    }
                });
                return {
                    success: true,
                    output: `${Colors.GREEN}✓ Ghost Desktop Console launched from ${DESKTOP_DIR}${Colors.ENDC}`
                };
            } catch (error) {
                return {
                    success: false,
                    output: `${Colors.FAIL}Failed to launch Desktop Console:${Colors.ENDC} ${error.message}\n` +
                        `Make sure the desktop app is installed: cd ${DESKTOP_DIR} && npm install`
                };
            }
        }

        return { success: true, output: `${Colors.GREEN}✓ Telemetry server requested on port ${flags.port || 9877}.${Colors.ENDC}` };
    }

    async _stopConsole() {
        try {
            const pidStr = await this.sdk.requestFileRead({ path: DESKTOP_PID_PATH });
            const pid = parseInt(pidStr.trim());
            if (pid) {
                await this.sdk.emitIntent({
                    type: 'process',
                    operation: 'kill',
                    params: { pid }
                });
                return { success: true, output: `${Colors.GREEN}✓ Desktop Console stopped (PID ${pid}).${Colors.ENDC}` };
            }
        } catch (e) {
            // PID file not found or kill failed
        }
        return { success: false, output: `${Colors.WARNING}Desktop Console does not appear to be running.${Colors.ENDC}` };
    }

    async handleStatus(params) {
        let output = `\n${Colors.BOLD}DESKTOP CONSOLE STATUS${Colors.ENDC}\n${'='.repeat(35)}\n`;

        // Check if PID file exists and process is alive
        try {
            const pidStr = await this.sdk.requestFileRead({ path: DESKTOP_PID_PATH });
            const pid = parseInt(pidStr.trim());
            output += `${Colors.CYAN}Process PID:${Colors.ENDC} ${pid}\n`;
            output += `${Colors.GREEN}Status: RUNNING${Colors.ENDC}\n`;
        } catch (e) {
            output += `${Colors.WARNING}Status: NOT RUNNING${Colors.ENDC}\n`;
            output += `Run "ghost desktop console start" to launch the console.\n`;
        }

        // Check if desktop app exists
        try {
            await this.sdk.emitIntent({
                type: 'filesystem',
                operation: 'stat',
                params: { path: path.join(DESKTOP_DIR, 'package.json') }
            });
            output += `${Colors.CYAN}Desktop app:${Colors.ENDC} Found at ${DESKTOP_DIR}\n`;
        } catch (e) {
            output += `${Colors.FAIL}Desktop app: NOT FOUND at ${DESKTOP_DIR}${Colors.ENDC}\n`;
        }

        return { success: true, output };
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'desktop.console': return await this.handleConsole(params);
                case 'desktop.status': return await this.handleStatus(params);
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { DesktopExtension };
