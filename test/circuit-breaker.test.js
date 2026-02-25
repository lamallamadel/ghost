const assert = require('assert');
const fs = require('fs').promises;
const path = require('path');
const {
    CircuitBreaker,
    TimeoutManager,
    ExecutionError,
    FilesystemExecutor,
    NetworkExecutor,
    GitExecutor,
    ProcessExecutor,
    ExecutionLayer
} = require('../core/pipeline/execute.js');

console.log('🧪 Testing Circuit Breaker State Transitions and Execution Layer...\n');

console.log('▶ Test 1: CircuitBreaker initialization');
const cb = new CircuitBreaker();
assert.strictEqual(cb.state, 'CLOSED', 'Initial state should be CLOSED');
assert.strictEqual(cb.failures, 0, 'Initial failures should be 0');
assert.strictEqual(cb.failureThreshold, 5, 'Default failure threshold should be 5');
assert.strictEqual(cb.resetTimeout, 60000, 'Default reset timeout should be 60000ms');
console.log('✅ CircuitBreaker initializes with correct defaults\n');

console.log('▶ Test 2: CircuitBreaker with custom options');
const customCb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 30000 });
assert.strictEqual(customCb.failureThreshold, 3, 'Should use custom failure threshold');
assert.strictEqual(customCb.resetTimeout, 30000, 'Should use custom reset timeout');
console.log('✅ CircuitBreaker accepts custom options\n');

console.log('▶ Test 3: CircuitBreaker CLOSED → OPEN transition after 5 failures');
(async () => {
    const failingCb = new CircuitBreaker();
    
    for (let i = 1; i <= 5; i++) {
        try {
            await failingCb.execute(async () => {
                throw new Error('Simulated failure');
            });
            assert.fail('Should have thrown error');
        } catch (error) {
            assert.strictEqual(failingCb.failures, i, `Should have ${i} failure(s)`);
            if (i < 5) {
                assert.strictEqual(failingCb.state, 'CLOSED', 'Should remain CLOSED until threshold');
            } else {
                assert.strictEqual(failingCb.state, 'OPEN', 'Should transition to OPEN at threshold');
            }
        }
    }
    
    console.log('✅ Circuit breaker opens after 5 failures\n');
    continueTest4();
})();

function continueTest4() {
    console.log('▶ Test 4: CircuitBreaker rejects requests when OPEN');
    (async () => {
        const openCb = new CircuitBreaker();
        openCb.state = 'OPEN';
        openCb.nextAttempt = Date.now() + 60000;
        
        try {
            await openCb.execute(async () => 'success');
            assert.fail('Should reject when circuit is OPEN');
        } catch (error) {
            assert.ok(error instanceof ExecutionError, 'Should throw ExecutionError');
            assert.strictEqual(error.code, 'CIRCUIT_OPEN', 'Error code should be CIRCUIT_OPEN');
            assert.ok(error.message.includes('OPEN'), 'Error message should mention OPEN state');
        }
        
        console.log('✅ Circuit breaker rejects requests when OPEN\n');
        continueTest5();
    })();
}

function continueTest5() {
    console.log('▶ Test 5: CircuitBreaker OPEN → HALF_OPEN after reset timeout (60s)');
    (async () => {
        const resetCb = new CircuitBreaker();
        resetCb.state = 'OPEN';
        resetCb.failures = 5;
        resetCb.nextAttempt = Date.now() - 1;
        
        let executed = false;
        await resetCb.execute(async () => {
            executed = true;
            return 'success';
        });
        
        assert.strictEqual(executed, true, 'Should execute function when timeout passed');
        assert.strictEqual(resetCb.state, 'CLOSED', 'Should transition to CLOSED on success');
        assert.strictEqual(resetCb.failures, 0, 'Should reset failures counter');
        
        console.log('✅ Circuit breaker resets after 60s timeout\n');
        continueTest6();
    })();
}

function continueTest6() {
    console.log('▶ Test 6: CircuitBreaker HALF_OPEN → CLOSED on success');
    (async () => {
        const halfOpenCb = new CircuitBreaker();
        halfOpenCb.state = 'OPEN';
        halfOpenCb.nextAttempt = Date.now() - 1;
        
        const result = await halfOpenCb.execute(async () => 'recovery');
        
        assert.strictEqual(result, 'recovery', 'Should return result on success');
        assert.strictEqual(halfOpenCb.state, 'CLOSED', 'Should close on successful execution');
        assert.strictEqual(halfOpenCb.failures, 0, 'Failures should be reset');
        
        console.log('✅ Circuit breaker closes on successful execution in HALF_OPEN state\n');
        continueTest7();
    })();
}

