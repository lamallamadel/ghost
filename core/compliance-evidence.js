const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const EVIDENCE_DIR = path.join(os.homedir(), '.ghost', 'compliance-evidence');
const AUDIT_REPORTS_DIR = path.join(EVIDENCE_DIR, 'audit-reports');

const COMPLIANCE_FRAMEWORKS = {
    SOC2: 'soc2',
    ISO27001: 'iso27001',
    HIPAA: 'hipaa',
    GDPR: 'gdpr'
};

class ComplianceEvidence {
    constructor(telemetry, options = {}) {
        this.telemetry = telemetry;
        this.enabled = options.enabled !== false;
        
        this.evidenceStore = new Map();
        this.controls = new Map();
        this.auditTrail = [];
        
        this._ensureDirectories();
        this._loadComplianceControls();
        this._startEvidenceCollection();
    }

    _ensureDirectories() {
        try {
            if (!fs.existsSync(EVIDENCE_DIR)) {
                fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
            }
            if (!fs.existsSync(AUDIT_REPORTS_DIR)) {
                fs.mkdirSync(AUDIT_REPORTS_DIR, { recursive: true });
            }
        } catch (error) {
            console.error('[ComplianceEvidence] Failed to create directories:', error.message);
        }
    }

    _loadComplianceControls() {
        this.controls.set('access_control', {
            id: 'CC6.1',
            framework: COMPLIANCE_FRAMEWORKS.SOC2,
            name: 'Logical and Physical Access Controls',
            description: 'Access to system resources is restricted to authorized users',
            evidenceTypes: ['authentication_logs', 'authorization_events', 'access_reviews']
        });

        this.controls.set('encryption', {
            id: 'CC6.7',
            framework: COMPLIANCE_FRAMEWORKS.SOC2,
            name: 'Transmission and Storage Encryption',
            description: 'Data is encrypted in transit and at rest',
            evidenceTypes: ['encryption_status', 'tls_certificates', 'data_classification']
        });

        this.controls.set('monitoring', {
            id: 'CC7.2',
            framework: COMPLIANCE_FRAMEWORKS.SOC2,
            name: 'System Monitoring',
            description: 'System performance and security are monitored',
            evidenceTypes: ['telemetry_logs', 'performance_metrics', 'security_alerts']
        });

        this.controls.set('incident_response', {
            id: 'CC7.3',
            framework: COMPLIANCE_FRAMEWORKS.SOC2,
            name: 'Incident Detection and Response',
            description: 'Security incidents are detected and responded to appropriately',
            evidenceTypes: ['incident_logs', 'response_procedures', 'escalation_records']
        });

        this.controls.set('change_management', {
            id: 'CC8.1',
            framework: COMPLIANCE_FRAMEWORKS.SOC2,
            name: 'Change Management',
            description: 'Changes to system are authorized, tested, and documented',
            evidenceTypes: ['change_logs', 'approval_records', 'rollback_procedures']
        });

        this.controls.set('risk_assessment', {
            id: 'A.5.1.2',
            framework: COMPLIANCE_FRAMEWORKS.ISO27001,
            name: 'Information Security Risk Assessment',
            description: 'Regular risk assessments are conducted',
            evidenceTypes: ['risk_assessments', 'threat_analysis', 'vulnerability_scans']
        });

        this.controls.set('asset_management', {
            id: 'A.8.1.1',
            framework: COMPLIANCE_FRAMEWORKS.ISO27001,
            name: 'Inventory of Assets',
            description: 'Assets associated with information are identified and managed',
            evidenceTypes: ['asset_inventory', 'ownership_records', 'classification']
        });

        this.controls.set('operations_security', {
            id: 'A.12.1.1',
            framework: COMPLIANCE_FRAMEWORKS.ISO27001,
            name: 'Operating Procedures and Responsibilities',
            description: 'Operating procedures are documented and made available',
            evidenceTypes: ['operational_procedures', 'runbooks', 'sop_documents']
        });

        this.controls.set('audit_logging', {
            id: 'A.12.4.1',
            framework: COMPLIANCE_FRAMEWORKS.ISO27001,
            name: 'Event Logging',
            description: 'Event logs recording activities, exceptions, and information security events are produced and maintained',
            evidenceTypes: ['audit_logs', 'event_records', 'log_retention_policy']
        });
    }

