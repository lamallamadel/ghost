const { SLAMonitor } = require('./sla-monitoring');
const { RunbookAutomation } = require('./runbook-automation');
const { ChaosEngineering } = require('./chaos-engineering');
const { CapacityForecasting } = require('./capacity-forecasting');
const { ComplianceEvidence } = require('./compliance-evidence');

class OperationalMaturityFramework {
    constructor(runtime, telemetry, advancedRateLimiting, circuitBreaker, options = {}) {
        this.runtime = runtime;
        this.telemetry = telemetry;
        this.advancedRateLimiting = advancedRateLimiting;
        this.circuitBreaker = circuitBreaker;
        this.options = options;

        this.slaMonitor = new SLAMonitor(
            telemetry.metrics,
            telemetry,
            { enabled: options.slaMonitoring !== false }
        );

        this.runbookAutomation = new RunbookAutomation(
            runtime,
            advancedRateLimiting,
            circuitBreaker,
            telemetry,
            { enabled: options.runbookAutomation !== false }
        );

        this.chaosEngineering = new ChaosEngineering(
            runtime,
            telemetry,
            circuitBreaker,
            { enabled: options.chaosEngineering !== false }
        );

        this.capacityForecasting = new CapacityForecasting(
            telemetry,
            { enabled: options.capacityForecasting !== false }
        );

        this.complianceEvidence = new ComplianceEvidence(
            telemetry,
            { enabled: options.complianceEvidence !== false }
        );

        this.initialized = true;
        console.log('[OperationalMaturity] Framework initialized');
    }

    recordRequest(extensionId, success, latencyMs) {
        if (this.slaMonitor) {
            this.slaMonitor.recordRequest(extensionId, success, latencyMs);
        }
    }

    async handleIncident(incidentType, context = {}) {
        const runbookMap = {
            'extension_failed': 'restart_failed_extension',
            'extension_crashed': 'restart_failed_extension',
            'rate_limit_stuck': 'clear_rate_limit_state',
            'circuit_breaker_stuck_open': 'reset_circuit_breaker',
            'high_load_detected': 'scale_rate_limits',
            'pending_request_timeout': 'cleanup_stuck_requests'
        };

        const runbookId = runbookMap[incidentType];
        if (!runbookId) {
            console.warn(`[OperationalMaturity] No runbook found for incident: ${incidentType}`);
            return null;
        }

        const runbook = this.runbookAutomation.getRunbook(runbookId);
        if (runbook && runbook.autoExecute) {
            console.log(`[OperationalMaturity] Auto-executing runbook: ${runbook.name}`);
            return await this.runbookAutomation.executeRunbook(runbookId, context);
        }

        return null;
    }

    getOperationalStatus() {
        return {
            timestamp: Date.now(),
            slo: this.slaMonitor?.getStatus() || { status: 'unavailable' },
            capacity: {
                warnings: this.capacityForecasting?.getExhaustionWarnings() || [],
                forecasts: this.capacityForecasting?.getForecasts()?.length || 0
            },
            chaos: {
                activeExperiments: this.chaosEngineering?.getActiveExperiments()?.length || 0,
                totalExperiments: this.chaosEngineering?.getAllExperiments()?.length || 0
            },
            runbooks: {
                total: this.runbookAutomation?.getRunbooks()?.length || 0,
                recentExecutions: this.runbookAutomation?.getExecutionHistory(10)?.length || 0
            },
            compliance: this.complianceEvidence?.getComplianceStatus() || { status: 'unavailable' }
        };
    }

    async generateMaturityReport() {
        const report = {
            generatedAt: new Date().toISOString(),
            timestamp: Date.now(),
            sections: {}
        };

        if (this.slaMonitor) {
            report.sections.sla = {
                status: this.slaMonitor.getStatus(),
                objectives: this.slaMonitor.objectives
            };
        }

        if (this.capacityForecasting) {
            report.sections.capacity = this.capacityForecasting.getCapacityReport();
        }

        if (this.chaosEngineering) {
            report.sections.resilience = this.chaosEngineering.generateResilienceReport();
        }

        if (this.runbookAutomation) {
            report.sections.automation = {
                runbooks: this.runbookAutomation.getRunbooks().map(r => ({
                    id: r.id,
                    name: r.name,
                    autoExecute: r.autoExecute,
                    triggers: r.triggers
                })),
                recentExecutions: this.runbookAutomation.getExecutionHistory(20)
            };
        }

        if (this.complianceEvidence) {
            report.sections.compliance = this.complianceEvidence.getComplianceStatus();
        }

        report.summary = {
            maturityScore: this._calculateMaturityScore(report),
            readinessLevel: this._calculateReadinessLevel(report),
            recommendations: this._generateRecommendations(report)
        };

        return report;
    }

