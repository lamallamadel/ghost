const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class CircuitBreaker {
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 60000;
        this.failures = 0;
        this.state = 'CLOSED';
        this.nextAttempt = Date.now();
    }

    async execute(fn) {
        if (this.state === 'OPEN') {
            if (Date.now() < this.nextAttempt) {
                throw new ExecutionError('Circuit breaker is OPEN', 'CIRCUIT_OPEN');
            }
            this.state = 'HALF_OPEN';
        }

        try {
            const result = await fn();
            this._onSuccess();
            return result;
        } catch (error) {
            this._onFailure();
            throw error;
        }
    }

    _onSuccess() {
        this.failures = 0;
        this.state = 'CLOSED';
    }

    _onFailure() {
        this.failures++;
        if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
            this.nextAttempt = Date.now() + this.resetTimeout;
        }
    }

    getState() {
        return {
            state: this.state,
            failures: this.failures,
            nextAttempt: this.nextAttempt
        };
    }

    reset() {
        this.failures = 0;
        this.state = 'CLOSED';
        this.nextAttempt = Date.now();
    }
}

class ExecutionError extends Error {
    constructor(message, code, details = {}) {
        super(message);
        this.name = 'ExecutionError';
        this.code = code;
        this.details = details;
    }
}

class TimeoutManager {
    static DEFAULT_TIMEOUT = 30000;

    static async withTimeout(promise, timeout = this.DEFAULT_TIMEOUT) {
        let timeoutId;
        
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new ExecutionError(
                    `Operation timed out after ${timeout}ms`,
                    'EXEC_TIMEOUT'
                ));
            }, timeout);
        });

        try {
            const result = await Promise.race([promise, timeoutPromise]);
            clearTimeout(timeoutId);
            return result;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }
}

class FilesystemExecutor {
    constructor() {
        this.circuitBreaker = new CircuitBreaker();
    }

    async execute(operation, params) {
        return this.circuitBreaker.execute(async () => {
            switch (operation) {
                case 'read':
                    return await this._read(params);
                case 'write':
                    return await this._write(params);
                case 'stat':
                    return await this._stat(params);
                case 'readdir':
                    return await this._readdir(params);
                case 'mkdir':
                    return await this._mkdir(params);
                case 'unlink':
                    return await this._unlink(params);
                case 'rmdir':
                    return await this._rmdir(params);
                default:
                    throw new ExecutionError(
                        `Unknown filesystem operation: ${operation}`,
                        'EXEC_UNKNOWN_OP'
                    );
            }
        });
    }

    async _read(params) {
        try {
            const content = await TimeoutManager.withTimeout(
                fs.readFile(params.path, params.encoding || 'utf8'),
                params.timeout
            );
            return { success: true, result: content, content };
        } catch (error) {
            throw new ExecutionError(
                `Failed to read file: ${error.message}`,
                this._mapErrorCode(error.code)
            );
        }
    }

    async _write(params) {
        try {
            await TimeoutManager.withTimeout(
                fs.writeFile(params.path, params.content, params.encoding || 'utf8'),
                params.timeout
            );
            return { success: true, result: true, path: params.path };
        } catch (error) {
            throw new ExecutionError(
                `Failed to write file: ${error.message}`,
                this._mapErrorCode(error.code)
            );
        }
    }

    async _stat(params) {
        try {
            const stats = await TimeoutManager.withTimeout(
                fs.stat(params.path),
                params.timeout
            );
            const result = {
                size: stats.size,
                isFile: stats.isFile(),
                isDirectory: stats.isDirectory(),
                mtime: stats.mtime,
                ctime: stats.ctime
            };
            return {
                success: true,
                result,
                stats: result
            };
        } catch (error) {
            throw new ExecutionError(
                `Failed to stat file: ${error.message}`,
                this._mapErrorCode(error.code)
            );
        }
    }

    async _readdir(params) {
        try {
            const options = { withFileTypes: true };
            if (params.recursive) {
                options.recursive = true;
            }
            const entries = await TimeoutManager.withTimeout(
                fs.readdir(params.path, options),
                params.timeout
            );
            const result = entries.map(e => ({
                name: e.name,
                path: e.path || e.parentPath,
                isFile: e.isFile(),
                isDirectory: e.isDirectory()
            }));
            return {
                success: true,
                result,
                entries: result
            };
        } catch (error) {
            throw new ExecutionError(
                `Failed to read directory: ${error.message}`,
                this._mapErrorCode(error.code)
            );
        }
    }

