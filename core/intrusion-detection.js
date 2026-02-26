const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const os = require('os');

const IDS_DIR = path.join(os.homedir(), '.ghost', 'ids');

class IntrusionDetectionSystem extends EventEmitter {
    constructor(options = {}) {
        super();
        this.idsDir = options.idsDir || IDS_DIR;
        this.extensionBehavior = new Map();
        this.anomalyThresholds = {
            cpuSpike: options.cpuSpikeThreshold || 80,
            memorySpike: options.memorySpikeThreshold || 200 * 1024 * 1024,
            networkRequests: options.networkRequestThreshold || 100,
            validationFailures: options.validationFailureThreshold || 10,
            suspiciousPatterns: options.suspiciousPatternThreshold || 5
        };
        this.windowSize = options.windowSize || 60000;
        this._ensureIDSDir();
        this._loadBaselines();
    }

    _ensureIDSDir() {
        if (!fs.existsSync(this.idsDir)) {
            fs.mkdirSync(this.idsDir, { recursive: true });
        }
    }

    _loadBaselines() {
        try {
            const baselinesFile = path.join(this.idsDir, 'baselines.json');
            if (fs.existsSync(baselinesFile)) {
                const baselines = JSON.parse(fs.readFileSync(baselinesFile, 'utf8'));
                for (const [extensionId, baseline] of Object.entries(baselines)) {
                    this.extensionBehavior.set(extensionId, {
                        ...baseline,
                        recentEvents: []
                    });
                }
            }
        } catch (error) {
            console.warn('[IDS] Failed to load baselines:', error.message);
        }
    }

    _saveBaselines() {
        try {
            const baselines = {};
            for (const [extensionId, behavior] of this.extensionBehavior.entries()) {
                const { recentEvents, ...baseline } = behavior;
                baselines[extensionId] = baseline;
            }

            const baselinesFile = path.join(this.idsDir, 'baselines.json');
            fs.writeFileSync(baselinesFile, JSON.stringify(baselines, null, 2));
        } catch (error) {
            console.error('[IDS] Failed to save baselines:', error.message);
        }
    }

    recordEvent(extensionId, event) {
        if (!this.extensionBehavior.has(extensionId)) {
            this.extensionBehavior.set(extensionId, {
                baseline: this._createBaselineBehavior(),
                recentEvents: [],
                alerts: [],
                riskScore: 0
            });
        }

        const behavior = this.extensionBehavior.get(extensionId);
        const now = Date.now();

        behavior.recentEvents = behavior.recentEvents.filter(
            e => now - e.timestamp < this.windowSize
        );

        behavior.recentEvents.push({
            ...event,
            timestamp: now
        });

        this._updateBaseline(extensionId, event);
        const anomalies = this._detectAnomalies(extensionId, event);

        if (anomalies.length > 0) {
            this._handleAnomalies(extensionId, anomalies);
        }
    }

    _createBaselineBehavior() {
        return {
            avgCPU: 0,
            avgMemory: 0,
            avgNetworkRequests: 0,
            typicalDestinations: new Set(),
            typicalOperations: new Set(),
            validationFailureRate: 0,
            sampleCount: 0
        };
    }

    _updateBaseline(extensionId, event) {
        const behavior = this.extensionBehavior.get(extensionId);
        const baseline = behavior.baseline;
        const count = baseline.sampleCount;

        if (event.cpu !== undefined) {
            baseline.avgCPU = (baseline.avgCPU * count + event.cpu) / (count + 1);
        }

        if (event.memory !== undefined) {
            baseline.avgMemory = (baseline.avgMemory * count + event.memory) / (count + 1);
        }

        if (event.operation) {
            baseline.typicalOperations.add(event.operation);
        }

        if (event.destination) {
            baseline.typicalDestinations.add(event.destination);
        }

        baseline.sampleCount++;

        if (baseline.sampleCount % 100 === 0) {
            this._saveBaselines();
        }
    }

