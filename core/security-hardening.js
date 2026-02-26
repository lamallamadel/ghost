const { TelemetryAuthManager } = require('./telemetry-auth');
const { CodeSigningManager } = require('./code-signing');
const { SecurityPolicyEngine } = require('./security-policy-engine');
const { IntrusionDetectionSystem } = require('./intrusion-detection');
const { SecretsManager } = require('./secrets-manager');
const { SecurityDashboard } = require('./security-dashboard');

class SecurityHardeningManager {
    constructor(options = {}) {
        this.telemetryAuth = new TelemetryAuthManager(options.telemetryAuth);
        this.codeSigningManager = new CodeSigningManager(options.codeSigning);
        this.policyEngine = new SecurityPolicyEngine(options.policyEngine);
        this.ids = new IntrusionDetectionSystem(options.ids);
        this.secretsManager = new SecretsManager(options.secrets);
        
        this.dashboard = new SecurityDashboard({
            ids: this.ids,
            policyEngine: this.policyEngine,
            codeSigningManager: this.codeSigningManager,
            ...options.dashboard
        });

        this._setupEventHandlers();
    }

    _setupEventHandlers() {
        this.ids.on('anomaly-detected', (alert) => {
            this.dashboard.recordSecurityEvent({
                type: alert.type,
                severity: alert.severity,
                extensionId: alert.extensionId,
                details: alert
            });
        });

        this.ids.on('high-risk-extension', (data) => {
            this.dashboard.recordSecurityEvent({
                type: 'high-risk-detected',
                severity: 'critical',
                extensionId: data.extensionId,
                details: data
            });
        });
    }

    validateIntent(intent, context = {}) {
        const policyResult = this.policyEngine.evaluateIntent(intent, context);
        
        if (!policyResult.compliant) {
            for (const violation of policyResult.violations) {
                this.dashboard.recordSecurityEvent({
                    type: 'policy-violation',
                    severity: violation.severity,
                    extensionId: intent.extensionId,
                    policyId: violation.policyId,
                    details: violation
                });
            }
        }

        return policyResult;
    }

    recordExtensionActivity(extensionId, activity) {
        this.ids.recordEvent(extensionId, activity);
    }

    verifyExtensionSignature(extensionPath) {
        const result = this.codeSigningManager.verifyExtension(extensionPath);
        
        if (!result.valid) {
            this.dashboard.recordSecurityEvent({
                type: 'unsigned-extension',
                severity: result.requiresSigning ? 'high' : 'critical',
                extensionId: extensionPath,
                details: result
            });
        }

        return result;
    }

    async getExtensionSecret(key, extensionId) {
        return await this.secretsManager.getSecret(key, extensionId);
    }

    async setExtensionSecret(key, value, extensionId, options = {}) {
        return await this.secretsManager.setSecret(key, value, { 
            extensionId, 
            ...options 
        });
    }

    authenticateTelemetryRequest(req) {
        return this.telemetryAuth.authenticateRequest(req);
    }

    generateTelemetryToken(payload) {
        return this.telemetryAuth.generateJWT(payload);
    }

    generateAPIKey(name, permissions = []) {
        return this.telemetryAuth.generateAPIKey(name, permissions);
    }

    getDashboard() {
        return this.dashboard.getDashboardData();
    }

    getSecurityMetrics() {
        return this.dashboard.getSecurityMetrics();
    }

    getThreatProfile(extensionId) {
        return this.dashboard.getExtensionThreatProfile(extensionId);
    }

    getThreatTimeline(hours = 24) {
        return this.dashboard.getThreatTimeline(hours);
    }

    listPolicies() {
        return this.policyEngine.listPolicies();
    }

    addPolicy(policy) {
        return this.policyEngine.addPolicy(policy);
    }

    updatePolicy(policyId, updates) {
        return this.policyEngine.updatePolicy(policyId, updates);
    }

    deletePolicy(policyId) {
        return this.policyEngine.deletePolicy(policyId);
    }

    listCertificates() {
        return this.codeSigningManager.listCertificates();
    }

    generateDeveloperCertificate(developerId) {
        return this.codeSigningManager.generateKeyPair(developerId);
    }

    revokeCertificate(certId, reason) {
        return this.codeSigningManager.revokeCertificate(certId, reason);
    }

    getIDSBehavior(extensionId) {
        return this.ids.getExtensionBehavior(extensionId);
    }

    getAllIDSBehaviors() {
        return this.ids.getAllBehaviors();
    }

    getIDSAlerts(options) {
        return this.ids.getAlerts(options);
    }

    clearIDSAlerts(extensionId) {
        return this.ids.clearAlerts(extensionId);
    }

    listSecrets(extensionId) {
        return this.secretsManager.listSecrets(extensionId);
    }

    rotateSecret(key, newValue, extensionId) {
        return this.secretsManager.rotateSecret(key, newValue, extensionId);
    }

    listAPIKeys() {
        return this.telemetryAuth.listAPIKeys();
    }

    revokeAPIKey(key) {
        return this.telemetryAuth.revokeAPIKey(key);
    }
}

module.exports = {
    SecurityHardeningManager,
    TelemetryAuthManager,
    CodeSigningManager,
    SecurityPolicyEngine,
    IntrusionDetectionSystem,
    SecretsManager,
    SecurityDashboard
};