    _startEvidenceCollection() {
        setInterval(() => {
            this._collectEvidence();
        }, 3600000);
    }

    _collectEvidence() {
        if (!this.enabled) return;

        const timestamp = Date.now();

        this._collectAuthenticationEvidence(timestamp);
        this._collectMonitoringEvidence(timestamp);
        this._collectSecurityEvidence(timestamp);
        this._collectOperationalEvidence(timestamp);
        this._collectAuditEvidence(timestamp);
    }

    _collectAuthenticationEvidence(timestamp) {
        const logs = this.telemetry?.logger?.readLogs({ 
            limit: 1000,
            layer: 'auth'
        }) || [];

        const authEvents = logs.filter(log => 
            log.layer === 'auth' || 
            log.message?.includes('authentication') ||
            log.message?.includes('authorization')
        );

        this._storeEvidence({
            control: 'access_control',
            type: 'authentication_logs',
            timestamp,
            data: {
                totalEvents: authEvents.length,
                successfulAuth: authEvents.filter(e => !e.errorCode).length,
                failedAuth: authEvents.filter(e => e.errorCode).length,
                sampleEvents: authEvents.slice(0, 10)
            },
            hash: this._hashData(authEvents)
        });
    }

    _collectMonitoringEvidence(timestamp) {
        const metrics = this.telemetry?.metrics?.getMetrics() || {};
        const spans = this.telemetry?.getRecentSpans(1000) || [];

        this._storeEvidence({
            control: 'monitoring',
            type: 'telemetry_logs',
            timestamp,
            data: {
                metricsCollected: Object.keys(metrics).length,
                spansRecorded: spans.length,
                metrics: {
                    requests: Object.keys(metrics.requests || {}).length,
                    latencies: Object.keys(metrics.latencies || {}).length,
                    errors: Object.keys(metrics.validationFailures || {}).length
                }
            },
            hash: this._hashData({ metrics, spans: spans.length })
        });

        this._storeEvidence({
            control: 'monitoring',
            type: 'performance_metrics',
            timestamp,
            data: {
                latencyMetrics: metrics.latencies || {},
                requestCounts: metrics.requests || {},
                errorRates: metrics.validationFailures || {}
            },
            hash: this._hashData(metrics)
        });
    }

    _collectSecurityEvidence(timestamp) {
        const securityLogs = this.telemetry?.logger?.readLogs({
            severity: 'SECURITY_ALERT',
            limit: 1000
        }) || [];

        const rateLimitViolations = this.telemetry?.metrics?.getMetrics()?.rateLimitViolations || {};
        const authFailures = this.telemetry?.metrics?.getMetrics()?.authFailures || {};

        this._storeEvidence({
            control: 'incident_response',
            type: 'security_alerts',
            timestamp,
            data: {
                securityAlerts: securityLogs.length,
                rateLimitViolations: Object.values(rateLimitViolations).reduce((sum, v) => sum + v, 0),
                authFailures: Object.values(authFailures).reduce((sum, codes) => 
                    sum + Object.values(codes).reduce((s, c) => s + c, 0), 0
                ),
                sampleAlerts: securityLogs.slice(0, 5)
            },
            hash: this._hashData(securityLogs)
        });
    }

    _collectOperationalEvidence(timestamp) {
        const errorLogs = this.telemetry?.logger?.readLogs({
            severity: 'ERROR',
            limit: 1000
        }) || [];

        this._storeEvidence({
            control: 'operations_security',
            type: 'operational_procedures',
            timestamp,
            data: {
                totalErrors: errorLogs.length,
                errorsByExtension: this._groupBy(errorLogs, 'extensionId'),
                errorsByType: this._groupBy(errorLogs, 'errorCode'),
                recentErrors: errorLogs.slice(0, 10)
            },
            hash: this._hashData(errorLogs)
        });
    }

    _collectAuditEvidence(timestamp) {
        const allLogs = this.telemetry?.logger?.readLogs({
            limit: 5000
        }) || [];

        const auditSummary = {
            totalEvents: allLogs.length,
            bySeverity: this._groupBy(allLogs, 'severity'),
            byLayer: this._groupBy(allLogs, 'layer'),
            byExtension: this._groupBy(allLogs, 'extensionId'),
            timeRange: {
                earliest: allLogs[0]?.timestamp,
                latest: allLogs[allLogs.length - 1]?.timestamp
            }
        };

        this._storeEvidence({
            control: 'audit_logging',
            type: 'audit_logs',
            timestamp,
            data: auditSummary,
            hash: this._hashData(auditSummary)
        });
    }