    _detectAnomalies(extensionId, event) {
        const anomalies = [];
        const behavior = this.extensionBehavior.get(extensionId);
        const baseline = behavior.baseline;

        if (event.cpu !== undefined && event.cpu > this.anomalyThresholds.cpuSpike) {
            const deviation = baseline.sampleCount > 0 
                ? Math.abs(event.cpu - baseline.avgCPU) / baseline.avgCPU 
                : 1;
            
            if (deviation > 2.0) {
                anomalies.push({
                    type: 'cpu-spike',
                    severity: 'high',
                    value: event.cpu,
                    baseline: baseline.avgCPU,
                    deviation
                });
            }
        }

        if (event.memory !== undefined && event.memory > this.anomalyThresholds.memorySpike) {
            const deviation = baseline.sampleCount > 0 
                ? Math.abs(event.memory - baseline.avgMemory) / baseline.avgMemory 
                : 1;
            
            if (deviation > 2.0) {
                anomalies.push({
                    type: 'memory-spike',
                    severity: 'high',
                    value: event.memory,
                    baseline: baseline.avgMemory,
                    deviation
                });
            }
        }

        if (event.destination && baseline.sampleCount > 20) {
            if (!baseline.typicalDestinations.has(event.destination)) {
                anomalies.push({
                    type: 'unusual-destination',
                    severity: 'medium',
                    destination: event.destination,
                    knownDestinations: Array.from(baseline.typicalDestinations)
                });
            }
        }

        if (event.type === 'validation-failure') {
            const recentFailures = behavior.recentEvents.filter(
                e => e.type === 'validation-failure'
            ).length;

            if (recentFailures > this.anomalyThresholds.validationFailures) {
                anomalies.push({
                    type: 'repeated-validation-failures',
                    severity: 'high',
                    count: recentFailures,
                    threshold: this.anomalyThresholds.validationFailures
                });
            }
        }

        const networkRequests = behavior.recentEvents.filter(
            e => e.operation === 'network-request'
        ).length;

        if (networkRequests > this.anomalyThresholds.networkRequests) {
            anomalies.push({
                type: 'excessive-network-activity',
                severity: 'medium',
                count: networkRequests,
                threshold: this.anomalyThresholds.networkRequests
            });
        }

        if (event.suspiciousPattern) {
            anomalies.push({
                type: 'suspicious-pattern',
                severity: 'critical',
                pattern: event.suspiciousPattern,
                details: event.details
            });
        }

        return anomalies;
    }

    _handleAnomalies(extensionId, anomalies) {
        const behavior = this.extensionBehavior.get(extensionId);
        const now = Date.now();

        for (const anomaly of anomalies) {
            const alert = {
                extensionId,
                timestamp: now,
                ...anomaly
            };

            behavior.alerts.push(alert);
            this._calculateRiskScore(extensionId);

            this.emit('anomaly-detected', alert);

            this._logAlert(alert);
        }
    }

    _calculateRiskScore(extensionId) {
        const behavior = this.extensionBehavior.get(extensionId);
        const recentAlerts = behavior.alerts.filter(
            a => Date.now() - a.timestamp < this.windowSize
        );

        const severityScores = {
            low: 1,
            medium: 3,
            high: 5,
            critical: 10
        };

        let score = 0;
        for (const alert of recentAlerts) {
            score += severityScores[alert.severity] || 1;
        }

        behavior.riskScore = Math.min(100, score);

        if (behavior.riskScore >= 50) {
            this.emit('high-risk-extension', {
                extensionId,
                riskScore: behavior.riskScore,
                recentAlerts: recentAlerts.slice(-5)
            });
        }
    }

    _logAlert(alert) {
        try {
            const alertsFile = path.join(this.idsDir, `alerts-${new Date().toISOString().split('T')[0]}.log`);
            const logEntry = JSON.stringify(alert) + '\n';
            fs.appendFileSync(alertsFile, logEntry);
        } catch (error) {
            console.error('[IDS] Failed to log alert:', error.message);
        }
    }

    getExtensionBehavior(extensionId) {
        const behavior = this.extensionBehavior.get(extensionId);
        if (!behavior) {
            return null;
        }

        return {
            baseline: {
                ...behavior.baseline,
                typicalDestinations: Array.from(behavior.baseline.typicalDestinations),
                typicalOperations: Array.from(behavior.baseline.typicalOperations)
            },
            riskScore: behavior.riskScore,
            recentAlerts: behavior.alerts.slice(-10),
            recentEvents: behavior.recentEvents.length
        };
    }

    getAllBehaviors() {
        const behaviors = {};
        for (const [extensionId, behavior] of this.extensionBehavior.entries()) {
            behaviors[extensionId] = this.getExtensionBehavior(extensionId);
        }
        return behaviors;
    }

    getAlerts(options = {}) {
        const { extensionId, severity, limit = 100 } = options;
        const alerts = [];

        for (const [extId, behavior] of this.extensionBehavior.entries()) {
            if (extensionId && extId !== extensionId) continue;

            for (const alert of behavior.alerts) {
                if (severity && alert.severity !== severity) continue;
                alerts.push(alert);
            }
        }

        return alerts.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
    }

    clearAlerts(extensionId) {
        if (extensionId) {
            const behavior = this.extensionBehavior.get(extensionId);
            if (behavior) {
                behavior.alerts = [];
                behavior.riskScore = 0;
            }
        } else {
            for (const behavior of this.extensionBehavior.values()) {
                behavior.alerts = [];
                behavior.riskScore = 0;
            }
        }
    }

    resetBaseline(extensionId) {
        const behavior = this.extensionBehavior.get(extensionId);
        if (behavior) {
            behavior.baseline = this._createBaselineBehavior();
            behavior.recentEvents = [];
            this._saveBaselines();
        }
    }
}

module.exports = { IntrusionDetectionSystem };
