const fs = require('fs');
const path = require('path');
const os = require('os');

const SLA_CONFIG_FILE = path.join(os.homedir(), '.ghost', 'config', 'sla-config.json');
const SLA_DATA_DIR = path.join(os.homedir(), '.ghost', 'sla');

const DEFAULT_SLA_OBJECTIVES = {
    availability: {
        target: 99.9,
        window: '30d',
        description: 'System availability percentage'
    },
    latency_p95: {
        target: 200,
        window: '24h',
        description: 'p95 latency in milliseconds'
    },
    error_rate: {
        target: 1.0,
        window: '24h',
        description: 'Error rate percentage'
    }
};

const BURN_RATE_WINDOWS = {
    fast: { window: 3600000, threshold: 14.4 },
    slow: { window: 21600000, threshold: 6.0 }
};

class SLAMonitor {
    constructor(metricsCollector, telemetry, options = {}) {
        this.metricsCollector = metricsCollector;
        this.telemetry = telemetry;
        this.objectives = this._loadObjectives();
        this.errorBudget = new Map();
        this.burnRateHistory = [];
        this.alerts = [];
        this.enabled = options.enabled !== false;
        
        this._ensureDirectory();
        this._initializeErrorBudgets();
    }

    _ensureDirectory() {
        try {
            if (!fs.existsSync(SLA_DATA_DIR)) {
                fs.mkdirSync(SLA_DATA_DIR, { recursive: true });
            }
        } catch (error) {
            console.error('[SLAMonitor] Failed to create directory:', error.message);
        }
    }

    _loadObjectives() {
        try {
            if (fs.existsSync(SLA_CONFIG_FILE)) {
                const config = JSON.parse(fs.readFileSync(SLA_CONFIG_FILE, 'utf8'));
                return { ...DEFAULT_SLA_OBJECTIVES, ...config.objectives };
            }
        } catch (error) {
            console.error('[SLAMonitor] Failed to load SLA config:', error.message);
        }
        return DEFAULT_SLA_OBJECTIVES;
    }

    _initializeErrorBudgets() {
        const now = Date.now();
        for (const [name, objective] of Object.entries(this.objectives)) {
            const windowMs = this._parseWindow(objective.window);
            const budget = this._calculateErrorBudget(objective.target, windowMs);
            
            this.errorBudget.set(name, {
                total: budget,
                remaining: budget,
                consumed: 0,
                lastReset: now,
                windowMs: windowMs,
                target: objective.target
            });
        }
    }

    _parseWindow(window) {
        const match = window.match(/^(\d+)([dhm])$/);
        if (!match) return 86400000;
        
        const value = parseInt(match[1]);
        const unit = match[2];
        
        const multipliers = { m: 60000, h: 3600000, d: 86400000 };
        return value * (multipliers[unit] || 3600000);
    }

    _calculateErrorBudget(target, windowMs) {
        const uptimeRequirement = target / 100;
        const allowedDowntime = 1 - uptimeRequirement;
        return allowedDowntime * windowMs;
    }

    recordRequest(extensionId, success, latencyMs) {
        if (!this.enabled) return;

        const now = Date.now();
        
        this._updateAvailability(success);
        this._updateLatency(latencyMs);
        this._updateErrorRate(!success);
        
        this._checkBurnRates();
        this._persistMetrics();
    }

    _updateAvailability(success) {
        const budget = this.errorBudget.get('availability');
        if (!budget) return;

        if (!success) {
            const incidentDuration = 1000;
            budget.consumed += incidentDuration;
            budget.remaining = Math.max(0, budget.total - budget.consumed);
        }

        this._checkBudgetThreshold('availability', budget);
    }

    _updateLatency(latencyMs) {
        const budget = this.errorBudget.get('latency_p95');
        if (!budget) return;

        if (latencyMs > budget.target) {
            const exceedance = latencyMs - budget.target;
            budget.consumed += exceedance;
            budget.remaining = Math.max(0, budget.total - budget.consumed);
        }

        this._checkBudgetThreshold('latency_p95', budget);
    }

    _updateErrorRate(isError) {
        const budget = this.errorBudget.get('error_rate');
        if (!budget) return;

        if (isError) {
            budget.consumed += 1;
            budget.remaining = Math.max(0, budget.total - budget.consumed);
        }

        this._checkBudgetThreshold('error_rate', budget);
    }

    _checkBudgetThreshold(name, budget) {
        const consumptionPercent = (budget.consumed / budget.total) * 100;
        
        if (consumptionPercent > 90 && !this._hasActiveAlert(name, 'critical')) {
            this._createAlert(name, 'critical', `Error budget ${consumptionPercent.toFixed(1)}% consumed`, {
                consumed: budget.consumed,
                total: budget.total,
                remaining: budget.remaining
            });
        } else if (consumptionPercent > 75 && !this._hasActiveAlert(name, 'warning')) {
            this._createAlert(name, 'warning', `Error budget ${consumptionPercent.toFixed(1)}% consumed`, {
                consumed: budget.consumed,
                total: budget.total,
                remaining: budget.remaining
            });
        }
    }

    _checkBurnRates() {
        const now = Date.now();
        
        for (const [type, config] of Object.entries(BURN_RATE_WINDOWS)) {
            const burnRate = this._calculateBurnRate(config.window);
            
            this.burnRateHistory.push({
                type,
                rate: burnRate,
                timestamp: now,
                threshold: config.threshold
            });

            if (this.burnRateHistory.length > 1000) {
                this.burnRateHistory.shift();
            }

            if (burnRate > config.threshold) {
                this._createAlert('burn_rate', 'critical', 
                    `${type} burn rate ${burnRate.toFixed(2)}x exceeds threshold ${config.threshold}x`, {
                    burnRate,
                    threshold: config.threshold,
                    window: config.window
                });
            }
        }
    }