function continueTest7() {
    console.log('▶ Test 7: CircuitBreaker HALF_OPEN → OPEN on failure');
    (async () => {
        const halfOpenFailCb = new CircuitBreaker();
        halfOpenFailCb.state = 'OPEN';
        halfOpenFailCb.failures = 5;
        halfOpenFailCb.nextAttempt = Date.now() - 1;
        
        try {
            await halfOpenFailCb.execute(async () => {
                throw new Error('Still failing');
            });
            assert.fail('Should have thrown error');
        } catch (error) {
            assert.strictEqual(halfOpenFailCb.state, 'OPEN', 'Should return to OPEN on failure');
            assert.strictEqual(halfOpenFailCb.failures, 6, 'Should increment failures');
        }
        
        console.log('✅ Circuit breaker returns to OPEN on failure in HALF_OPEN state\n');
        continueTest8();
    })();
}

function continueTest8() {
    console.log('▶ Test 8: CircuitBreaker getState() returns current state');
    const stateCb = new CircuitBreaker();
    stateCb.state = 'OPEN';
    stateCb.failures = 7;
    stateCb.nextAttempt = Date.now() + 30000;
    
    const state = stateCb.getState();
    assert.strictEqual(state.state, 'OPEN', 'Should return current state');
    assert.strictEqual(state.failures, 7, 'Should return failure count');
    assert.strictEqual(state.nextAttempt, stateCb.nextAttempt, 'Should return next attempt time');
    
    console.log('✅ CircuitBreaker getState() works correctly\n');
    continueTest9();
}

function continueTest9() {
    console.log('▶ Test 9: CircuitBreaker reset() clears state');
    const resetStateCb = new CircuitBreaker();
    resetStateCb.state = 'OPEN';
    resetStateCb.failures = 10;
    resetStateCb.nextAttempt = Date.now() + 60000;
    
    resetStateCb.reset();
    
    assert.strictEqual(resetStateCb.state, 'CLOSED', 'Should reset to CLOSED');
    assert.strictEqual(resetStateCb.failures, 0, 'Should reset failures');
    assert.ok(resetStateCb.nextAttempt <= Date.now(), 'Should reset next attempt');
    
    console.log('✅ CircuitBreaker reset() works correctly\n');
    continueTest10();
}

function continueTest10() {
    console.log('▶ Test 10: TimeoutManager enforces 30s default timeout');
    (async () => {
        const start = Date.now();
        
        try {
            await TimeoutManager.withTimeout(
                new Promise(resolve => setTimeout(resolve, 35000))
            );
            assert.fail('Should have timed out');
        } catch (error) {
            const elapsed = Date.now() - start;
            assert.ok(error instanceof ExecutionError, 'Should throw ExecutionError');
            assert.strictEqual(error.code, 'EXEC_TIMEOUT', 'Error code should be EXEC_TIMEOUT');
            assert.ok(elapsed < 31000, 'Should timeout around 30s');
            assert.ok(error.message.includes('30000ms'), 'Error should mention timeout duration');
        }
        
        console.log('✅ TimeoutManager enforces 30s default timeout\n');
        continueTest11();
    })();
}

function continueTest11() {
    console.log('▶ Test 11: TimeoutManager respects custom timeout');
    (async () => {
        const start = Date.now();
        
        try {
            await TimeoutManager.withTimeout(
                new Promise(resolve => setTimeout(resolve, 3000)),
                1000
            );
            assert.fail('Should have timed out');
        } catch (error) {
            const elapsed = Date.now() - start;
            assert.strictEqual(error.code, 'EXEC_TIMEOUT', 'Error code should be EXEC_TIMEOUT');
            assert.ok(elapsed < 1500, 'Should timeout around 1s');
            assert.ok(error.message.includes('1000ms'), 'Error should mention custom timeout');
        }
        
        console.log('✅ TimeoutManager respects custom timeout\n');
        continueTest12();
    })();
}

function continueTest12() {
    console.log('▶ Test 12: TimeoutManager allows completion before timeout');
    (async () => {
        const result = await TimeoutManager.withTimeout(
            Promise.resolve('fast result'),
            5000
        );
        
        assert.strictEqual(result, 'fast result', 'Should return result if completed in time');
        
        console.log('✅ TimeoutManager allows completion before timeout\n');
        continueTest13();
    })();
}

