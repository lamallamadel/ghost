const MITRE_ATTACK_TECHNIQUES = {
    'T1059': { name: 'Command and Scripting Interpreter', tactic: 'Execution' },
    'T1071': { name: 'Application Layer Protocol', tactic: 'Command and Control' },
    'T1090': { name: 'Proxy', tactic: 'Command and Control' },
    'T1110': { name: 'Brute Force', tactic: 'Credential Access' },
    'T1203': { name: 'Exploitation for Client Execution', tactic: 'Execution' },
    'T1486': { name: 'Data Encrypted for Impact', tactic: 'Impact' },
    'T1496': { name: 'Resource Hijacking', tactic: 'Impact' },
    'T1498': { name: 'Network Denial of Service', tactic: 'Impact' },
    'T1499': { name: 'Endpoint Denial of Service', tactic: 'Impact' },
    'T1562': { name: 'Impair Defenses', tactic: 'Defense Evasion' },
    'T1564': { name: 'Hide Artifacts', tactic: 'Defense Evasion' },
    'T1567': { name: 'Exfiltration Over Web Service', tactic: 'Exfiltration' }
};

class SecurityDashboard {
    constructor(options = {}) {
        this.ids = options.ids;
        this.policyEngine = options.policyEngine;
        this.telemetry = options.telemetry;
        this.codeSigningManager = options.codeSigningManager;
        this.threatIndicators = new Map();
        this.securityEvents = [];
        this.maxEvents = options.maxEvents || 1000;
    }

    recordSecurityEvent(event) {
        const now = Date.now();
        this.securityEvents.push({
            ...event,
            timestamp: now
        });

        if (this.securityEvents.length > this.maxEvents) {
            this.securityEvents.shift();
        }

        this._updateThreatIndicators(event);
    }

    _updateThreatIndicators(event) {
        const { extensionId, type, severity } = event;

        if (!this.threatIndicators.has(extensionId)) {
            this.threatIndicators.set(extensionId, {
                riskScore: 0,
                mitreMapping: new Set(),
                indicators: []
            });
        }

        const indicators = this.threatIndicators.get(extensionId);
        
        indicators.indicators.push({
            type,
            severity,
            timestamp: event.timestamp
        });

        const mitreId = this._mapToMITRE(type);
        if (mitreId) {
            indicators.mitreMapping.add(mitreId);
        }

        this._calculateThreatScore(extensionId);
    }

    _mapToMITRE(eventType) {
        const mapping = {
            'command-injection': 'T1059',
            'network-anomaly': 'T1071',
            'unusual-destination': 'T1071',
            'excessive-network-activity': 'T1498',
            'repeated-validation-failures': 'T1110',
            'cpu-spike': 'T1496',
            'memory-spike': 'T1496',
            'suspicious-pattern': 'T1203',
            'unsigned-extension': 'T1562'
        };

        return mapping[eventType] || null;
    }

    _calculateThreatScore(extensionId) {
        const indicators = this.threatIndicators.get(extensionId);
        
        const severityWeights = {
            low: 1,
            medium: 3,
            high: 5,
            critical: 10
        };

        let score = 0;
        const recentIndicators = indicators.indicators.filter(
            i => Date.now() - i.timestamp < 3600000
        );

        for (const indicator of recentIndicators) {
            score += severityWeights[indicator.severity] || 1;
        }

        indicators.riskScore = Math.min(100, score);
    }