    _storeEvidence(evidence) {
        const key = `${evidence.control}_${evidence.type}_${evidence.timestamp}`;
        
        this.evidenceStore.set(key, {
            ...evidence,
            id: key,
            collected: new Date(evidence.timestamp).toISOString(),
            tamperProof: true
        });

        this.auditTrail.push({
            action: 'evidence_collected',
            control: evidence.control,
            type: evidence.type,
            timestamp: evidence.timestamp,
            hash: evidence.hash
        });

        if (this.auditTrail.length > 10000) {
            this.auditTrail.shift();
        }

        this._persistEvidence(evidence);
    }

    _hashData(data) {
        const hash = crypto.createHash('sha256');
        hash.update(JSON.stringify(data));
        return hash.digest('hex');
    }

    _groupBy(array, key) {
        const grouped = {};
        for (const item of array) {
            const groupKey = item[key] || 'unknown';
            if (!grouped[groupKey]) {
                grouped[groupKey] = 0;
            }
            grouped[groupKey]++;
        }
        return grouped;
    }

    _persistEvidence(evidence) {
        try {
            const evidenceFile = path.join(EVIDENCE_DIR, `${evidence.control}_${Date.now()}.json`);
            fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2));
        } catch (error) {
            console.error('[ComplianceEvidence] Failed to persist evidence:', error.message);
        }
    }

    generateSOC2Report(startDate, endDate) {
        const report = {
            reportType: 'SOC 2 Type II',
            framework: COMPLIANCE_FRAMEWORKS.SOC2,
            reportingPeriod: {
                start: new Date(startDate).toISOString(),
                end: new Date(endDate).toISOString()
            },
            generatedAt: new Date().toISOString(),
            controls: [],
            summary: {
                totalControls: 0,
                controlsWithEvidence: 0,
                evidenceItems: 0,
                complianceScore: 0
            }
        };

        for (const [controlId, control] of this.controls.entries()) {
            if (control.framework !== COMPLIANCE_FRAMEWORKS.SOC2) continue;

            const evidence = this._getEvidenceForControl(controlId, startDate, endDate);
            
            report.controls.push({
                id: control.id,
                name: control.name,
                description: control.description,
                status: evidence.length > 0 ? 'compliant' : 'non-compliant',
                evidenceCount: evidence.length,
                evidence: evidence.map(e => ({
                    type: e.type,
                    collected: e.collected,
                    hash: e.hash,
                    summary: this._summarizeEvidence(e)
                }))
            });

            report.summary.totalControls++;
            if (evidence.length > 0) {
                report.summary.controlsWithEvidence++;
                report.summary.evidenceItems += evidence.length;
            }
        }

        report.summary.complianceScore = report.summary.totalControls > 0
            ? (report.summary.controlsWithEvidence / report.summary.totalControls * 100).toFixed(2)
            : 0;

        this._persistReport(report, 'soc2');
        return report;
    }

    generateISO27001Report(startDate, endDate) {
        const report = {
            reportType: 'ISO 27001:2013',
            framework: COMPLIANCE_FRAMEWORKS.ISO27001,
            reportingPeriod: {
                start: new Date(startDate).toISOString(),
                end: new Date(endDate).toISOString()
            },
            generatedAt: new Date().toISOString(),
            controls: [],
            summary: {
                totalControls: 0,
                controlsWithEvidence: 0,
                evidenceItems: 0,
                complianceScore: 0
            }
        };

        for (const [controlId, control] of this.controls.entries()) {
            if (control.framework !== COMPLIANCE_FRAMEWORKS.ISO27001) continue;

            const evidence = this._getEvidenceForControl(controlId, startDate, endDate);
            
            report.controls.push({
                id: control.id,
                name: control.name,
                description: control.description,
                status: evidence.length > 0 ? 'implemented' : 'not_implemented',
                evidenceCount: evidence.length,
                evidence: evidence.map(e => ({
                    type: e.type,
                    collected: e.collected,
                    hash: e.hash,
                    summary: this._summarizeEvidence(e)
                }))
            });

            report.summary.totalControls++;
            if (evidence.length > 0) {
                report.summary.controlsWithEvidence++;
                report.summary.evidenceItems += evidence.length;
            }
        }

        report.summary.complianceScore = report.summary.totalControls > 0
            ? (report.summary.controlsWithEvidence / report.summary.totalControls * 100).toFixed(2)
            : 0;

        this._persistReport(report, 'iso27001');
        return report;
    }

    _getEvidenceForControl(controlId, startDate, endDate) {
        const evidence = [];
        
        for (const [key, item] of this.evidenceStore.entries()) {
            if (item.control === controlId &&
                item.timestamp >= startDate &&
                item.timestamp <= endDate) {
                evidence.push(item);
            }
        }

        return evidence;
    }

    _summarizeEvidence(evidence) {
        const data = evidence.data;
        
        if (data.totalEvents !== undefined) {
            return `${data.totalEvents} events recorded`;
        }
        if (data.metricsCollected !== undefined) {
            return `${data.metricsCollected} metrics collected, ${data.spansRecorded} spans recorded`;
        }
        if (data.securityAlerts !== undefined) {
            return `${data.securityAlerts} security alerts, ${data.rateLimitViolations} rate limit violations`;
        }
        if (data.totalErrors !== undefined) {
            return `${data.totalErrors} errors logged`;
        }
        
        return 'Evidence collected';
    }

    _persistReport(report, type) {
        try {
            const filename = `${type}-report-${Date.now()}.json`;
            const reportFile = path.join(AUDIT_REPORTS_DIR, filename);
            fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

            const hashFile = path.join(AUDIT_REPORTS_DIR, `${filename}.sha256`);
            const hash = this._hashData(report);
            fs.writeFileSync(hashFile, hash);

            console.log(`[ComplianceEvidence] Report saved: ${reportFile}`);
        } catch (error) {
            console.error('[ComplianceEvidence] Failed to persist report:', error.message);
        }
    }

    generateCompliancePackage(framework, startDate, endDate) {
        let report;
        
        if (framework === COMPLIANCE_FRAMEWORKS.SOC2) {
            report = this.generateSOC2Report(startDate, endDate);
        } else if (framework === COMPLIANCE_FRAMEWORKS.ISO27001) {
            report = this.generateISO27001Report(startDate, endDate);
        } else {
            throw new Error(`Unknown framework: ${framework}`);
        }

        const packageData = {
            ...report,
            auditTrail: this.auditTrail.filter(a => 
                a.timestamp >= startDate && a.timestamp <= endDate
            ),
            metadata: {
                systemInfo: {
                    nodeVersion: process.version,
                    platform: process.platform,
                    arch: process.arch
                },
                collectionPeriod: {
                    start: new Date(startDate).toISOString(),
                    end: new Date(endDate).toISOString(),
                    durationDays: Math.ceil((endDate - startDate) / 86400000)
                }
            }
        };

        return packageData;
    }

    verifyEvidence(evidenceId) {
        const evidence = this.evidenceStore.get(evidenceId);
        if (!evidence) {
            return { valid: false, reason: 'Evidence not found' };
        }

        const recomputedHash = this._hashData(evidence.data);
        const hashMatches = recomputedHash === evidence.hash;

        return {
            valid: hashMatches,
            evidenceId,
            collected: evidence.collected,
            hash: evidence.hash,
            recomputedHash,
            tamperProof: evidence.tamperProof && hashMatches
        };
    }

    getComplianceStatus() {
        const status = {
            timestamp: Date.now(),
            frameworks: {}
        };

        for (const framework of Object.values(COMPLIANCE_FRAMEWORKS)) {
            const controls = Array.from(this.controls.values())
                .filter(c => c.framework === framework);
            
            const controlsWithEvidence = controls.filter(c => {
                const evidence = this._getEvidenceForControl(c.id, Date.now() - 2592000000, Date.now());
                return evidence.length > 0;
            });

            status.frameworks[framework] = {
                totalControls: controls.length,
                controlsWithEvidence: controlsWithEvidence.length,
                compliancePercentage: controls.length > 0
                    ? ((controlsWithEvidence.length / controls.length) * 100).toFixed(2)
                    : 0,
                status: controlsWithEvidence.length === controls.length ? 'compliant' : 'partial'
            };
        }

        return status;
    }
}

module.exports = {
    ComplianceEvidence,
    COMPLIANCE_FRAMEWORKS
};