    _calculateMaturityScore(report) {
        let score = 0;
        let maxScore = 0;

        if (report.sections.sla) {
            maxScore += 25;
            const sloStatus = report.sections.sla.status;
            if (sloStatus.overallStatus === 'healthy') score += 25;
            else if (sloStatus.overallStatus === 'warning') score += 15;
            else score += 5;
        }

        if (report.sections.capacity) {
            maxScore += 20;
            const warnings = report.sections.capacity.exhaustionWarnings?.length || 0;
            if (warnings === 0) score += 20;
            else if (warnings < 3) score += 10;
            else score += 5;
        }

        if (report.sections.resilience) {
            maxScore += 20;
            const experiments = report.sections.resilience.totalExperiments;
            if (experiments >= 5) score += 20;
            else if (experiments >= 2) score += 10;
            else score += 5;
        }

        if (report.sections.automation) {
            maxScore += 20;
            const runbooks = report.sections.automation.runbooks?.length || 0;
            if (runbooks >= 5) score += 20;
            else if (runbooks >= 3) score += 10;
            else score += 5;
        }

        if (report.sections.compliance) {
            maxScore += 15;
            const frameworks = Object.values(report.sections.compliance.frameworks || {});
            const avgCompliance = frameworks.reduce((sum, f) => 
                sum + parseFloat(f.compliancePercentage), 0) / frameworks.length;
            if (avgCompliance >= 90) score += 15;
            else if (avgCompliance >= 70) score += 10;
            else score += 5;
        }

        return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    }

    _calculateReadinessLevel(report) {
        const score = this._calculateMaturityScore(report);
        
        if (score >= 90) return 'production_ready';
        if (score >= 75) return 'near_production';
        if (score >= 60) return 'development';
        if (score >= 40) return 'early_stage';
        return 'initial';
    }

    _generateRecommendations(report) {
        const recommendations = [];

        if (report.sections.sla) {
            const sloStatus = report.sections.sla.status;
            if (sloStatus.overallStatus === 'critical') {
                recommendations.push({
                    priority: 'high',
                    category: 'slo',
                    message: 'Critical SLO violations detected. Immediate action required.',
                    actions: ['Review error budgets', 'Investigate recent changes', 'Scale resources']
                });
            }
        }

        if (report.sections.capacity) {
            const warnings = report.sections.capacity.exhaustionWarnings || [];
            const criticalWarnings = warnings.filter(w => w.minutesUntilExhaustion < 60);
            if (criticalWarnings.length > 0) {
                recommendations.push({
                    priority: 'high',
                    category: 'capacity',
                    message: `${criticalWarnings.length} resources will exhaust within 1 hour`,
                    actions: ['Scale up immediately', 'Enable circuit breakers', 'Review traffic patterns']
                });
            }
        }

        if (report.sections.resilience) {
            const experiments = report.sections.resilience.totalExperiments;
            if (experiments < 3) {
                recommendations.push({
                    priority: 'medium',
                    category: 'resilience',
                    message: 'Limited chaos engineering coverage',
                    actions: ['Run more resilience experiments', 'Test failure scenarios', 'Validate recovery procedures']
                });
            }
        }

        if (report.sections.automation) {
            const runbooks = report.sections.automation.runbooks?.length || 0;
            if (runbooks < 5) {
                recommendations.push({
                    priority: 'medium',
                    category: 'automation',
                    message: 'Expand runbook coverage',
                    actions: ['Document common incidents', 'Automate repetitive tasks', 'Create escalation procedures']
                });
            }
        }

        if (report.sections.compliance) {
            const frameworks = Object.values(report.sections.compliance.frameworks || {});
            const nonCompliant = frameworks.filter(f => f.status !== 'compliant');
            if (nonCompliant.length > 0) {
                recommendations.push({
                    priority: 'medium',
                    category: 'compliance',
                    message: `${nonCompliant.length} compliance framework(s) need attention`,
                    actions: ['Collect missing evidence', 'Review control implementations', 'Update documentation']
                });
            }
        }

        return recommendations;
    }

    async exportCompliancePackage(framework, startDate, endDate) {
        if (!this.complianceEvidence) {
            throw new Error('Compliance evidence collection is not enabled');
        }

        return this.complianceEvidence.generateCompliancePackage(framework, startDate, endDate);
    }

    getGrafanaDashboardConfig() {
        const fs = require('fs');
        const path = require('path');
        const dashboardPath = path.join(__dirname, 'grafana-dashboard-slo.json');
        
        try {
            return JSON.parse(fs.readFileSync(dashboardPath, 'utf8'));
        } catch (error) {
            console.error('[OperationalMaturity] Failed to load Grafana dashboard:', error.message);
            return null;
        }
    }
}

module.exports = {
    OperationalMaturityFramework
};