    getDashboardData() {
        const now = Date.now();
        const last24h = now - 86400000;

        const recentEvents = this.securityEvents.filter(e => e.timestamp > last24h);

        const eventsBySeverity = {
            low: 0,
            medium: 0,
            high: 0,
            critical: 0
        };

        const eventsByType = {};
        const topExtensions = {};

        for (const event of recentEvents) {
            if (event.severity) {
                eventsBySeverity[event.severity]++;
            }

            if (event.type) {
                eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
            }

            if (event.extensionId) {
                topExtensions[event.extensionId] = (topExtensions[event.extensionId] || 0) + 1;
            }
        }

        const mitreMapping = this._getMITREMapping();

        const topThreats = Array.from(this.threatIndicators.entries())
            .map(([extensionId, data]) => ({
                extensionId,
                riskScore: data.riskScore,
                techniqueCount: data.mitreMapping.size,
                recentIndicators: data.indicators.filter(i => now - i.timestamp < 3600000).length
            }))
            .sort((a, b) => b.riskScore - a.riskScore)
            .slice(0, 10);

        const policyViolations = this._getPolicyViolations();
        const idsAlerts = this.ids ? this.ids.getAlerts({ limit: 20 }) : [];
        const unsignedExtensions = this._getUnsignedExtensions();

        return {
            summary: {
                totalEvents: recentEvents.length,
                criticalAlerts: eventsBySeverity.critical,
                highAlerts: eventsBySeverity.high,
                mediumAlerts: eventsBySeverity.medium,
                lowAlerts: eventsBySeverity.low,
                topThreats: topThreats.length
            },
            eventsBySeverity,
            eventsByType: Object.entries(eventsByType)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([type, count]) => ({ type, count })),
            topExtensions: Object.entries(topExtensions)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([extensionId, count]) => ({ extensionId, count })),
            topThreats,
            mitreMapping,
            policyViolations,
            idsAlerts,
            unsignedExtensions,
            timestamp: now
        };
    }

    _getMITREMapping() {
        const mapping = {};

        for (const [extensionId, data] of this.threatIndicators.entries()) {
            for (const techniqueId of data.mitreMapping) {
                if (!mapping[techniqueId]) {
                    mapping[techniqueId] = {
                        ...MITRE_ATTACK_TECHNIQUES[techniqueId],
                        id: techniqueId,
                        extensions: []
                    };
                }
                mapping[techniqueId].extensions.push(extensionId);
            }
        }

        return Object.values(mapping).sort((a, b) => 
            b.extensions.length - a.extensions.length
        );
    }

    _getPolicyViolations() {
        if (!this.policyEngine) return [];

        const violations = [];
        const recentEvents = this.securityEvents.filter(
            e => e.type === 'policy-violation' && Date.now() - e.timestamp < 86400000
        );

        const violationsByPolicy = {};
        for (const event of recentEvents) {
            const policyId = event.policyId || 'unknown';
            if (!violationsByPolicy[policyId]) {
                violationsByPolicy[policyId] = {
                    policyId,
                    count: 0,
                    extensions: new Set()
                };
            }
            violationsByPolicy[policyId].count++;
            if (event.extensionId) {
                violationsByPolicy[policyId].extensions.add(event.extensionId);
            }
        }

        for (const [policyId, data] of Object.entries(violationsByPolicy)) {
            violations.push({
                policyId,
                count: data.count,
                extensionCount: data.extensions.size,
                extensions: Array.from(data.extensions)
            });
        }

        return violations.sort((a, b) => b.count - a.count).slice(0, 10);
    }

    _getUnsignedExtensions() {
        if (!this.codeSigningManager) return [];

        return [];
    }

    getThreatTimeline(hours = 24) {
        const now = Date.now();
        const startTime = now - (hours * 3600000);
        const bucketSize = hours <= 24 ? 3600000 : 3600000 * 4;
        
        const buckets = Math.ceil((now - startTime) / bucketSize);
        const timeline = [];

        for (let i = 0; i < buckets; i++) {
            const bucketStart = startTime + (i * bucketSize);
            const bucketEnd = bucketStart + bucketSize;

            const eventsInBucket = this.securityEvents.filter(
                e => e.timestamp >= bucketStart && e.timestamp < bucketEnd
            );

            timeline.push({
                timestamp: bucketStart,
                total: eventsInBucket.length,
                critical: eventsInBucket.filter(e => e.severity === 'critical').length,
                high: eventsInBucket.filter(e => e.severity === 'high').length,
                medium: eventsInBucket.filter(e => e.severity === 'medium').length,
                low: eventsInBucket.filter(e => e.severity === 'low').length
            });
        }

        return timeline;
    }

    getExtensionThreatProfile(extensionId) {
        const indicators = this.threatIndicators.get(extensionId);
        if (!indicators) {
            return {
                extensionId,
                riskScore: 0,
                mitreMapping: [],
                indicators: [],
                recentEvents: []
            };
        }

        const recentEvents = this.securityEvents.filter(
            e => e.extensionId === extensionId && Date.now() - e.timestamp < 86400000
        );

        return {
            extensionId,
            riskScore: indicators.riskScore,
            mitreMapping: Array.from(indicators.mitreMapping).map(id => ({
                id,
                ...MITRE_ATTACK_TECHNIQUES[id]
            })),
            indicators: indicators.indicators.slice(-50),
            recentEvents: recentEvents.slice(-50)
        };
    }

    getSecurityMetrics() {
        const now = Date.now();
        const last24h = now - 86400000;
        const last7d = now - 604800000;

        const events24h = this.securityEvents.filter(e => e.timestamp > last24h);
        const events7d = this.securityEvents.filter(e => e.timestamp > last7d);

        return {
            last24Hours: {
                totalEvents: events24h.length,
                criticalEvents: events24h.filter(e => e.severity === 'critical').length,
                highEvents: events24h.filter(e => e.severity === 'high').length,
                uniqueExtensions: new Set(events24h.map(e => e.extensionId).filter(Boolean)).size,
                mitreATTACKTechniques: new Set(
                    events24h.map(e => this._mapToMITRE(e.type)).filter(Boolean)
                ).size
            },
            last7Days: {
                totalEvents: events7d.length,
                avgEventsPerDay: Math.round(events7d.length / 7),
                criticalEvents: events7d.filter(e => e.severity === 'critical').length,
                highEvents: events7d.filter(e => e.severity === 'high').length,
                uniqueExtensions: new Set(events7d.map(e => e.extensionId).filter(Boolean)).size,
                mitreATTACKTechniques: new Set(
                    events7d.map(e => this._mapToMITRE(e.type)).filter(Boolean)
                ).size
            },
            threatLevel: this._calculateOverallThreatLevel()
        };
    }

    _calculateOverallThreatLevel() {
        const now = Date.now();
        const last1h = now - 3600000;
        
        const recentCritical = this.securityEvents.filter(
            e => e.timestamp > last1h && e.severity === 'critical'
        ).length;

        const recentHigh = this.securityEvents.filter(
            e => e.timestamp > last1h && e.severity === 'high'
        ).length;

        if (recentCritical > 5 || recentHigh > 10) {
            return 'critical';
        } else if (recentCritical > 0 || recentHigh > 5) {
            return 'high';
        } else if (recentHigh > 0) {
            return 'medium';
        }

        return 'low';
    }
}

module.exports = { SecurityDashboard, MITRE_ATTACK_TECHNIQUES };
