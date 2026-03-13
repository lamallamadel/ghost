#!/usr/bin/env node

/**
 * Ghost Process Supervisor
 * Headless OS process management with strict semaphore locking
 */

const path = require('path');
const os = require('os');

function loadExtensionSdk() {
    try {
        return require('@ghost/extension-sdk');
    } catch (error) {
        return require('../../packages/extension-sdk');
    }
}

const { ExtensionSDK } = loadExtensionSdk();

const Colors = {
    GREEN: '\x1b[32m',
    CYAN: '\x1b[36m',
    BOLD: '\x1b[1m',
    WARNING: '\x1b[33m',
    FAIL: '\x1b[31m',
    ENDC: '\x1b[0m',
    DIM: '\x1b[2m'
};

class ProcessExtension {
    constructor(sdk) {
        this.sdk = sdk;
        this.runDir = path.join(os.homedir(), '.ghost', 'run');
        this.configDir = path.join(os.homedir(), '.ghost', 'config');
        this.servicesFile = path.join(this.configDir, 'services.json');
    }

    async initialize() {
        if (!await this.sdk.requestFileExists(this.runDir)) {
            await this.sdk.emitIntent({ type: 'filesystem', operation: 'mkdir', params: { path: this.runDir, recursive: true } });
        }
        if (!await this.sdk.requestFileExists(this.configDir)) {
            await this.sdk.emitIntent({ type: 'filesystem', operation: 'mkdir', params: { path: this.configDir, recursive: true } });
        }

        // Write default services.json if not present to ensure zero-trust allowlist
        if (!await this.sdk.requestFileExists(this.servicesFile)) {
            const defaultServices = {
                "telemetry": { "cmd": "node", "args": [path.join(process.cwd(), "ghost.js"), "console", "start"] },
                "webhook": { "cmd": "node", "args": [path.join(process.cwd(), "ghost.js"), "webhook", "start"] },
                "desktop": { "cmd": "node", "args": [path.join(process.cwd(), "ghost.js"), "desktop", "start"] }
            };
            await this.sdk.requestFileWriteJSON(this.servicesFile, defaultServices);
        }
    }

    async _loadServices() {
        try {
            return await this.sdk.requestFileReadJSON(this.servicesFile);
        } catch (e) {
            throw new Error(`Failed to read services allowlist from ${this.servicesFile}`);
        }
    }

    _getPaths(serviceName) {
        return {
            pid: path.join(this.runDir, `${serviceName}.pid`),
            lock: path.join(this.runDir, `${serviceName}.lock`),
            state: path.join(this.runDir, `${serviceName}.json`)
        };
    }

    _isProcessRunning(pid) {
        try {
            return process.kill(pid, 0); // signal 0 tests existence
        } catch (e) {
            return false;
        }
    }

    async handleList(params) {
        const services = await this._loadServices();
        let output = `\n${Colors.BOLD}👻 Ghost Managed Services${Colors.ENDC}\n${'='.repeat(40)}\n`;
        output += `${Colors.BOLD}${'Service'.padEnd(20)} ${'Status'.padEnd(10)} ${'PID'.padEnd(10)} ${'Uptime'}${Colors.ENDC}\n`;
        output += `${'-'.repeat(60)}\n`;

        for (const [name, spec] of Object.entries(services)) {
            const paths = this._getPaths(name);
            let status = `${Colors.DIM}STOPPED${Colors.ENDC}`;
            let pidStr = '-';
            let uptimeStr = '-';

            if (await this.sdk.requestFileExists(paths.pid)) {
                const pidRaw = await this.sdk.requestFileRead({ path: paths.pid });
                const pid = parseInt(pidRaw.trim(), 10);
                if (this._isProcessRunning(pid)) {
                    status = `${Colors.GREEN}RUNNING${Colors.ENDC}`;
                    pidStr = pid.toString();
                    if (await this.sdk.requestFileExists(paths.state)) {
                        try {
                            const state = await this.sdk.requestFileReadJSON(paths.state);
                            const diff = Math.floor((Date.now() - state.startTime) / 1000);
                            uptimeStr = `${diff}s`;
                        } catch(e) {}
                    }
                } else {
                    status = `${Colors.FAIL}DEAD${Colors.ENDC}`;
                    pidStr = `${pid} (stale)`;
                }
            }

            output += `${Colors.CYAN}${name.padEnd(20)}${Colors.ENDC} ${status.padEnd(20)} ${pidStr.padEnd(10)} ${uptimeStr}\n`;
        }
        
        return { success: true, output };
    }

    async handleStatus(params) {
        const service = params.args[0];
        if (!service) return { success: false, output: 'Usage: ghost process status <service>' };
        return await this.handleList({}); // Simple wrapper for now
    }

