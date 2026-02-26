const { EventEmitter } = require('events');
const v8 = require('v8');

class ExtensionProfiler extends EventEmitter {
    constructor(extensionId) {
        super();
        this.extensionId = extensionId;
        this.metrics = {
            cpuTime: 0,
            memoryUsage: [],
            callCount: 0,
            executionTimes: [],
            bottlenecks: []
        };
        this.startTime = Date.now();
        this.cpuUsageInterval = null;
        this.memorySnapshotInterval = null;
    }

    startProfiling() {
        // Track CPU usage
        this.cpuUsageInterval = setInterval(() => {
            const usage = process.cpuUsage(this.lastCpuUsage || undefined);
            this.lastCpuUsage = process.cpuUsage();
            
            const userMs = usage.user / 1000;
            const systemMs = usage.system / 1000;
            
            this.metrics.cpuTime += userMs + systemMs;
            
            this.emit('cpu-sample', {
                extensionId: this.extensionId,
                userMs,
                systemMs,
                totalMs: userMs + systemMs,
                timestamp: Date.now()
            });
        }, 100);

        // Track memory usage
        this.memorySnapshotInterval = setInterval(() => {
            const memUsage = process.memoryUsage();
            
            const snapshot = {
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                external: memUsage.external,
                rss: memUsage.rss,
                timestamp: Date.now()
            };
            
            this.metrics.memoryUsage.push(snapshot);
            
            // Keep last 100 snapshots
            if (this.metrics.memoryUsage.length > 100) {
                this.metrics.memoryUsage.shift();
            }
            
            this.emit('memory-sample', {
                extensionId: this.extensionId,
                ...snapshot
            });
        }, 500);
    }

    stopProfiling() {
        if (this.cpuUsageInterval) {
            clearInterval(this.cpuUsageInterval);
            this.cpuUsageInterval = null;
        }
        
        if (this.memorySnapshotInterval) {
            clearInterval(this.memorySnapshotInterval);
            this.memorySnapshotInterval = null;
        }
    }

    recordExecution(method, duration, success) {
        this.metrics.callCount++;
        this.metrics.executionTimes.push({
            method,
            duration,
            success,
            timestamp: Date.now()
        });

        // Keep last 1000 executions
        if (this.metrics.executionTimes.length > 1000) {
            this.metrics.executionTimes.shift();
        }

        // Identify bottlenecks (> 500ms)
        if (duration > 500) {
            this.metrics.bottlenecks.push({
                method,
                duration,
                timestamp: Date.now()
            });

            this.emit('bottleneck-detected', {
                extensionId: this.extensionId,
                method,
                duration
            });
        }
    }

    getMetrics() {
        const now = Date.now();
        const uptime = now - this.startTime;

        const executionTimes = this.metrics.executionTimes.map(e => e.duration);
        const avgExecutionTime = executionTimes.length > 0
            ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
            : 0;

        const maxExecutionTime = executionTimes.length > 0
            ? Math.max(...executionTimes)
            : 0;

        const currentMemory = this.metrics.memoryUsage.length > 0
            ? this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1]
            : { heapUsed: 0, heapTotal: 0, external: 0, rss: 0 };

        const avgCpuMs = uptime > 0 ? (this.metrics.cpuTime / uptime) * 1000 : 0;

        return {
            extensionId: this.extensionId,
            uptime,
            cpu: {
                totalTimeMs: this.metrics.cpuTime,
                averageUsagePercent: avgCpuMs,
                samples: this.cpuUsageInterval ? 'active' : 'inactive'
            },
            memory: {
                current: {
                    heapUsedMB: (currentMemory.heapUsed / 1024 / 1024).toFixed(2),
                    heapTotalMB: (currentMemory.heapTotal / 1024 / 1024).toFixed(2),
                    externalMB: (currentMemory.external / 1024 / 1024).toFixed(2),
                    rssMB: (currentMemory.rss / 1024 / 1024).toFixed(2)
                },
                history: this.metrics.memoryUsage
            },
            execution: {
                totalCalls: this.metrics.callCount,
                averageDurationMs: avgExecutionTime.toFixed(2),
                maxDurationMs: maxExecutionTime,
                recentExecutions: this.metrics.executionTimes.slice(-20)
            },
            bottlenecks: this.metrics.bottlenecks.slice(-10)
        };
    }

    generateFlamegraph() {
        // Generate simplified flamegraph data structure
        const methodStats = {};

        for (const exec of this.metrics.executionTimes) {
            if (!methodStats[exec.method]) {
                methodStats[exec.method] = {
                    name: exec.method,
                    totalTime: 0,
                    callCount: 0,
                    avgTime: 0
                };
            }

            methodStats[exec.method].totalTime += exec.duration;
            methodStats[exec.method].callCount++;
        }

        // Calculate averages
        for (const method in methodStats) {
            const stats = methodStats[method];
            stats.avgTime = stats.totalTime / stats.callCount;
        }

        // Build flamegraph structure
        const flamegraphData = {
            name: this.extensionId,
            value: this.metrics.cpuTime,
            children: Object.values(methodStats).map(stats => ({
                name: stats.name,
                value: stats.totalTime,
                callCount: stats.callCount,
                avgTime: stats.avgTime
            }))
        };

        return flamegraphData;
    }

    reset() {
        this.metrics = {
            cpuTime: 0,
            memoryUsage: [],
            callCount: 0,
            executionTimes: [],
            bottlenecks: []
        };
        this.startTime = Date.now();
        this.lastCpuUsage = null;
    }
}

class ProfilingManager extends EventEmitter {
    constructor() {
        super();
        this.profilers = new Map();
    }

    startProfiling(extensionId) {
        if (this.profilers.has(extensionId)) {
            return this.profilers.get(extensionId);
        }

        const profiler = new ExtensionProfiler(extensionId);
        
        profiler.on('cpu-sample', (data) => this.emit('cpu-sample', data));
        profiler.on('memory-sample', (data) => this.emit('memory-sample', data));
        profiler.on('bottleneck-detected', (data) => this.emit('bottleneck-detected', data));

        profiler.startProfiling();
        this.profilers.set(extensionId, profiler);
        
        return profiler;
    }

    stopProfiling(extensionId) {
        const profiler = this.profilers.get(extensionId);
        if (profiler) {
            profiler.stopProfiling();
            this.profilers.delete(extensionId);
        }
    }

    getProfiler(extensionId) {
        return this.profilers.get(extensionId);
    }

    getAllMetrics() {
        const metrics = {};
        for (const [id, profiler] of this.profilers) {
            metrics[id] = profiler.getMetrics();
        }
        return metrics;
    }

    generateAllFlamegraphs() {
        const flamegraphs = {};
        for (const [id, profiler] of this.profilers) {
            flamegraphs[id] = profiler.generateFlamegraph();
        }
        return flamegraphs;
    }

    reset(extensionId) {
        if (extensionId) {
            const profiler = this.profilers.get(extensionId);
            if (profiler) {
                profiler.reset();
            }
        } else {
            for (const profiler of this.profilers.values()) {
                profiler.reset();
            }
        }
    }

    shutdown() {
        for (const profiler of this.profilers.values()) {
            profiler.stopProfiling();
        }
        this.profilers.clear();
    }
}

module.exports = { ExtensionProfiler, ProfilingManager };