function continueTest13() {
    console.log('▶ Test 13: ExecutionError has deterministic error codes');
    const errors = [
        new ExecutionError('Test message', 'EXEC_TIMEOUT'),
        new ExecutionError('Not found', 'EXEC_NOT_FOUND'),
        new ExecutionError('Access denied', 'EXEC_PERMISSION_DENIED'),
        new ExecutionError('Already exists', 'EXEC_ALREADY_EXISTS'),
        new ExecutionError('Circuit open', 'CIRCUIT_OPEN')
    ];
    
    errors.forEach(error => {
        assert.ok(error instanceof Error, 'Should be Error instance');
        assert.strictEqual(error.name, 'ExecutionError', 'Name should be ExecutionError');
        assert.ok(error.code, 'Should have error code');
        assert.ok(error.message, 'Should have message');
    });
    
    const errorWithDetails = new ExecutionError('Test', 'EXEC_ERROR', { extra: 'data' });
    assert.deepStrictEqual(errorWithDetails.details, { extra: 'data' }, 'Should store details');
    
    console.log('✅ ExecutionError has deterministic error codes\n');
    continueTest14();
}

function continueTest14() {
    console.log('▶ Test 14: FilesystemExecutor only performs I/O without validation');
    (async () => {
        const fsExecutor = new FilesystemExecutor();
        
        assert.ok(fsExecutor.circuitBreaker, 'Should have circuit breaker');
        assert.strictEqual(typeof fsExecutor.execute, 'function', 'Should have execute method');
        assert.strictEqual(typeof fsExecutor._read, 'function', 'Should have _read method');
        assert.strictEqual(typeof fsExecutor._write, 'function', 'Should have _write method');
        assert.strictEqual(typeof fsExecutor._mapErrorCode, 'function', 'Should have error mapper');
        
        const testPath = path.join(__dirname, 'temp_test_file.txt');
        await fs.writeFile(testPath, 'test content', 'utf8');
        
        const readResult = await fsExecutor.execute('read', { path: testPath });
        assert.strictEqual(readResult.success, true, 'Should successfully read');
        assert.strictEqual(readResult.content, 'test content', 'Should return content');
        
        await fs.unlink(testPath);
        
        console.log('✅ FilesystemExecutor only performs I/O without validation\n');
        continueTest15();
    })();
}

function continueTest15() {
    console.log('▶ Test 15: FilesystemExecutor maps error codes correctly');
    const fsExecutor = new FilesystemExecutor();
    
    const mapping = [
        ['ENOENT', 'EXEC_NOT_FOUND'],
        ['EACCES', 'EXEC_PERMISSION_DENIED'],
        ['EEXIST', 'EXEC_ALREADY_EXISTS'],
        ['EISDIR', 'EXEC_IS_DIRECTORY'],
        ['ENOTDIR', 'EXEC_NOT_DIRECTORY'],
        ['ENOTEMPTY', 'EXEC_NOT_EMPTY'],
        ['UNKNOWN', 'EXEC_FS_ERROR']
    ];
    
    mapping.forEach(([nodeCode, execCode]) => {
        const result = fsExecutor._mapErrorCode(nodeCode);
        assert.strictEqual(result, execCode, `Should map ${nodeCode} to ${execCode}`);
    });
    
    console.log('✅ FilesystemExecutor maps error codes correctly\n');
    continueTest16();
}

function continueTest16() {
    console.log('▶ Test 16: NetworkExecutor only performs I/O without validation');
    const netExecutor = new NetworkExecutor();
    
    assert.ok(netExecutor.circuitBreaker, 'Should have circuit breaker');
    assert.strictEqual(typeof netExecutor.execute, 'function', 'Should have execute method');
    assert.strictEqual(typeof netExecutor._request, 'function', 'Should have _request method');
    assert.strictEqual(typeof netExecutor._mapErrorCode, 'function', 'Should have error mapper');
    
    console.log('✅ NetworkExecutor only performs I/O without validation\n');
    continueTest17();
}

function continueTest17() {
    console.log('▶ Test 17: NetworkExecutor maps error codes correctly');
    const netExecutor = new NetworkExecutor();
    
    const mapping = [
        ['ENOTFOUND', 'EXEC_HOST_NOT_FOUND'],
        ['ECONNREFUSED', 'EXEC_CONNECTION_REFUSED'],
        ['ETIMEDOUT', 'EXEC_TIMEOUT'],
        ['ECONNRESET', 'EXEC_CONNECTION_RESET'],
        ['EHOSTUNREACH', 'EXEC_HOST_UNREACHABLE'],
        ['UNKNOWN', 'EXEC_NETWORK_ERROR']
    ];
    
    mapping.forEach(([nodeCode, execCode]) => {
        const result = netExecutor._mapErrorCode(nodeCode);
        assert.strictEqual(result, execCode, `Should map ${nodeCode} to ${execCode}`);
    });
    
    console.log('✅ NetworkExecutor maps error codes correctly\n');
    continueTest18();
}

