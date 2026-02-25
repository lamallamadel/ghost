const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
    ExecutionLayer,
    CircuitBreaker,
    FilesystemExecutor,
    NetworkExecutor,
    GitExecutor,
    ProcessExecutor
} = require('../../core/pipeline/execute');

console.log('🧪 Testing Circuit Breaker in Execute Layer...\n');

const testDir = path.join(os.tmpdir(), 'ghost-circuit-breaker-test');
if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
    try {
        console.log('▶ Test 1: Circuit breaker initial state (CLOSED)');
        const cb = new CircuitBreaker();
        const state = cb.getState();
        assert.strictEqual(state.state, 'CLOSED', 'Initial state should be CLOSED');
        assert.strictEqual(state.failures, 0, 'Initial failures should be 0');
        console.log('✅ Circuit breaker starts in CLOSED state\n');

        console.log('▶ Test 2: Circuit breaker CLOSED→OPEN after 5 consecutive failures (filesystem)');
        const executionLayer = new ExecutionLayer();
        const nonExistentFile = path.join(testDir, 'non-existent-file-12345.txt');
        
        for (let i = 0; i < 5; i++) {
            try {
                await executionLayer.execute({
                    type: 'filesystem',
                    operation: 'read',
                    params: { path: nonExistentFile }
                });
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error, `Failure ${i + 1} should throw error`);
            }
        }

        const fsCircuitState = executionLayer.getCircuitBreakerState('filesystem');
        assert.strictEqual(fsCircuitState.state, 'OPEN', 'Circuit should be OPEN after 5 failures');
        assert.strictEqual(fsCircuitState.failures, 5, 'Should have 5 failures recorded');
        console.log('✅ Filesystem circuit breaker opens after 5 consecutive failures\n');

        console.log('▶ Test 3: Requests immediately rejected with CIRCUIT_OPEN when state is OPEN');
        try {
            await executionLayer.execute({
                type: 'filesystem',
                operation: 'read',
                params: { path: nonExistentFile }
            });
            assert.fail('Should have rejected with CIRCUIT_OPEN');
        } catch (error) {
            assert.strictEqual(error.code, 'CIRCUIT_OPEN', 'Should have CIRCUIT_OPEN code');
            assert.ok(error.message.includes('Circuit breaker is OPEN'), 'Error message should mention circuit breaker');
        }
        console.log('✅ Requests rejected with CIRCUIT_OPEN when circuit is OPEN\n');

        console.log('▶ Test 4: OPEN→HALF_OPEN transition after 60s cooldown period');
        const cb2 = new CircuitBreaker({ failureThreshold: 5, resetTimeout: 100 });
        
        for (let i = 0; i < 5; i++) {
            try {
                await cb2.execute(async () => {
                    throw new Error('Simulated failure');
                });
            } catch (error) {
                // Expected
            }
        }
        
        assert.strictEqual(cb2.getState().state, 'OPEN', 'Should be OPEN after failures');
        
        await sleep(150);
        
        let halfOpenCaught = false;
        try {
            await cb2.execute(async () => {
                halfOpenCaught = cb2.getState().state === 'HALF_OPEN';
                throw new Error('Fail in HALF_OPEN');
            });
        } catch (error) {
            // Expected
        }
        
        assert.strictEqual(halfOpenCaught, true, 'Should transition to HALF_OPEN after timeout');
        assert.strictEqual(cb2.getState().state, 'OPEN', 'Should return to OPEN after failure in HALF_OPEN');
        console.log('✅ Circuit transitions OPEN→HALF_OPEN after cooldown, back to OPEN on failure\n');

        console.log('▶ Test 5: HALF_OPEN→CLOSED transition on success');
        const cb3 = new CircuitBreaker({ failureThreshold: 5, resetTimeout: 100 });
        
        for (let i = 0; i < 5; i++) {
            try {
                await cb3.execute(async () => {
                    throw new Error('Simulated failure');
                });
            } catch (error) {
                // Expected
            }
        }
        
        assert.strictEqual(cb3.getState().state, 'OPEN', 'Should be OPEN');
        
        await sleep(150);
        
        let successInHalfOpen = false;
        await cb3.execute(async () => {
            successInHalfOpen = cb3.getState().state === 'HALF_OPEN';
            return 'success';
        });
        
        assert.strictEqual(successInHalfOpen, true, 'Should be HALF_OPEN during first request after cooldown');
        assert.strictEqual(cb3.getState().state, 'CLOSED', 'Should transition to CLOSED after success');
        assert.strictEqual(cb3.getState().failures, 0, 'Failures should reset to 0');
        console.log('✅ Circuit transitions HALF_OPEN→CLOSED on success\n');

        console.log('▶ Test 6: HALF_OPEN→OPEN transition on failure');
        const cb4 = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 100 });
        
        for (let i = 0; i < 3; i++) {
            try {
                await cb4.execute(async () => {
                    throw new Error('Failure');
                });
            } catch (error) {
                // Expected
            }
        }
        
        await sleep(150);
        
        try {
            await cb4.execute(async () => {
                throw new Error('Failure in HALF_OPEN');
            });
        } catch (error) {
            // Expected
        }
        
        assert.strictEqual(cb4.getState().state, 'OPEN', 'Should return to OPEN after failure in HALF_OPEN');
        console.log('✅ Circuit transitions HALF_OPEN→OPEN on failure\n');

        console.log('▶ Test 7: Independent circuit breakers per executor type - filesystem failures');
        const layer1 = new ExecutionLayer();
        
        for (let i = 0; i < 5; i++) {
            try {
                await layer1.execute({
                    type: 'filesystem',
                    operation: 'read',
                    params: { path: path.join(testDir, 'nonexistent.txt') }
                });
            } catch (error) {
                // Expected
            }
        }
        
        const fsState = layer1.getCircuitBreakerState('filesystem');
        const networkState = layer1.getCircuitBreakerState('network');
        const gitState = layer1.getCircuitBreakerState('git');
        const processState = layer1.getCircuitBreakerState('process');
        
        assert.strictEqual(fsState.state, 'OPEN', 'Filesystem circuit should be OPEN');
        assert.strictEqual(networkState.state, 'CLOSED', 'Network circuit should remain CLOSED');
        assert.strictEqual(gitState.state, 'CLOSED', 'Git circuit should remain CLOSED');
        assert.strictEqual(processState.state, 'CLOSED', 'Process circuit should remain CLOSED');
        console.log('✅ Filesystem failures do not affect other circuit breakers\n');

        console.log('▶ Test 8: Independent circuit breakers - network failures do not affect filesystem');
        const layer2 = new ExecutionLayer();
        
        for (let i = 0; i < 5; i++) {
            try {
                await layer2.execute({
                    type: 'network',
                    operation: 'http',
                    params: { url: 'http://nonexistent-host-12345.invalid', method: 'GET', timeout: 1000 }
                });
            } catch (error) {
                // Expected
            }
        }
        
        const netState2 = layer2.getCircuitBreakerState('network');
        const fsState2 = layer2.getCircuitBreakerState('filesystem');
        
        assert.strictEqual(netState2.state, 'OPEN', 'Network circuit should be OPEN');
        assert.strictEqual(fsState2.state, 'CLOSED', 'Filesystem circuit should remain CLOSED');
        
        const testFile = path.join(testDir, 'test-file.txt');
        fs.writeFileSync(testFile, 'test content', 'utf8');
        
        const fsResult = await layer2.execute({
            type: 'filesystem',
            operation: 'read',
            params: { path: testFile }
        });
        
        assert.strictEqual(fsResult.success, true, 'Filesystem operations should still work');
        console.log('✅ Network failures do not affect filesystem circuit breaker\n');

        console.log('▶ Test 9: Independent circuit breakers - git failures');
        const layer3 = new ExecutionLayer();
        
        for (let i = 0; i < 5; i++) {
            try {
                await layer3.execute({
                    type: 'git',
                    operation: 'invalid-command',
                    params: { args: ['--nonexistent-flag'] }
                });
            } catch (error) {
                // Expected
            }
        }
        
        const gitState3 = layer3.getCircuitBreakerState('git');
        const fsState3 = layer3.getCircuitBreakerState('filesystem');
        const netState3 = layer3.getCircuitBreakerState('network');
        const procState3 = layer3.getCircuitBreakerState('process');
        
        assert.strictEqual(gitState3.state, 'OPEN', 'Git circuit should be OPEN');
        assert.strictEqual(fsState3.state, 'CLOSED', 'Filesystem circuit should remain CLOSED');
        assert.strictEqual(netState3.state, 'CLOSED', 'Network circuit should remain CLOSED');
        assert.strictEqual(procState3.state, 'CLOSED', 'Process circuit should remain CLOSED');
        console.log('✅ Git failures do not affect other circuit breakers\n');

        console.log('▶ Test 10: Independent circuit breakers - process failures');
        const layer4 = new ExecutionLayer();
        
        for (let i = 0; i < 5; i++) {
            try {
                await layer4.execute({
                    type: 'process',
                    operation: 'spawn',
                    params: { command: 'nonexistent-command-xyz123', args: [] }
                });
            } catch (error) {
                // Expected
            }
        }
        
        const procState4 = layer4.getCircuitBreakerState('process');
        const fsState4 = layer4.getCircuitBreakerState('filesystem');
        
        assert.strictEqual(procState4.state, 'OPEN', 'Process circuit should be OPEN');
        assert.strictEqual(fsState4.state, 'CLOSED', 'Filesystem circuit should remain CLOSED');
        console.log('✅ Process failures do not affect other circuit breakers\n');

        console.log('▶ Test 11: Manual reset via ExecutionLayer.resetCircuitBreaker()');
        const layer5 = new ExecutionLayer();
        
        for (let i = 0; i < 5; i++) {
            try {
                await layer5.execute({
                    type: 'filesystem',
                    operation: 'read',
                    params: { path: path.join(testDir, 'missing.txt') }
                });
            } catch (error) {
                // Expected
            }
        }
        
        const stateBeforeReset = layer5.getCircuitBreakerState('filesystem');
        assert.strictEqual(stateBeforeReset.state, 'OPEN', 'Should be OPEN before reset');
        
        layer5.resetCircuitBreaker('filesystem');
        
        const stateAfterReset = layer5.getCircuitBreakerState('filesystem');
        assert.strictEqual(stateAfterReset.state, 'CLOSED', 'Should be CLOSED after reset');
        assert.strictEqual(stateAfterReset.failures, 0, 'Failures should be reset to 0');
        
        const testFile2 = path.join(testDir, 'test-after-reset.txt');
        fs.writeFileSync(testFile2, 'content', 'utf8');
        
        const resultAfterReset = await layer5.execute({
            type: 'filesystem',
            operation: 'read',
            params: { path: testFile2 }
        });
        
        assert.strictEqual(resultAfterReset.success, true, 'Operations should work after manual reset');
        console.log('✅ Manual circuit breaker reset works correctly\n');

        console.log('▶ Test 12: Circuit breaker failure count increments correctly');
        const cb5 = new CircuitBreaker({ failureThreshold: 5 });
        
        for (let i = 1; i <= 3; i++) {
            try {
                await cb5.execute(async () => {
                    throw new Error('Failure');
                });
            } catch (error) {
                // Expected
            }
            assert.strictEqual(cb5.getState().failures, i, `Should have ${i} failures`);
        }
        
        assert.strictEqual(cb5.getState().state, 'CLOSED', 'Should still be CLOSED with 3 failures');
        
        for (let i = 4; i <= 5; i++) {
            try {
                await cb5.execute(async () => {
                    throw new Error('Failure');
                });
            } catch (error) {
                // Expected
            }
        }
        
        assert.strictEqual(cb5.getState().failures, 5, 'Should have 5 failures');
        assert.strictEqual(cb5.getState().state, 'OPEN', 'Should be OPEN at threshold');
        console.log('✅ Failure count increments correctly\n');

        console.log('▶ Test 13: Success resets failure count in CLOSED state');
        const cb6 = new CircuitBreaker({ failureThreshold: 5 });
        
        for (let i = 0; i < 3; i++) {
            try {
                await cb6.execute(async () => {
                    throw new Error('Failure');
                });
            } catch (error) {
                // Expected
            }
        }
        
        assert.strictEqual(cb6.getState().failures, 3, 'Should have 3 failures');
        
        await cb6.execute(async () => 'success');
        
        assert.strictEqual(cb6.getState().failures, 0, 'Success should reset failure count');
        assert.strictEqual(cb6.getState().state, 'CLOSED', 'Should remain CLOSED');
        console.log('✅ Success resets failure count in CLOSED state\n');

        console.log('▶ Test 14: Multiple filesystem executor failures with different error types');
        const fsExecutor = new FilesystemExecutor();
        
        const errorTypes = [
            { path: path.join(testDir, 'noent.txt'), expectedCode: 'EXEC_NOT_FOUND' },
            { path: path.join(testDir, 'noent2.txt'), expectedCode: 'EXEC_NOT_FOUND' },
            { path: path.join(testDir, 'noent3.txt'), expectedCode: 'EXEC_NOT_FOUND' },
            { path: path.join(testDir, 'noent4.txt'), expectedCode: 'EXEC_NOT_FOUND' },
            { path: path.join(testDir, 'noent5.txt'), expectedCode: 'EXEC_NOT_FOUND' }
        ];
        
        for (const errorTest of errorTypes) {
            try {
                await fsExecutor.execute('read', { path: errorTest.path });
            } catch (error) {
                assert.strictEqual(error.code, errorTest.expectedCode, `Should have ${errorTest.expectedCode}`);
            }
        }
        
        const fsExecState = fsExecutor.circuitBreaker.getState();
        assert.strictEqual(fsExecState.state, 'OPEN', 'Circuit should open after 5 filesystem errors');
        console.log('✅ Multiple filesystem error types trigger circuit breaker\n');

        console.log('▶ Test 15: Network executor failures with connection errors');
        const netExecutor = new NetworkExecutor();
        
        for (let i = 0; i < 5; i++) {
            try {
                await netExecutor.execute('http', {
                    url: `http://nonexistent-domain-${i}.invalid`,
                    method: 'GET',
                    timeout: 1000
                });
            } catch (error) {
                assert.ok(error.code, 'Should have error code');
            }
        }
        
        const netExecState = netExecutor.circuitBreaker.getState();
        assert.strictEqual(netExecState.state, 'OPEN', 'Network circuit should open after 5 failures');
        console.log('✅ Network executor circuit breaker opens on connection errors\n');

        console.log('▶ Test 16: Git executor failures with invalid commands');
        const gitExecutor = new GitExecutor();
        
        for (let i = 0; i < 5; i++) {
            try {
                await gitExecutor.execute('invalid-git-command', { args: [] });
            } catch (error) {
                assert.strictEqual(error.code, 'EXEC_GIT_ERROR', 'Should have EXEC_GIT_ERROR code');
            }
        }
        
        const gitExecState = gitExecutor.circuitBreaker.getState();
        assert.strictEqual(gitExecState.state, 'OPEN', 'Git circuit should open after 5 failures');
        console.log('✅ Git executor circuit breaker opens on command errors\n');

        console.log('▶ Test 17: Process executor failures with spawn errors');
        const procExecutor = new ProcessExecutor();
        
        for (let i = 0; i < 5; i++) {
            try {
                await procExecutor.execute('spawn', {
                    command: 'nonexistent-cmd-xyz',
                    args: []
                });
            } catch (error) {
                assert.ok(error.code === 'EXEC_SPAWN_ERROR' || error.code === 'EXEC_PROCESS_ERROR', 
                    'Should have spawn or process error code');
            }
        }
        
        const procExecState = procExecutor.circuitBreaker.getState();
        assert.strictEqual(procExecState.state, 'OPEN', 'Process circuit should open after 5 failures');
        console.log('✅ Process executor circuit breaker opens on spawn errors\n');

        console.log('▶ Test 18: Circuit breaker with custom failure threshold');
        const cb7 = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 60000 });
        
        for (let i = 0; i < 3; i++) {
            try {
                await cb7.execute(async () => {
                    throw new Error('Failure');
                });
            } catch (error) {
                // Expected
            }
        }
        
        assert.strictEqual(cb7.getState().state, 'OPEN', 'Should open at custom threshold of 3');
        assert.strictEqual(cb7.getState().failures, 3, 'Should have 3 failures');
        console.log('✅ Custom failure threshold works correctly\n');

        console.log('▶ Test 19: Circuit breaker with custom reset timeout');
        const cb8 = new CircuitBreaker({ failureThreshold: 2, resetTimeout: 200 });
        
        for (let i = 0; i < 2; i++) {
            try {
                await cb8.execute(async () => {
                    throw new Error('Failure');
                });
            } catch (error) {
                // Expected
            }
        }
        
        assert.strictEqual(cb8.getState().state, 'OPEN', 'Should be OPEN');
        
        await sleep(250);
        
        await cb8.execute(async () => 'success');
        
        assert.strictEqual(cb8.getState().state, 'CLOSED', 'Should close after custom timeout');
        console.log('✅ Custom reset timeout works correctly\n');

        console.log('▶ Test 20: Circuit breaker nextAttempt timestamp tracking');
        const cb9 = new CircuitBreaker({ failureThreshold: 2, resetTimeout: 5000 });
        
        for (let i = 0; i < 2; i++) {
            try {
                await cb9.execute(async () => {
                    throw new Error('Failure');
                });
            } catch (error) {
                // Expected
            }
        }
        
        const stateWithNextAttempt = cb9.getState();
        assert.strictEqual(stateWithNextAttempt.state, 'OPEN', 'Should be OPEN');
        assert.ok(stateWithNextAttempt.nextAttempt > Date.now(), 'nextAttempt should be in the future');
        assert.ok(stateWithNextAttempt.nextAttempt <= Date.now() + 5000, 'nextAttempt should be within timeout period');
        console.log('✅ nextAttempt timestamp tracked correctly\n');

        console.log('▶ Test 21: Multiple executors can fail and recover independently');
        const layer6 = new ExecutionLayer();
        
        const testFile3 = path.join(testDir, 'independent-test.txt');
        fs.writeFileSync(testFile3, 'data', 'utf8');
        
        for (let i = 0; i < 5; i++) {
            try {
                await layer6.execute({
                    type: 'network',
                    operation: 'http',
                    params: { url: 'http://invalid-host.test', method: 'GET', timeout: 1000 }
                });
            } catch (error) {
                // Expected
            }
        }
        
        const netState6 = layer6.getCircuitBreakerState('network');
        assert.strictEqual(netState6.state, 'OPEN', 'Network circuit should be OPEN');
        
        const fsResult6 = await layer6.execute({
            type: 'filesystem',
            operation: 'read',
            params: { path: testFile3 }
        });
        assert.strictEqual(fsResult6.success, true, 'Filesystem should still work');
        
        layer6.resetCircuitBreaker('network');
        
        const netStateAfterReset = layer6.getCircuitBreakerState('network');
        assert.strictEqual(netStateAfterReset.state, 'CLOSED', 'Network circuit should be CLOSED after reset');
        
        const fsState6 = layer6.getCircuitBreakerState('filesystem');
        assert.strictEqual(fsState6.state, 'CLOSED', 'Filesystem circuit should remain CLOSED');
        console.log('✅ Multiple executors fail and recover independently\n');

        console.log('▶ Test 22: Circuit breaker state transitions with exact 5 failures');
        const cb10 = new CircuitBreaker({ failureThreshold: 5, resetTimeout: 100 });
        
        for (let i = 1; i <= 4; i++) {
            try {
                await cb10.execute(async () => {
                    throw new Error('Failure');
                });
            } catch (error) {
                // Expected
            }
            assert.strictEqual(cb10.getState().state, 'CLOSED', `Should be CLOSED at ${i} failures`);
        }
        
        try {
            await cb10.execute(async () => {
                throw new Error('5th failure');
            });
        } catch (error) {
            // Expected
        }
        
        assert.strictEqual(cb10.getState().state, 'OPEN', 'Should be OPEN at exactly 5 failures');
        assert.strictEqual(cb10.getState().failures, 5, 'Should have exactly 5 failures');
        console.log('✅ Circuit opens at exactly 5 failures\n');

        console.log('▶ Test 23: Verify CIRCUIT_OPEN prevents execution attempt');
        const layer7 = new ExecutionLayer();
        const testFile4 = path.join(testDir, 'will-not-be-read.txt');
        fs.writeFileSync(testFile4, 'should not read', 'utf8');
        
        for (let i = 0; i < 5; i++) {
            try {
                await layer7.execute({
                    type: 'filesystem',
                    operation: 'read',
                    params: { path: path.join(testDir, `fail-${i}.txt`) }
                });
            } catch (error) {
                // Expected
            }
        }
        
        let circuitOpenError = null;
        try {
            await layer7.execute({
                type: 'filesystem',
                operation: 'read',
                params: { path: testFile4 }
            });
        } catch (error) {
            circuitOpenError = error;
        }
        
        assert.ok(circuitOpenError, 'Should throw error');
        assert.strictEqual(circuitOpenError.code, 'CIRCUIT_OPEN', 'Should be CIRCUIT_OPEN error');
        assert.ok(circuitOpenError.message.includes('Circuit breaker is OPEN'), 
            'Error message should mention circuit breaker');
        console.log('✅ CIRCUIT_OPEN prevents execution attempt\n');

        console.log('▶ Test 24: All executor types have independent circuit breakers');
        const layer8 = new ExecutionLayer();
        
        assert.ok(layer8.executors.filesystem.circuitBreaker, 'Filesystem has circuit breaker');
        assert.ok(layer8.executors.network.circuitBreaker, 'Network has circuit breaker');
        assert.ok(layer8.executors.git.circuitBreaker, 'Git has circuit breaker');
        assert.ok(layer8.executors.process.circuitBreaker, 'Process has circuit breaker');
        
        assert.notStrictEqual(
            layer8.executors.filesystem.circuitBreaker,
            layer8.executors.network.circuitBreaker,
            'Filesystem and network should have different circuit breakers'
        );
        
        assert.notStrictEqual(
            layer8.executors.git.circuitBreaker,
            layer8.executors.process.circuitBreaker,
            'Git and process should have different circuit breakers'
        );
        console.log('✅ All executor types have independent circuit breakers\n');

        console.log('▶ Test 25: Reset circuit breaker for specific executor type only');
        const layer9 = new ExecutionLayer();
        
        for (let i = 0; i < 5; i++) {
            try {
                await layer9.execute({
                    type: 'filesystem',
                    operation: 'read',
                    params: { path: path.join(testDir, `fs-fail-${i}.txt`) }
                });
            } catch (error) {
                // Expected
            }
        }
        
        for (let i = 0; i < 5; i++) {
            try {
                await layer9.execute({
                    type: 'network',
                    operation: 'http',
                    params: { url: `http://fail-${i}.invalid`, method: 'GET', timeout: 1000 }
                });
            } catch (error) {
                // Expected
            }
        }
        
        const fsStateBeforeReset9 = layer9.getCircuitBreakerState('filesystem');
        const netStateBeforeReset9 = layer9.getCircuitBreakerState('network');
        assert.strictEqual(fsStateBeforeReset9.state, 'OPEN', 'Filesystem should be OPEN');
        assert.strictEqual(netStateBeforeReset9.state, 'OPEN', 'Network should be OPEN');
        
        layer9.resetCircuitBreaker('filesystem');
        
        const fsStateAfterReset9 = layer9.getCircuitBreakerState('filesystem');
        const netStateAfterReset9 = layer9.getCircuitBreakerState('network');
        assert.strictEqual(fsStateAfterReset9.state, 'CLOSED', 'Filesystem should be CLOSED after reset');
        assert.strictEqual(netStateAfterReset9.state, 'OPEN', 'Network should still be OPEN');
        console.log('✅ Reset affects only specified executor type\n');

        console.log('▶ Test 26: Circuit breaker behavior with mixed success and failure');
        const cb11 = new CircuitBreaker({ failureThreshold: 5 });
        
        for (let i = 0; i < 3; i++) {
            try {
                await cb11.execute(async () => {
                    throw new Error('Failure');
                });
            } catch (error) {
                // Expected
            }
        }
        
        await cb11.execute(async () => 'success');
        assert.strictEqual(cb11.getState().failures, 0, 'Success should reset failures');
        
        for (let i = 0; i < 5; i++) {
            try {
                await cb11.execute(async () => {
                    throw new Error('Failure');
                });
            } catch (error) {
                // Expected
            }
        }
        
        assert.strictEqual(cb11.getState().state, 'OPEN', 'Should open after 5 new failures');
        console.log('✅ Success resets failure count, circuit opens on subsequent failures\n');

        console.log('▶ Test 27: Verify default circuit breaker configuration');
        const defaultCB = new CircuitBreaker();
        assert.strictEqual(defaultCB.failureThreshold, 5, 'Default failure threshold should be 5');
        assert.strictEqual(defaultCB.resetTimeout, 60000, 'Default reset timeout should be 60000ms (60s)');
        console.log('✅ Default circuit breaker configuration verified\n');

        console.log('▶ Test 28: Circuit breaker state after HALF_OPEN success includes correct values');
        const cb12 = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 100 });
        
        for (let i = 0; i < 3; i++) {
            try {
                await cb12.execute(async () => {
                    throw new Error('Failure');
                });
            } catch (error) {
                // Expected
            }
        }
        
        await sleep(150);
        
        await cb12.execute(async () => 'success');
        
        const finalState = cb12.getState();
        assert.strictEqual(finalState.state, 'CLOSED', 'Should be CLOSED');
        assert.strictEqual(finalState.failures, 0, 'Failures should be 0');
        assert.ok(finalState.nextAttempt <= Date.now(), 'nextAttempt should not be in future for CLOSED state');
        console.log('✅ State after HALF_OPEN success has correct values\n');

        console.log('▶ Test 29: Concurrent failures trigger circuit breaker correctly');
        const layer10 = new ExecutionLayer();
        
        const concurrentFailures = [];
        for (let i = 0; i < 5; i++) {
            concurrentFailures.push(
                layer10.execute({
                    type: 'filesystem',
                    operation: 'read',
                    params: { path: path.join(testDir, `concurrent-fail-${i}.txt`) }
                }).catch(err => err)
            );
        }
        
        await Promise.all(concurrentFailures);
        
        const stateAfterConcurrent = layer10.getCircuitBreakerState('filesystem');
        assert.strictEqual(stateAfterConcurrent.state, 'OPEN', 'Circuit should open after concurrent failures');
        console.log('✅ Concurrent failures trigger circuit breaker\n');

        console.log('▶ Test 30: Circuit breaker reset on null/undefined executor type returns silently');
        const layer11 = new ExecutionLayer();
        
        layer11.resetCircuitBreaker('nonexistent-type');
        layer11.resetCircuitBreaker(null);
        layer11.resetCircuitBreaker(undefined);
        
        console.log('✅ Reset on invalid executor type handles gracefully\n');

        // Cleanup
        try {
            if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
            if (fs.existsSync(testFile2)) fs.unlinkSync(testFile2);
            if (fs.existsSync(testFile3)) fs.unlinkSync(testFile3);
            if (fs.existsSync(testFile4)) fs.unlinkSync(testFile4);
            fs.rmdirSync(testDir, { recursive: true });
        } catch (e) {
            // Cleanup errors are not critical
        }

        console.log('═══════════════════════════════════════');
        console.log('🎉 All circuit breaker tests passed!');
        console.log('   - State transitions: CLOSED→OPEN, OPEN→HALF_OPEN, HALF_OPEN→CLOSED/OPEN');
        console.log('   - Failure threshold: 5 consecutive failures');
        console.log('   - Cooldown period: 60s (configurable)');
        console.log('   - CIRCUIT_OPEN rejection when circuit is OPEN');
        console.log('   - Independent circuit breakers per executor type');
        console.log('   - Manual reset functionality');
        console.log('   - Total tests: 30 test suites');
        console.log('═══════════════════════════════════════');
        process.exit(0);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
})();