    _calculateBurnRate(windowMs) {
        const now = Date.now();
        const windowStart = now - windowMs;
        
        const recentSpans = this.telemetry.getRecentSpans(10000)
            .filter(span => span.startTime > windowStart);
        
        if (recentSpans.length === 0) return 0;

        const failedSpans = recentSpans.filter(span => span.status.code === 'ERROR').length;
        const errorRate = failedSpans / recentSpans.length;
        
        const budget = this.errorBudget.get('availability');
        if (!budget) return 0;

        const allowedErrorRate = 1 - (budget.target / 100);
        return allowedErrorRate > 0 ? errorRate / allowedErrorRate : 0;
    }

    _createAlert(metric, severity, message, metadata = {}) {
        const alert = {
            id: `${metric}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            metric,
            severity,
            message,
            metadata,
            timestamp: Date.now(),
            acknowledged: false,
            resolved: false
        };

        this.alerts.push(alert);
        
        if (this.alerts.length > 100) {
            this.alerts = this.alerts.slice(-100);
        }

        if (this.telemetry && this.telemetry.logger) {
            this.telemetry.logger.warn(`[SLA Alert] ${message}`, {
                metric,
                severity,
                ...metadata
            });
        }

        return alert;
    }

    _hasActiveAlert(metric, severity) {
        const recentWindow = Date.now() - 300000;
        return this.alerts.some(alert => 
            alert.metric === metric && 
            alert.severity === severity &&
            !alert.resolved &&
            alert.timestamp > recentWindow
        );
    }

    acknowledgeAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
            alert.acknowledgedAt = Date.now();
        }
        return alert;
    }

    resolveAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.resolved = true;
            alert.resolvedAt = Date.now();
        }
        return alert;
    }

    getStatus() {
        const budgets = {};
        for (const [name, budget] of this.errorBudget.entries()) {
            const consumptionPercent = (budget.consumed / budget.total) * 100;
            budgets[name] = {
                target: budget.target,
                consumed: budget.consumed,
                remaining: budget.remaining,
                total: budget.total,
                consumptionPercent: consumptionPercent.toFixed(2),
                status: consumptionPercent > 90 ? 'critical' : consumptionPercent > 75 ? 'warning' : 'healthy'
            };
        }

        const activeAlerts = this.alerts.filter(a => !a.resolved);
        
        return {
            objectives: this.objectives,
            errorBudgets: budgets,
            activeAlerts: activeAlerts.length,
            alerts: activeAlerts,
            burnRates: this._getCurrentBurnRates(),
            overallStatus: this._calculateOverallStatus(budgets, activeAlerts)
        };
    }

    _getCurrentBurnRates() {
        const rates = {};
        for (const [type, config] of Object.entries(BURN_RATE_WINDOWS)) {
            const recent = this.burnRateHistory
                .filter(h => h.type === type)
                .slice(-10);
            
            if (recent.length > 0) {
                const avgRate = recent.reduce((sum, h) => sum + h.rate, 0) / recent.length;
                rates[type] = {
                    current: avgRate.toFixed(2),
                    threshold: config.threshold,
                    status: avgRate > config.threshold ? 'critical' : 'healthy'
                };
            }
        }
        return rates;
    }

    _calculateOverallStatus(budgets, activeAlerts) {
        const hasCriticalAlert = activeAlerts.some(a => a.severity === 'critical');
        const hasCriticalBudget = Object.values(budgets).some(b => b.status === 'critical');
        
        if (hasCriticalAlert || hasCriticalBudget) return 'critical';
        
        const hasWarning = activeAlerts.some(a => a.severity === 'warning') ||
                          Object.values(budgets).some(b => b.status === 'warning');
        
        if (hasWarning) return 'warning';
        
        return 'healthy';
    }

    _persistMetrics() {
        try {
            const metricsFile = path.join(SLA_DATA_DIR, 'sla-metrics.json');
            const data = {
                timestamp: Date.now(),
                errorBudgets: Object.fromEntries(this.errorBudget),
                burnRateHistory: this.burnRateHistory.slice(-100),
                alerts: this.alerts.slice(-50)
            };
            fs.writeFileSync(metricsFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('[SLAMonitor] Failed to persist metrics:', error.message);
        }
    }

    resetBudgets() {
        this._initializeErrorBudgets();
        this.alerts = [];
        this.burnRateHistory = [];
    }

    exportReport(startTime, endTime) {
        const report = {
            period: {
                start: new Date(startTime).toISOString(),
                end: new Date(endTime).toISOString(),
                durationMs: endTime - startTime
            },
            objectives: this.objectives,
            errorBudgets: Object.fromEntries(this.errorBudget),
            alerts: this.alerts.filter(a => 
                a.timestamp >= startTime && a.timestamp <= endTime
            ),
            burnRates: this.burnRateHistory.filter(h => 
                h.timestamp >= startTime && h.timestamp <= endTime
            ),
            summary: {
                totalAlerts: this.alerts.length,
                criticalAlerts: this.alerts.filter(a => a.severity === 'critical').length,
                averageBurnRate: this._calculateAverageBurnRate(startTime, endTime)
            }
        };

        return report;
    }

    _calculateAverageBurnRate(startTime, endTime) {
        const relevantRates = this.burnRateHistory.filter(h => 
            h.timestamp >= startTime && h.timestamp <= endTime
        );
        
        if (relevantRates.length === 0) return 0;
        
        return relevantRates.reduce((sum, h) => sum + h.rate, 0) / relevantRates.length;
    }
}

module.exports = {
    SLAMonitor,
    DEFAULT_SLA_OBJECTIVES,
    BURN_RATE_WINDOWS
};
