const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { StructuredLogger, SEVERITY_LEVELS } = require('../core/telemetry');

console.log('🧪 Testing StructuredLogger enhancements...\n');

const TEST_LOG_DIR = path.join(os.tmpdir(), 'ghost-test-telemetry-' + Date.now());

function cleanup() {
    try {
        if (fs.existsSync(TEST_LOG_DIR)) {
            fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
        }
    } catch (e) {
        // Ignore cleanup errors
    }
}

async function runTests() {
    cleanup();
    fs.mkdirSync(TEST_LOG_DIR, { recursive: true });

    // Test 1: Secret sanitization
    console.log('▶ Test 1: Secret sanitization');
    const logger = new StructuredLogger(TEST_LOG_DIR);
    
    const entry = logger.info('Test message', {
        extensionId: 'test-ext',
        requestId: 'req-123',
        layer: 'Auth',
        api_key: 'secret-key-123',
        token: 'bearer-token-456',
        password: 'my-password',
        secret: 'my-secret',
        normal_field: 'visible-data',
        params: {
            api_key: 'nested-secret',
            safe_param: 'visible'
        }
    });
    
    assert.strictEqual(entry.api_key, '[REDACTED]', 'api_key should be redacted');
    assert.strictEqual(entry.token, '[REDACTED]', 'token should be redacted');
    assert.strictEqual(entry.password, '[REDACTED]', 'password should be redacted');
    assert.strictEqual(entry.secret, '[REDACTED]', 'secret should be redacted');
    assert.strictEqual(entry.normal_field, 'visible-data', 'normal field should be visible');
    assert.strictEqual(entry.params.api_key, '[REDACTED]', 'nested api_key should be redacted');
    assert.strictEqual(entry.params.safe_param, 'visible', 'nested safe param should be visible');
    console.log('✅ Secrets are properly sanitized\n');

    // Test 2: Structured fields in log entries
    console.log('▶ Test 2: Structured fields in log entries');
    const entry2 = logger.error('Error message', {
        extensionId: 'ext-456',
        requestId: 'req-789',
        layer: 'Execute',
        errorCode: 'ERR_TIMEOUT',
        error: 'Timeout occurred'
    });
    
    assert.strictEqual(entry2.extensionId, 'ext-456', 'extensionId should be set');
    assert.strictEqual(entry2.requestId, 'req-789', 'requestId should be set');
    assert.strictEqual(entry2.layer, 'Execute', 'layer should be set');
    assert.strictEqual(entry2.errorCode, 'ERR_TIMEOUT', 'errorCode should be set');
    assert.strictEqual(entry2.severity, SEVERITY_LEVELS.ERROR, 'severity should be ERROR');
    console.log('✅ Structured fields are correctly added\n');

    // Test 3: Daily log rotation
    console.log('▶ Test 3: Daily log rotation');
    const today = new Date().toISOString().split('T')[0];
    const expectedLogPath = path.join(TEST_LOG_DIR, `telemetry-${today}.log`);
    
    assert.ok(fs.existsSync(expectedLogPath), 'Daily log file should exist');
    
    const logContent = fs.readFileSync(expectedLogPath, 'utf8');
    const lines = logContent.trim().split('\n');
    assert.ok(lines.length >= 2, 'Should have at least 2 log entries');
    console.log(`✅ Daily log rotation working (${today})\n`);

    // Test 4: Severity filtering in readLogs
    console.log('▶ Test 4: Severity filtering in readLogs');
    logger.info('Info message', { extensionId: 'test-1' });
    logger.warn('Warning message', { extensionId: 'test-2' });
    logger.error('Error message', { extensionId: 'test-3' });
    logger.securityAlert('Security alert', { extensionId: 'test-4' });
    
    const allLogs = logger.readLogs();
    assert.ok(allLogs.length >= 6, 'Should have all log entries');
    
    const errorLogs = logger.readLogs({ severity: SEVERITY_LEVELS.ERROR });
    assert.ok(errorLogs.length >= 2, 'Should have error logs');
    assert.ok(errorLogs.every(log => log.severity === SEVERITY_LEVELS.ERROR), 'All logs should be ERROR severity');
    
    const securityLogs = logger.readLogs({ severity: SEVERITY_LEVELS.SECURITY_ALERT });
    assert.ok(securityLogs.length >= 1, 'Should have security alert logs');
    assert.ok(securityLogs.every(log => log.severity === SEVERITY_LEVELS.SECURITY_ALERT), 'All logs should be SECURITY_ALERT severity');
    console.log('✅ Severity filtering works correctly\n');

    // Test 5: Filtering by extensionId
    console.log('▶ Test 5: Filtering by extensionId');
    const ext1Logs = logger.readLogs({ extensionId: 'test-1' });
    assert.ok(ext1Logs.length >= 1, 'Should have logs for test-1');
    assert.ok(ext1Logs.every(log => log.extensionId === 'test-1'), 'All logs should be for test-1');
    console.log('✅ extensionId filtering works correctly\n');

    // Test 6: Filtering by requestId
    console.log('▶ Test 6: Filtering by requestId');
    logger.info('Request message', { requestId: 'req-unique-123' });
    const reqLogs = logger.readLogs({ requestId: 'req-unique-123' });
    assert.ok(reqLogs.length >= 1, 'Should have logs for req-unique-123');
    assert.ok(reqLogs.every(log => log.requestId === 'req-unique-123'), 'All logs should be for req-unique-123');
    console.log('✅ requestId filtering works correctly\n');

    // Test 7: Filtering by layer
    console.log('▶ Test 7: Filtering by layer');
    logger.info('Intercept message', { layer: 'Intercept' });
    logger.info('Auth message', { layer: 'Auth' });
    const authLogs = logger.readLogs({ layer: 'Auth' });
    assert.ok(authLogs.length >= 1, 'Should have logs for Auth layer');
    assert.ok(authLogs.every(log => log.layer === 'Auth'), 'All logs should be for Auth layer');
    console.log('✅ layer filtering works correctly\n');

    // Test 8: Filtering by errorCode
    console.log('▶ Test 8: Filtering by errorCode');
    logger.error('Specific error', { errorCode: 'ERR_SPECIFIC_123' });
    const errorCodeLogs = logger.readLogs({ errorCode: 'ERR_SPECIFIC_123' });
    assert.ok(errorCodeLogs.length >= 1, 'Should have logs for ERR_SPECIFIC_123');
    assert.ok(errorCodeLogs.every(log => log.errorCode === 'ERR_SPECIFIC_123'), 'All logs should have errorCode ERR_SPECIFIC_123');
    console.log('✅ errorCode filtering works correctly\n');

    // Test 9: Multiple filters combined
    console.log('▶ Test 9: Multiple filters combined');
    logger.error('Combined test', {
        extensionId: 'combo-ext',
        requestId: 'combo-req',
        layer: 'Audit',
        errorCode: 'ERR_COMBO'
    });
    
    const comboLogs = logger.readLogs({
        severity: SEVERITY_LEVELS.ERROR,
        extensionId: 'combo-ext',
        layer: 'Audit'
    });
    
    assert.ok(comboLogs.length >= 1, 'Should have logs matching combined filters');
    assert.ok(comboLogs.every(log => 
        log.severity === SEVERITY_LEVELS.ERROR &&
        log.extensionId === 'combo-ext' &&
        log.layer === 'Audit'
    ), 'All logs should match all filters');
    console.log('✅ Combined filtering works correctly\n');

    // Test 10: Reading logs from specific date
    console.log('▶ Test 10: Reading logs from specific date');
    const todayLogs = logger.readLogs({ date: today });
    assert.ok(todayLogs.length > 0, 'Should have logs for today');
    
    const invalidDateLogs = logger.readLogs({ date: '2020-01-01' });
    assert.strictEqual(invalidDateLogs.length, 0, 'Should have no logs for non-existent date');
    console.log('✅ Date-specific log reading works correctly\n');

    // Test 11: Secret sanitization with various casing
    console.log('▶ Test 11: Secret sanitization with various casing');
    const entry3 = logger.info('Case test', {
        API_KEY: 'secret1',
        Token: 'secret2',
        PASSWORD: 'secret3',
        ApiKey: 'secret4',
        Authorization: 'secret5',
        credentials: 'secret6'
    });
    
    assert.strictEqual(entry3.API_KEY, '[REDACTED]', 'API_KEY should be redacted');
    assert.strictEqual(entry3.Token, '[REDACTED]', 'Token should be redacted');
    assert.strictEqual(entry3.PASSWORD, '[REDACTED]', 'PASSWORD should be redacted');
    assert.strictEqual(entry3.ApiKey, '[REDACTED]', 'ApiKey should be redacted');
    assert.strictEqual(entry3.Authorization, '[REDACTED]', 'Authorization should be redacted');
    assert.strictEqual(entry3.credentials, '[REDACTED]', 'credentials should be redacted');
    console.log('✅ Secret sanitization works with various casing\n');

    cleanup();
    console.log('🎉 All StructuredLogger tests passed!');
}

runTests().then(() => {
    process.exit(0);
}).catch((error) => {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    cleanup();
    process.exit(1);
});