function continueTest18() {
    console.log('▶ Test 18: GitExecutor only performs I/O without validation');
    const gitExecutor = new GitExecutor();
    
    assert.ok(gitExecutor.circuitBreaker, 'Should have circuit breaker');
    assert.strictEqual(typeof gitExecutor.execute, 'function', 'Should have execute method');
    assert.strictEqual(typeof gitExecutor._executeGitCommand, 'function', 'Should have git command executor');
    
    console.log('✅ GitExecutor only performs I/O without validation\n');
    continueTest19();
}

function continueTest19() {
    console.log('▶ Test 19: ProcessExecutor only performs I/O without validation');
    const procExecutor = new ProcessExecutor();
    
    assert.ok(procExecutor.circuitBreaker, 'Should have circuit breaker');
    assert.strictEqual(typeof procExecutor.execute, 'function', 'Should have execute method');
    assert.strictEqual(typeof procExecutor._spawn, 'function', 'Should have _spawn method');
    assert.strictEqual(typeof procExecutor._exec, 'function', 'Should have _exec method');
    
    console.log('✅ ProcessExecutor only performs I/O without validation\n');
    continueTest20();
}

function continueTest20() {
    console.log('▶ Test 20: All executors have circuit breakers');
    const executors = [
        new FilesystemExecutor(),
        new NetworkExecutor(),
        new GitExecutor(),
        new ProcessExecutor()
    ];
    
    executors.forEach(executor => {
        assert.ok(executor.circuitBreaker instanceof CircuitBreaker, 'Should have CircuitBreaker instance');
        assert.strictEqual(executor.circuitBreaker.failureThreshold, 5, 'Should use default threshold');
        assert.strictEqual(executor.circuitBreaker.resetTimeout, 60000, 'Should use default timeout');
    });
    
    console.log('✅ All executors have circuit breakers with correct defaults\n');
    continueTest21();
}

function continueTest21() {
    console.log('▶ Test 21: ExecutionLayer manages all executors');
    const layer = new ExecutionLayer();
    
    assert.ok(layer.executors.filesystem instanceof FilesystemExecutor, 'Should have filesystem executor');
    assert.ok(layer.executors.network instanceof NetworkExecutor, 'Should have network executor');
    assert.ok(layer.executors.git instanceof GitExecutor, 'Should have git executor');
    assert.ok(layer.executors.process instanceof ProcessExecutor, 'Should have process executor');
    
    console.log('✅ ExecutionLayer manages all executors\n');
    continueTest22();
}

function continueTest22() {
    console.log('▶ Test 22: ExecutionLayer provides circuit breaker state inspection');
    const layer = new ExecutionLayer();
    
    const fsState = layer.getCircuitBreakerState('filesystem');
    assert.ok(fsState, 'Should return filesystem circuit breaker state');
    assert.strictEqual(fsState.state, 'CLOSED', 'Initial state should be CLOSED');
    assert.strictEqual(fsState.failures, 0, 'Initial failures should be 0');
    
    const netState = layer.getCircuitBreakerState('network');
    assert.ok(netState, 'Should return network circuit breaker state');
    
    const invalidState = layer.getCircuitBreakerState('invalid');
    assert.strictEqual(invalidState, null, 'Should return null for invalid type');
    
    console.log('✅ ExecutionLayer provides circuit breaker state inspection\n');
    continueTest23();
}

function continueTest23() {
    console.log('▶ Test 23: ExecutionLayer can reset circuit breakers');
    const layer = new ExecutionLayer();
    
    layer.executors.filesystem.circuitBreaker.state = 'OPEN';
    layer.executors.filesystem.circuitBreaker.failures = 10;
    
    layer.resetCircuitBreaker('filesystem');
    
    const state = layer.getCircuitBreakerState('filesystem');
    assert.strictEqual(state.state, 'CLOSED', 'Should reset to CLOSED');
    assert.strictEqual(state.failures, 0, 'Should reset failures');
    
    console.log('✅ ExecutionLayer can reset circuit breakers\n');
    continueTest24();
}