    async handleStart(params) {
        const service = params.args[0];
        if (!service) return { success: false, output: 'Usage: ghost process start <service>' };

        const services = await this._loadServices();
        if (!services[service]) {
            return { success: false, output: `${Colors.FAIL}Error: Service '${service}' is not in the allowlist.${Colors.ENDC}` };
        }

        const paths = this._getPaths(service);

        // Check lock
        if (await this.sdk.requestFileExists(paths.lock)) {
            return { success: false, output: `${Colors.WARNING}Service '${service}' is locked (start in progress or dead lock).${Colors.ENDC}` };
        }

        // Check pid
        if (await this.sdk.requestFileExists(paths.pid)) {
            const pidRaw = await this.sdk.requestFileRead({ path: paths.pid });
            const pid = parseInt(pidRaw.trim(), 10);
            if (this._isProcessRunning(pid)) {
                return { success: true, output: `${Colors.CYAN}Service '${service}' is already running (PID: ${pid}).${Colors.ENDC}` };
            } else {
                // Cleanup stale files
                await this.sdk.emitIntent({ type: 'filesystem', operation: 'unlink', params: { path: paths.pid } });
                if (await this.sdk.requestFileExists(paths.state)) {
                    await this.sdk.emitIntent({ type: 'filesystem', operation: 'unlink', params: { path: paths.state } });
                }
            }
        }

        // Create lock
        await this.sdk.requestFileWrite({ path: paths.lock, content: process.pid.toString() });

        try {
            const spec = services[service];
            const outLog = path.join(this.runDir, `${service}.out.log`);
            const errLog = path.join(this.runDir, `${service}.err.log`);

            const spawnResult = await this.sdk.emitIntent({
                type: 'process',
                operation: 'spawn-detached',
                params: {
                    command: spec.cmd,
                    args: spec.args || [],
                    outLog,
                    errLog,
                    cwd: spec.cwd || process.cwd(),
                    env: process.env
                }
            });

            const pid = spawnResult.pid;

            await this.sdk.requestFileWrite({ path: paths.pid, content: pid.toString() });
            await this.sdk.requestFileWriteJSON(paths.state, { startTime: Date.now(), restarts: 0 });

            return { success: true, output: `${Colors.GREEN}✓ Service '${service}' started in background (PID: ${pid}).${Colors.ENDC}` };

        } catch (e) {
            return { success: false, output: `${Colors.FAIL}Failed to start service '${service}': ${e.message}${Colors.ENDC}` };
        } finally {
            // Remove lock
            if (await this.sdk.requestFileExists(paths.lock)) {
                await this.sdk.emitIntent({ type: 'filesystem', operation: 'unlink', params: { path: paths.lock } });
            }
        }
    }

    async handleStop(params) {
        const service = params.args[0];
        if (!service) return { success: false, output: 'Usage: ghost process stop <service>' };

        const paths = this._getPaths(service);

        if (!await this.sdk.requestFileExists(paths.pid)) {
            return { success: true, output: `${Colors.WARNING}Service '${service}' is not running (no PID file).${Colors.ENDC}` };
        }

        const pidRaw = await this.sdk.requestFileRead({ path: paths.pid });
        const pid = parseInt(pidRaw.trim(), 10);
        let outputStr;

        if (this._isProcessRunning(pid)) {
            try {
                process.kill(pid, 'SIGTERM'); // Graceful shutdown

                await new Promise(r => setTimeout(r, 1000));

                if (this._isProcessRunning(pid)) {
                    process.kill(pid, 'SIGKILL'); // Force kill if still alive
                }

                outputStr = `${Colors.GREEN}✓ Service '${service}' (PID: ${pid}) stopped.${Colors.ENDC}`;
            } catch (e) {
                return { success: false, output: `${Colors.FAIL}Failed to kill process ${pid}: ${e.message}${Colors.ENDC}` };
            }
        } else {
            outputStr = `${Colors.WARNING}Service '${service}' was already dead. Cleaning up PID file.${Colors.ENDC}`;
        }

        // Cleanup
        if (await this.sdk.requestFileExists(paths.pid)) {
            await this.sdk.emitIntent({ type: 'filesystem', operation: 'unlink', params: { path: paths.pid } });
        }
        if (await this.sdk.requestFileExists(paths.state)) {
            await this.sdk.emitIntent({ type: 'filesystem', operation: 'unlink', params: { path: paths.state } });
        }
        if (await this.sdk.requestFileExists(paths.lock)) {
            await this.sdk.emitIntent({ type: 'filesystem', operation: 'unlink', params: { path: paths.lock } });
        }

        return { success: true, output: outputStr };
    }

    async handleRestart(params) {
        const stopRes = await this.handleStop(params);
        await new Promise(r => setTimeout(r, 500)); // Small delay
        const startRes = await this.handleStart(params);
        
        return { 
            success: startRes.success, 
            output: `${stopRes.output}\n${startRes.output}` 
        };
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'process.list': return await this.handleList(params);
                case 'process.status': return await this.handleStatus(params);
                case 'process.start': return await this.handleStart(params);
                case 'process.stop': return await this.handleStop(params);
                case 'process.restart': return await this.handleRestart(params);
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { ProcessExtension };