    async _mkdir(params) {
        try {
            await TimeoutManager.withTimeout(
                fs.mkdir(params.path, { recursive: params.recursive || false }),
                params.timeout
            );
            return { success: true, result: true, path: params.path };
        } catch (error) {
            throw new ExecutionError(
                `Failed to create directory: ${error.message}`,
                this._mapErrorCode(error.code)
            );
        }
    }

    async _unlink(params) {
        try {
            await TimeoutManager.withTimeout(
                fs.unlink(params.path),
                params.timeout
            );
            return { success: true, result: true, path: params.path };
        } catch (error) {
            throw new ExecutionError(
                `Failed to delete file: ${error.message}`,
                this._mapErrorCode(error.code)
            );
        }
    }

    async _rmdir(params) {
        try {
            await TimeoutManager.withTimeout(
                fs.rmdir(params.path, { recursive: params.recursive || false }),
                params.timeout
            );
            return { success: true, result: true, path: params.path };
        } catch (error) {
            throw new ExecutionError(
                `Failed to remove directory: ${error.message}`,
                this._mapErrorCode(error.code)
            );
        }
    }

    _mapErrorCode(nodeCode) {
        const errorMap = {
            'ENOENT': 'EXEC_NOT_FOUND',
            'EACCES': 'EXEC_PERMISSION_DENIED',
            'EEXIST': 'EXEC_ALREADY_EXISTS',
            'EISDIR': 'EXEC_IS_DIRECTORY',
            'ENOTDIR': 'EXEC_NOT_DIRECTORY',
            'ENOTEMPTY': 'EXEC_NOT_EMPTY'
        };
        return errorMap[nodeCode] || 'EXEC_FS_ERROR';
    }
}

class NetworkExecutor {
    constructor() {
        this.circuitBreaker = new CircuitBreaker();
    }

    async execute(operation, params) {
        return this.circuitBreaker.execute(async () => {
            const url = new URL(params.url);
            const protocol = url.protocol === 'https:' ? https : http;
            
            // Map generic operations to standard request
            if (['post', 'get', 'request', 'http', 'https'].includes(operation)) {
                return await this._request(protocol, params);
            }
            
            throw new ExecutionError(`Unknown network operation: ${operation}`, 'EXEC_UNKNOWN_OP');
        });
    }

    async _request(protocol, params) {
        const url = new URL(params.url);
        
        const options = {
            hostname: url.hostname,
            port: url.port || (protocol === https ? 443 : 80),
            path: url.pathname + url.search,
            method: params.method || 'GET',
            headers: params.headers || {}
        };

        return TimeoutManager.withTimeout(
            new Promise((resolve, reject) => {
                const req = protocol.request(options, (res) => {
                    let data = '';
                    
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        resolve({
                            success: true,
                            result: data,
                            statusCode: res.statusCode,
                            headers: res.headers,
                            body: data
                        });
                    });
                });

                req.on('error', (error) => {
                    reject(new ExecutionError(
                        `Network request failed: ${error.message}`,
                        this._mapErrorCode(error.code)
                    ));
                });

                if (params.body) {
                    req.write(params.body);
                }

                req.end();
            }),
            params.timeout || 30000
        );
    }

    _mapErrorCode(nodeCode) {
        const errorMap = {
            'ENOTFOUND': 'EXEC_HOST_NOT_FOUND',
            'ECONNREFUSED': 'EXEC_CONNECTION_REFUSED',
            'ETIMEDOUT': 'EXEC_TIMEOUT',
            'ECONNRESET': 'EXEC_CONNECTION_RESET',
            'EHOSTUNREACH': 'EXEC_HOST_UNREACHABLE'
        };
        return errorMap[nodeCode] || 'EXEC_NETWORK_ERROR';
    }
}

class GitExecutor {
    constructor() {
        this.circuitBreaker = new CircuitBreaker();
    }

    async execute(operation, params) {
        return this.circuitBreaker.execute(async () => {
            const args = params.args || [];
            const cwd = params.cwd || process.cwd();

            return await this._executeGitCommand(operation, args, cwd, params.timeout);
        });
    }

    async _executeGitCommand(operation, args, cwd, timeout) {
        const gitArgs = operation === 'exec' ? [...args] : [operation, ...args];
        
        try {
            const shellArgs = gitArgs.map(a => /\s/.test(a) ? `"${a}"` : a);
            const result = await TimeoutManager.withTimeout(
                execAsync(`git ${shellArgs.join(' ')}`, { cwd }),
                timeout || 30000
            );
            
            return {
                success: true,
                result: result.stdout,
                stdout: result.stdout,
                stderr: result.stderr
            };
        } catch (error) {
            throw new ExecutionError(
                `Git command failed: ${error.message}`,
                'EXEC_GIT_ERROR',
                { stderr: error.stderr }
            );
        }
    }
}