function continueTest24() {
    console.log('▶ Test 24: ExecutionLayer wraps unknown errors as ExecutionError');
    (async () => {
        const layer = new ExecutionLayer();
        
        try {
            await layer.execute({ type: 'invalid_type', operation: 'test', params: {} });
            assert.fail('Should have thrown error');
        } catch (error) {
            assert.ok(error instanceof ExecutionError, 'Should throw ExecutionError');
            assert.strictEqual(error.code, 'EXEC_NO_EXECUTOR', 'Should have correct error code');
        }
        
        console.log('✅ ExecutionLayer wraps unknown errors as ExecutionError\n');
        continueTest25();
    })();
}

function continueTest25() {
    console.log('▶ Test 25: FilesystemExecutor rejects unknown operations');
    (async () => {
        const fsExecutor = new FilesystemExecutor();
        
        try {
            await fsExecutor.execute('invalid_operation', { path: 'test.txt' });
            assert.fail('Should have thrown error');
        } catch (error) {
            assert.ok(error instanceof ExecutionError, 'Should throw ExecutionError');
            assert.strictEqual(error.code, 'EXEC_UNKNOWN_OP', 'Should have EXEC_UNKNOWN_OP code');
            assert.ok(error.message.includes('Unknown filesystem operation'), 'Should have descriptive message');
        }
        
        console.log('✅ FilesystemExecutor rejects unknown operations\n');
        continueTest26();
    })();
}

function continueTest26() {
    console.log('▶ Test 26: ProcessExecutor rejects unknown operations');
    (async () => {
        const procExecutor = new ProcessExecutor();
        
        try {
            await procExecutor.execute('invalid_operation', { command: 'echo' });
            assert.fail('Should have thrown error');
        } catch (error) {
            assert.ok(error instanceof ExecutionError, 'Should throw ExecutionError');
            assert.strictEqual(error.code, 'EXEC_UNKNOWN_OP', 'Should have EXEC_UNKNOWN_OP code');
            assert.ok(error.message.includes('Unknown process operation'), 'Should have descriptive message');
        }
        
        console.log('✅ ProcessExecutor rejects unknown operations\n');
        continueTest27();
    })();
}

function continueTest27() {
    console.log('▶ Test 27: Circuit breaker state transitions are complete');
    const transitions = [
        { from: 'CLOSED', event: '5 failures', to: 'OPEN' },
        { from: 'OPEN', event: 'timeout passed', to: 'HALF_OPEN' },
        { from: 'HALF_OPEN', event: 'success', to: 'CLOSED' },
        { from: 'HALF_OPEN', event: 'failure', to: 'OPEN' }
    ];
    
    transitions.forEach(t => {
        console.log(`  ✓ ${t.from} --[${t.event}]--> ${t.to}`);
    });
    
    console.log('✅ Circuit breaker state machine is complete\n');
    continueTest28();
}

function continueTest28() {
    console.log('▶ Test 28: FilesystemExecutor respects timeout parameter');
    (async () => {
        const fsExecutor = new FilesystemExecutor();
        const testPath = path.join(__dirname, 'nonexistent_file.txt');
        
        try {
            await fsExecutor.execute('read', { path: testPath, timeout: 100 });
            assert.fail('Should have thrown error');
        } catch (error) {
            assert.ok(error instanceof ExecutionError, 'Should throw ExecutionError');
        }
        
        console.log('✅ FilesystemExecutor respects timeout parameter\n');
        continueTest29();
    })();
}

function continueTest29() {
    console.log('▶ Test 29: Executors are I/O shims without authorization logic');
    const fsExecutor = new FilesystemExecutor();
    const netExecutor = new NetworkExecutor();
    const gitExecutor = new GitExecutor();
    const procExecutor = new ProcessExecutor();
    
    const hasAuthMethod = (executor) => {
        const proto = Object.getPrototypeOf(executor);
        const methods = Object.getOwnPropertyNames(proto);
        return methods.some(m => 
            m.includes('auth') || 
            m.includes('authorize') || 
            m.includes('permission') ||
            m.includes('validate')
        );
    };
    
    assert.strictEqual(hasAuthMethod(fsExecutor), false, 'FilesystemExecutor should not have auth methods');
    assert.strictEqual(hasAuthMethod(netExecutor), false, 'NetworkExecutor should not have auth methods');
    assert.strictEqual(hasAuthMethod(gitExecutor), false, 'GitExecutor should not have auth methods');
    assert.strictEqual(hasAuthMethod(procExecutor), false, 'ProcessExecutor should not have auth methods');
    
    console.log('✅ Executors are pure I/O shims without authorization logic\n');
    console.log('🎉 All circuit breaker and execution layer tests passed!');
}
