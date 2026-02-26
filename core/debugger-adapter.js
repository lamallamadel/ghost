const { EventEmitter } = require('events');
const inspector = require('inspector');

class ExtensionDebugger extends EventEmitter {
    constructor(extensionId, extensionProcess) {
        super();
        this.extensionId = extensionId;
        this.extensionProcess = extensionProcess;
        this.debugSession = null;
        this.breakpoints = new Map();
        this.isAttached = false;
        this.inspectorUrl = null;
    }

    async attach(port) {
        if (this.isAttached) {
            throw new Error(`Debugger already attached to ${this.extensionId}`);
        }

        const pid = this.extensionProcess.process?.pid;
        if (!pid) {
            throw new Error(`Extension ${this.extensionId} is not running`);
        }

        // Generate inspector URL for the extension process
        const debugPort = port || (9229 + Math.floor(Math.random() * 1000));
        
        try {
            // Send SIGUSR1 to enable debugging
            process.kill(pid, 'SIGUSR1');

            this.inspectorUrl = `chrome-devtools://devtools/bundled/inspector.html?experiments=true&v8only=true&ws=127.0.0.1:${debugPort}`;
            
            this.isAttached = true;
            this.debugPort = debugPort;

            this.emit('attached', {
                extensionId: this.extensionId,
                pid,
                debugPort,
                inspectorUrl: this.inspectorUrl
            });

            return {
                success: true,
                inspectorUrl: this.inspectorUrl,
                debugPort
            };
        } catch (error) {
            throw new Error(`Failed to attach debugger: ${error.message}`);
        }
    }

    detach() {
        if (!this.isAttached) {
            return;
        }

        this.isAttached = false;
        this.inspectorUrl = null;
        this.debugPort = null;

        this.emit('detached', {
            extensionId: this.extensionId
        });
    }

    addBreakpoint(scriptPath, line, condition) {
        const breakpointId = `${scriptPath}:${line}`;
        
        const breakpoint = {
            id: breakpointId,
            scriptPath,
            line,
            condition,
            enabled: true
        };

        this.breakpoints.set(breakpointId, breakpoint);

        this.emit('breakpoint-added', {
            extensionId: this.extensionId,
            breakpoint
        });

        return breakpoint;
    }

    removeBreakpoint(breakpointId) {
        const removed = this.breakpoints.delete(breakpointId);
        
        if (removed) {
            this.emit('breakpoint-removed', {
                extensionId: this.extensionId,
                breakpointId
            });
        }

        return removed;
    }

    getBreakpoints() {
        return Array.from(this.breakpoints.values());
    }

    getDebugInfo() {
        return {
            extensionId: this.extensionId,
            isAttached: this.isAttached,
            inspectorUrl: this.inspectorUrl,
            debugPort: this.debugPort,
            breakpoints: this.getBreakpoints(),
            pid: this.extensionProcess.process?.pid
        };
    }
}

class DebuggerManager extends EventEmitter {
    constructor() {
        super();
        this.debuggers = new Map();
    }

    attachDebugger(extensionId, extensionProcess, port) {
        if (this.debuggers.has(extensionId)) {
            const dbg = this.debuggers.get(extensionId);
            if (dbg.isAttached) {
                throw new Error(`Debugger already attached to ${extensionId}`);
            }
        }

        const dbg = new ExtensionDebugger(extensionId, extensionProcess);
        
        dbg.on('attached', (data) => this.emit('debugger-attached', data));
        dbg.on('detached', (data) => this.emit('debugger-detached', data));
        dbg.on('breakpoint-added', (data) => this.emit('breakpoint-added', data));
        dbg.on('breakpoint-removed', (data) => this.emit('breakpoint-removed', data));

        this.debuggers.set(extensionId, dbg);
        
        return dbg.attach(port);
    }

    detachDebugger(extensionId) {
        const dbg = this.debuggers.get(extensionId);
        if (dbg) {
            dbg.detach();
            this.debuggers.delete(extensionId);
        }
    }

    getDebugger(extensionId) {
        return this.debuggers.get(extensionId);
    }

    getAllDebugInfo() {
        const info = {};
        for (const [id, dbg] of this.debuggers) {
            info[id] = dbg.getDebugInfo();
        }
        return info;
    }

    shutdown() {
        for (const dbg of this.debuggers.values()) {
            dbg.detach();
        }
        this.debuggers.clear();
    }
}

module.exports = { ExtensionDebugger, DebuggerManager };