class ProcessExecutor {
    constructor() {
        this.circuitBreaker = new CircuitBreaker();
    }

    async execute(operation, params) {
        return this.circuitBreaker.execute(async () => {
            if (operation === 'spawn') {
                return await this._spawn(params);
            } else if (operation === 'exec') {
                return await this._exec(params);
            } else {
                throw new ExecutionError(
                    `Unknown process operation: ${operation}`,
                    'EXEC_UNKNOWN_OP'
                );
            }
        });
    }

    async _spawn(params) {
        return new Promise((resolve, reject) => {
            const proc = spawn(params.command, params.args || [], {
                cwd: params.cwd || process.cwd(),
                env: params.env
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve({
                        success: true,
                        result: { exitCode: code, stdout, stderr },
                        exitCode: code,
                        stdout,
                        stderr
                    });
                } else {
                    reject(new ExecutionError(
                        `Process exited with code ${code}`,
                        'EXEC_PROCESS_ERROR',
                        { exitCode: code, stderr }
                    ));
                }
            });

            proc.on('error', (error) => {
                reject(new ExecutionError(
                    `Failed to spawn process: ${error.message}`,
                    'EXEC_SPAWN_ERROR'
                ));
            });

            if (params.timeout) {
                setTimeout(() => {
                    proc.kill();
                    reject(new ExecutionError(
                        `Process timed out after ${params.timeout}ms`,
                        'EXEC_TIMEOUT'
                    ));
                }, params.timeout);
            }
        });
    }

    async _exec(params) {
        try {
            const result = await TimeoutManager.withTimeout(
                execAsync(params.command, {
                    cwd: params.cwd || process.cwd(),
                    env: params.env
                }),
                params.timeout || 30000
            );
            
            return {
                success: true,
                result: result.stdout,
                stdout: result.stdout,
                stderr: result.stderr
            };
        } catch (error) {
            throw new ExecutionError(
                `Command execution failed: ${error.message}`,
                'EXEC_COMMAND_ERROR',
                { stderr: error.stderr }
            );
        }
    }
}

class ExecutionLayer {
    constructor() {
        this.executors = {
            filesystem: new FilesystemExecutor(),
            network: new NetworkExecutor(),
            git: new GitExecutor(),
            process: new ProcessExecutor()
        };
    }

    registerExecutor(type, executor) {
        this.executors[type] = executor;
    }

    async execute(intent) {
        const executor = this.executors[intent.type];
        
        if (!executor) {
            throw new ExecutionError(
                `No executor found for type: ${intent.type}`,
                'EXEC_NO_EXECUTOR'
            );
        }

        try {
            const result = await executor.execute(intent.operation, intent.params);
            return result;
        } catch (error) {
            if (error instanceof ExecutionError) {
                throw error;
            }
            throw new ExecutionError(
                `Execution failed: ${error.message}`,
                'EXEC_UNKNOWN_ERROR',
                { originalError: error.message }
            );
        }
    }

    getCircuitBreakerState(type) {
        const executor = this.executors[type];
        return executor ? executor.circuitBreaker.getState() : null;
    }

    resetCircuitBreaker(type) {
        const executor = this.executors[type];
        if (executor) {
            executor.circuitBreaker.reset();
        }
    }
}

class LogExecutor {
    constructor(callback) {
        this.callback = callback;
        this.circuitBreaker = new CircuitBreaker();
    }

    async execute(operation, params) {
        return this.circuitBreaker.execute(async () => {
            if (this.callback) {
                return await this.callback(operation, params);
            }
            console.log(`[${operation.toUpperCase()}] ${params.message}`, params.meta);
            return { success: true, result: true };
        });
    }
}

class SystemExecutor {
    constructor(callback) {
        this.callback = callback;
        this.circuitBreaker = new CircuitBreaker();
    }

    async execute(operation, params) {
        return this.circuitBreaker.execute(async () => {
            if (operation === 'registry') {
                // Returns the global command registry
                if (this.callback) {
                    return await this.callback(operation, params);
                }
            }
            if (this.callback) {
                return await this.callback(operation, params);
            }
            throw new Error(`System operation ${operation} callback not configured`);
        });
    }
}

module.exports = {
    ExecutionLayer,
    ExecutionError,
    CircuitBreaker,
    TimeoutManager,
    FilesystemExecutor,
    NetworkExecutor,
    GitExecutor,
    ProcessExecutor,
    SystemExecutor,
    LogExecutor
};
