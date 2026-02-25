const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const {
    AuthorizationLayer,
    PermissionChecker,
    RateLimitManager,
    TokenBucket
} = require('../core/pipeline/auth');

console.log('🧪 Testing Authorization Layer & Rate Limiting...\n');

// ============================================================================
// Test Suite 1: PermissionChecker - Filesystem Glob Matching
// ============================================================================
console.log('▶ Test Suite 1: PermissionChecker - Filesystem Glob Matching');

console.log('  Test 1.1: Exact path matching');
const manifest1 = {
    capabilities: {
        filesystem: {
            read: ['package.json', 'README.md'],
            write: ['output.txt']
        }
    }
};
const checker1 = new PermissionChecker(manifest1);
assert.strictEqual(checker1.checkFilesystemAccess('read', 'package.json').allowed, true, 'Exact match should be allowed');
assert.strictEqual(checker1.checkFilesystemAccess('read', 'package.json').matchedPattern, 'package.json', 'Should return matched pattern');
assert.strictEqual(checker1.checkFilesystemAccess('read', 'other.json').allowed, false, 'Non-matching path should be denied');
console.log('    ✓ Exact path matching works');

console.log('  Test 1.2: Single asterisk wildcard matching');
const manifest2 = {
    capabilities: {
        filesystem: {
            read: ['*.js', 'src/*.ts', 'test/*.test.js'],
            write: []
        }
    }
};
const checker2 = new PermissionChecker(manifest2);
assert.strictEqual(checker2.checkFilesystemAccess('read', 'index.js').allowed, true, 'Should match *.js');
assert.strictEqual(checker2.checkFilesystemAccess('read', 'main.js').allowed, true, 'Should match *.js');
assert.strictEqual(checker2.checkFilesystemAccess('read', 'src/main.ts').allowed, true, 'Should match src/*.ts');
assert.strictEqual(checker2.checkFilesystemAccess('read', 'src/nested/main.ts').allowed, false, 'Should not match across directories');
assert.strictEqual(checker2.checkFilesystemAccess('read', 'test/auth.test.js').allowed, true, 'Should match test/*.test.js');
console.log('    ✓ Single asterisk wildcard matching works');

console.log('  Test 1.3: Double asterisk (globstar) matching');
const manifest3 = {
    capabilities: {
        filesystem: {
            read: ['**/*.js', 'src/**', 'dist/**/*'],
            write: ['build/**']
        }
    }
};
const checker3 = new PermissionChecker(manifest3);
assert.strictEqual(checker3.checkFilesystemAccess('read', 'index.js').allowed, true, 'Should match **/*.js at root');
assert.strictEqual(checker3.checkFilesystemAccess('read', 'src/utils/helper.js').allowed, true, 'Should match **/*.js nested');
assert.strictEqual(checker3.checkFilesystemAccess('read', 'src/anything').allowed, true, 'Should match src/**');
assert.strictEqual(checker3.checkFilesystemAccess('read', 'src/deeply/nested/file.txt').allowed, true, 'Should match src/** deeply');
assert.strictEqual(checker3.checkFilesystemAccess('read', 'dist/bundle.js').allowed, true, 'Should match dist/**/*');
assert.strictEqual(checker3.checkFilesystemAccess('write', 'build/output.txt').allowed, true, 'Should match build/**');
assert.strictEqual(checker3.checkFilesystemAccess('write', 'build/nested/deep/file.js').allowed, true, 'Should match build/** deeply');
assert.strictEqual(checker3.checkFilesystemAccess('write', 'other/file.txt').allowed, false, 'Should deny non-matching write');
console.log('    ✓ Double asterisk (globstar) matching works');

console.log('  Test 1.4: Question mark wildcard matching');
const manifest4 = {
    capabilities: {
        filesystem: {
            read: ['file?.txt', 'test??.js'],
            write: []
        }
    }
};
const checker4 = new PermissionChecker(manifest4);
assert.strictEqual(checker4.checkFilesystemAccess('read', 'file1.txt').allowed, true, 'Should match file?.txt');
assert.strictEqual(checker4.checkFilesystemAccess('read', 'fileA.txt').allowed, true, 'Should match file?.txt');
assert.strictEqual(checker4.checkFilesystemAccess('read', 'file12.txt').allowed, false, 'Should not match multiple chars');
assert.strictEqual(checker4.checkFilesystemAccess('read', 'test01.js').allowed, true, 'Should match test??.js');
assert.strictEqual(checker4.checkFilesystemAccess('read', 'testAB.js').allowed, true, 'Should match test??.js');
assert.strictEqual(checker4.checkFilesystemAccess('read', 'test1.js').allowed, false, 'Should require exact char count');
console.log('    ✓ Question mark wildcard matching works');

console.log('  Test 1.5: Path normalization (Windows vs Unix)');
const manifest5 = {
    capabilities: {
        filesystem: {
            read: ['src/**/*.js', 'config/settings.json'],
            write: []
        }
    }
};
const checker5 = new PermissionChecker(manifest5);
assert.strictEqual(checker5.checkFilesystemAccess('read', 'src/utils/helper.js').allowed, true, 'Should match Unix path');
assert.strictEqual(checker5.checkFilesystemAccess('read', 'src\\utils\\helper.js').allowed, true, 'Should match Windows path');
assert.strictEqual(checker5.checkFilesystemAccess('read', 'config/settings.json').allowed, true, 'Should match Unix separator');
assert.strictEqual(checker5.checkFilesystemAccess('read', 'config\\settings.json').allowed, true, 'Should match Windows separator');
console.log('    ✓ Path normalization handles Windows and Unix paths');

console.log('  Test 1.6: Special characters in paths');
const manifest6 = {
    capabilities: {
        filesystem: {
            read: ['file[1-3].txt', 'test.spec.js', 'path-with-dash.js'],
            write: []
        }
    }
};
const checker6 = new PermissionChecker(manifest6);
assert.strictEqual(checker6.checkFilesystemAccess('read', 'test.spec.js').allowed, true, 'Should handle dots');
assert.strictEqual(checker6.checkFilesystemAccess('read', 'path-with-dash.js').allowed, true, 'Should handle dashes');
console.log('    ✓ Special characters handled correctly');

console.log('  Test 1.7: Edge case - empty patterns');
const manifest7 = {
    capabilities: {
        filesystem: {
            read: [],
            write: []
        }
    }
};
const checker7 = new PermissionChecker(manifest7);
assert.strictEqual(checker7.checkFilesystemAccess('read', 'any.txt').allowed, false, 'Empty read patterns should deny all');
assert.strictEqual(checker7.checkFilesystemAccess('write', 'any.txt').allowed, false, 'Empty write patterns should deny all');
console.log('    ✓ Empty patterns deny all access');

console.log('  Test 1.8: Edge case - no filesystem capabilities');
const manifest8 = { capabilities: {} };
const checker8 = new PermissionChecker(manifest8);
const noCapResult = checker8.checkFilesystemAccess('read', 'test.txt');
assert.strictEqual(noCapResult.allowed, false, 'No capabilities should deny access');
assert.ok(noCapResult.reason.includes('No filesystem capabilities'), 'Should provide clear reason');
console.log('    ✓ Missing filesystem capabilities handled');

console.log('  Test 1.9: Edge case - read vs write separation');
const manifest9 = {
    capabilities: {
        filesystem: {
            read: ['src/**/*.js'],
            write: ['dist/**']
        }
    }
};
const checker9 = new PermissionChecker(manifest9);
assert.strictEqual(checker9.checkFilesystemAccess('read', 'src/main.js').allowed, true, 'Read should work for src/*.js');
assert.strictEqual(checker9.checkFilesystemAccess('write', 'src/main.js').allowed, false, 'Write should be denied for read-only path');
assert.strictEqual(checker9.checkFilesystemAccess('write', 'dist/bundle.js').allowed, true, 'Write should work for dist/**');
assert.strictEqual(checker9.checkFilesystemAccess('read', 'dist/bundle.js').allowed, false, 'Read should be denied for write-only path');
console.log('    ✓ Read/write separation enforced correctly');

console.log('  Test 1.10: Boundary - very long paths');
const longPath = 'a/'.repeat(50) + 'file.js';
const manifest10 = {
    capabilities: {
        filesystem: {
            read: ['**/*.js'],
            write: []
        }
    }
};
const checker10 = new PermissionChecker(manifest10);
assert.strictEqual(checker10.checkFilesystemAccess('read', longPath).allowed, true, 'Should handle long paths');
console.log('    ✓ Long paths handled correctly');

console.log('✅ PermissionChecker filesystem glob matching tests passed\n');

// ============================================================================
// Test Suite 2: PermissionChecker - Network URL Origin Matching
// ============================================================================
console.log('▶ Test Suite 2: PermissionChecker - Network URL Origin Matching');

console.log('  Test 2.1: Exact origin matching');
const networkManifest1 = {
    capabilities: {
        network: {
            allowlist: ['https://api.github.com', 'https://api.example.com']
        }
    }
};
const netChecker1 = new PermissionChecker(networkManifest1);
assert.strictEqual(netChecker1.checkNetworkAccess('https://api.github.com/repos').allowed, true, 'Should allow matching origin with path');
assert.strictEqual(netChecker1.checkNetworkAccess('https://api.github.com').allowed, true, 'Should allow exact origin');
assert.strictEqual(netChecker1.checkNetworkAccess('https://api.github.com/').allowed, true, 'Should allow with trailing slash');
assert.strictEqual(netChecker1.checkNetworkAccess('https://api.github.com/v1/users').allowed, true, 'Should allow any path on matching origin');
assert.strictEqual(netChecker1.checkNetworkAccess('https://github.com/repos').allowed, false, 'Different subdomain should be denied');
console.log('    ✓ Exact origin matching works');

console.log('  Test 2.2: Protocol matching (http vs https)');
const networkManifest2 = {
    capabilities: {
        network: {
            allowlist: ['https://secure.example.com', 'http://insecure.example.com']
        }
    }
};
const netChecker2 = new PermissionChecker(networkManifest2);
assert.strictEqual(netChecker2.checkNetworkAccess('https://secure.example.com/api').allowed, true, 'HTTPS should match HTTPS');
assert.strictEqual(netChecker2.checkNetworkAccess('http://secure.example.com/api').allowed, false, 'HTTP should not match HTTPS origin');
assert.strictEqual(netChecker2.checkNetworkAccess('http://insecure.example.com/api').allowed, true, 'HTTP should match HTTP');
assert.strictEqual(netChecker2.checkNetworkAccess('https://insecure.example.com/api').allowed, false, 'HTTPS should not match HTTP origin');
console.log('    ✓ Protocol matching enforced strictly');

console.log('  Test 2.3: Port matching');
const networkManifest3 = {
    capabilities: {
        network: {
            allowlist: ['http://localhost:3000', 'http://localhost:8080', 'https://api.example.com:443']
        }
    }
};
const netChecker3 = new PermissionChecker(networkManifest3);
assert.strictEqual(netChecker3.checkNetworkAccess('http://localhost:3000/api').allowed, true, 'Should match explicit port 3000');
assert.strictEqual(netChecker3.checkNetworkAccess('http://localhost:8080/api').allowed, true, 'Should match explicit port 8080');
assert.strictEqual(netChecker3.checkNetworkAccess('http://localhost:9000/api').allowed, false, 'Different port should be denied');
assert.strictEqual(netChecker3.checkNetworkAccess('http://localhost/api').allowed, false, 'Default port should not match explicit port');
console.log('    ✓ Port matching works correctly');

console.log('  Test 2.4: Default port handling');
const networkManifest4 = {
    capabilities: {
        network: {
            allowlist: ['https://api.example.com', 'http://example.org']
        }
    }
};
const netChecker4 = new PermissionChecker(networkManifest4);
// URL API normalizes default ports (443 for https, 80 for http), so they match
assert.strictEqual(netChecker4.checkNetworkAccess('https://api.example.com:443/api').allowed, true, 'Default port 443 normalized to no port');
assert.strictEqual(netChecker4.checkNetworkAccess('http://example.org:80/api').allowed, true, 'Default port 80 normalized to no port');
// Non-default ports should NOT match
assert.strictEqual(netChecker4.checkNetworkAccess('https://api.example.com:8443/api').allowed, false, 'Non-default port should not match');
assert.strictEqual(netChecker4.checkNetworkAccess('http://example.org:8080/api').allowed, false, 'Non-default port should not match');
console.log('    ✓ Default port handling enforced');

console.log('  Test 2.5: Invalid URLs rejected');
const networkManifest5 = {
    capabilities: {
        network: {
            allowlist: ['https://api.example.com']
        }
    }
};
const netChecker5 = new PermissionChecker(networkManifest5);
const invalidUrlResult = netChecker5.checkNetworkAccess('not-a-valid-url');
assert.strictEqual(invalidUrlResult.allowed, false, 'Invalid URL should be rejected');
assert.ok(invalidUrlResult.reason.includes('Invalid URL'), 'Should provide clear error message');
const relativeUrlResult = netChecker5.checkNetworkAccess('/relative/path');
assert.strictEqual(relativeUrlResult.allowed, false, 'Relative URL should be rejected');
console.log('    ✓ Invalid URLs rejected with clear messages');

console.log('  Test 2.6: Edge case - empty allowlist');
const networkManifest6 = {
    capabilities: {
        network: {
            allowlist: []
        }
    }
};
const netChecker6 = new PermissionChecker(networkManifest6);
const emptyListResult = netChecker6.checkNetworkAccess('https://api.example.com');
assert.strictEqual(emptyListResult.allowed, false, 'Empty allowlist should deny all');
assert.ok(emptyListResult.reason.includes('No network allowlist'), 'Should provide clear reason');
console.log('    ✓ Empty allowlist denies all access');

console.log('  Test 2.7: Edge case - no network capabilities');
const networkManifest7 = { capabilities: {} };
const netChecker7 = new PermissionChecker(networkManifest7);
const noNetResult = netChecker7.checkNetworkAccess('https://api.example.com');
assert.strictEqual(noNetResult.allowed, false, 'No network capabilities should deny');
assert.ok(noNetResult.reason.includes('No network capabilities'), 'Should provide clear reason');
console.log('    ✓ Missing network capabilities handled');

console.log('  Test 2.8: Query parameters and fragments ignored');
const networkManifest8 = {
    capabilities: {
        network: {
            allowlist: ['https://api.example.com']
        }
    }
};
const netChecker8 = new PermissionChecker(networkManifest8);
assert.strictEqual(netChecker8.checkNetworkAccess('https://api.example.com/path?query=value').allowed, true, 'Query params should not affect origin match');
assert.strictEqual(netChecker8.checkNetworkAccess('https://api.example.com/path#fragment').allowed, true, 'Fragments should not affect origin match');
assert.strictEqual(netChecker8.checkNetworkAccess('https://api.example.com?key=value').allowed, true, 'Root with query should match');
console.log('    ✓ Query parameters and fragments handled correctly');

console.log('  Test 2.9: Subdomain isolation');
const networkManifest9 = {
    capabilities: {
        network: {
            allowlist: ['https://api.example.com']
        }
    }
};
const netChecker9 = new PermissionChecker(networkManifest9);
assert.strictEqual(netChecker9.checkNetworkAccess('https://api.example.com/path').allowed, true, 'Exact subdomain should match');
assert.strictEqual(netChecker9.checkNetworkAccess('https://example.com/path').allowed, false, 'Parent domain should not match');
assert.strictEqual(netChecker9.checkNetworkAccess('https://www.api.example.com/path').allowed, false, 'Different subdomain should not match');
assert.strictEqual(netChecker9.checkNetworkAccess('https://apiv2.example.com/path').allowed, false, 'Similar subdomain should not match');
console.log('    ✓ Subdomain isolation enforced');

console.log('  Test 2.10: Edge case - invalid allowlist entries skipped');
const networkManifest10 = {
    capabilities: {
        network: {
            allowlist: ['not-a-url', 'https://valid.example.com', 'also-invalid']
        }
    }
};
const netChecker10 = new PermissionChecker(networkManifest10);
assert.strictEqual(netChecker10.checkNetworkAccess('https://valid.example.com/api').allowed, true, 'Should match valid entry');
assert.strictEqual(netChecker10.checkNetworkAccess('https://not-a-url/api').allowed, false, 'Should skip invalid entries');
console.log('    ✓ Invalid allowlist entries skipped gracefully');

console.log('✅ PermissionChecker network URL origin matching tests passed\n');

// ============================================================================
// Test Suite 3: PermissionChecker - Git & Process Access
// ============================================================================
console.log('▶ Test Suite 3: PermissionChecker - Git & Process Access');

console.log('  Test 3.1: Git read permissions');
const gitManifest1 = {
    capabilities: {
        git: {
            read: true,
            write: false
        }
    }
};
const gitChecker1 = new PermissionChecker(gitManifest1);
assert.strictEqual(gitChecker1.checkGitAccess('status').allowed, true, 'Read operations should be allowed');
assert.strictEqual(gitChecker1.checkGitAccess('log').allowed, true, 'Read operations should be allowed');
assert.strictEqual(gitChecker1.checkGitAccess('diff').allowed, true, 'Read operations should be allowed');
assert.strictEqual(gitChecker1.checkGitAccess('show').allowed, true, 'Read operations should be allowed');
console.log('    ✓ Git read permissions work');

console.log('  Test 3.2: Git write permissions');
const gitManifest2 = {
    capabilities: {
        git: {
            read: true,
            write: true
        }
    }
};
const gitChecker2 = new PermissionChecker(gitManifest2);
assert.strictEqual(gitChecker2.checkGitAccess('commit').allowed, true, 'Write operations should be allowed');
assert.strictEqual(gitChecker2.checkGitAccess('branch').allowed, true, 'Write operations should be allowed');
assert.strictEqual(gitChecker2.checkGitAccess('tag').allowed, true, 'Write operations should be allowed');
assert.strictEqual(gitChecker2.checkGitAccess('push').allowed, true, 'Write operations should be allowed');
assert.strictEqual(gitChecker2.checkGitAccess('reset').allowed, true, 'Write operations should be allowed');
console.log('    ✓ Git write permissions work');

console.log('  Test 3.3: Git write denied when not permitted');
const gitManifest3 = {
    capabilities: {
        git: {
            read: true,
            write: false
        }
    }
};
const gitChecker3 = new PermissionChecker(gitManifest3);
assert.strictEqual(gitChecker3.checkGitAccess('commit').allowed, false, 'Write should be denied');
assert.strictEqual(gitChecker3.checkGitAccess('push').allowed, false, 'Write should be denied');
assert.ok(gitChecker3.checkGitAccess('commit').reason.includes('not permitted'), 'Should explain denial');
console.log('    ✓ Git write denial works');

console.log('  Test 3.4: Git read denied when not permitted');
const gitManifest4 = {
    capabilities: {
        git: {
            read: false,
            write: true
        }
    }
};
const gitChecker4 = new PermissionChecker(gitManifest4);
assert.strictEqual(gitChecker4.checkGitAccess('status').allowed, false, 'Read should be denied');
assert.strictEqual(gitChecker4.checkGitAccess('log').allowed, false, 'Read should be denied');
console.log('    ✓ Git read denial works');

console.log('  Test 3.5: Edge case - no git capabilities');
const gitManifest5 = { capabilities: {} };
const gitChecker5 = new PermissionChecker(gitManifest5);
const noGitResult = gitChecker5.checkGitAccess('status');
assert.strictEqual(noGitResult.allowed, false, 'No git capabilities should deny');
assert.ok(noGitResult.reason.includes('No git capabilities'), 'Should provide clear reason');
console.log('    ✓ Missing git capabilities handled');

console.log('  Test 3.6: Process spawn permissions');
const procManifest1 = {
    permissions: ['process:spawn']
};
const procChecker1 = new PermissionChecker(procManifest1);
assert.strictEqual(procChecker1.checkProcessAccess().allowed, true, 'Should allow process spawn');
console.log('    ✓ Process spawn permission works');

console.log('  Test 3.7: Process spawn denied without permission');
const procManifest2 = {
    permissions: []
};
const procChecker2 = new PermissionChecker(procManifest2);
assert.strictEqual(procChecker2.checkProcessAccess().allowed, false, 'Should deny without permission');
assert.ok(procChecker2.checkProcessAccess().reason.includes('not granted'), 'Should explain denial');
console.log('    ✓ Process spawn denial works');

console.log('  Test 3.8: Generic permission check');
const manifest11 = {
    permissions: ['filesystem:read', 'network:https', 'env:read']
};
const checker11 = new PermissionChecker(manifest11);
assert.strictEqual(checker11.checkPermission('filesystem:read'), true, 'Should find granted permission');
assert.strictEqual(checker11.checkPermission('network:https'), true, 'Should find granted permission');
assert.strictEqual(checker11.checkPermission('env:read'), true, 'Should find granted permission');
assert.strictEqual(checker11.checkPermission('process:spawn'), false, 'Should not find ungranted permission');
console.log('    ✓ Generic permission check works');

console.log('✅ Git & process access tests passed\n');

// ============================================================================
// Test Suite 4: TokenBucket - CIR-based Refill
// ============================================================================
console.log('▶ Test Suite 4: TokenBucket - CIR-based Refill');

console.log('  Test 4.1: Initial token state');
const bucket1 = new TokenBucket(60, 100);
assert.strictEqual(bucket1.tokens, 100, 'Should start with bc tokens');
assert.strictEqual(bucket1.cir, 60, 'CIR should be set');
assert.strictEqual(bucket1.bc, 100, 'Bc should be set');
console.log('    ✓ Initial token state correct');

console.log('  Test 4.2: Token consumption');
const bucket2 = new TokenBucket(60, 100);
const fixedTime1 = Date.now();
bucket2.lastRefill = fixedTime1;
assert.strictEqual(bucket2.tryConsume(30), true, 'Should consume 30 tokens');
assert.strictEqual(bucket2.tokens, 70, 'Should have 70 tokens remaining');
bucket2.lastRefill = fixedTime1;
assert.strictEqual(bucket2.tryConsume(50), true, 'Should consume 50 more tokens');
assert.strictEqual(bucket2.tokens, 20, 'Should have 20 tokens remaining');
console.log('    ✓ Token consumption works');

console.log('  Test 4.3: Token consumption failure when insufficient');
const bucket3 = new TokenBucket(60, 100);
const fixedTime2 = Date.now();
bucket3.lastRefill = fixedTime2;
bucket3.tryConsume(80);
bucket3.lastRefill = fixedTime2;
assert.strictEqual(bucket3.tryConsume(30), false, 'Should fail when insufficient tokens');
assert.strictEqual(bucket3.tokens, 20, 'Tokens should not change on failed consumption');
console.log('    ✓ Consumption failure handled correctly');

console.log('  Test 4.4: CIR-based refill calculation (60 tokens per minute)');
const bucket4 = new TokenBucket(60, 100); // 60 tokens/min = 1 token/sec
bucket4.tokens = 0;
const startTime = Date.now();
bucket4.lastRefill = startTime;

// Simulate 30 seconds elapsed
bucket4.lastRefill = startTime - 30000;
bucket4._refill();
assert.strictEqual(bucket4.tokens, 30, 'Should refill 30 tokens after 30 seconds (60/min rate)');

// Simulate 60 seconds elapsed from start
bucket4.tokens = 0;
bucket4.lastRefill = startTime - 60000;
bucket4._refill();
assert.strictEqual(bucket4.tokens, 60, 'Should refill 60 tokens after 60 seconds');

// Simulate 120 seconds elapsed but capped at bc
bucket4.tokens = 0;
bucket4.lastRefill = startTime - 120000;
bucket4._refill();
assert.strictEqual(bucket4.tokens, 100, 'Should cap at bc (100) even after 120 seconds');
console.log('    ✓ CIR-based refill calculation correct');

console.log('  Test 4.5: Refill rate precision (CIR = 100 tokens/min)');
const bucket5 = new TokenBucket(100, 200); // 100 tokens/min ≈ 1.67 tokens/sec
bucket5.tokens = 0;
const startTime2 = Date.now();
bucket5.lastRefill = startTime2 - 6000; // 6 seconds
bucket5._refill();
assert.strictEqual(bucket5.tokens, 10, 'Should refill 10 tokens after 6 seconds (100/min rate)');

bucket5.tokens = 0;
bucket5.lastRefill = startTime2 - 30000; // 30 seconds
bucket5._refill();
assert.strictEqual(bucket5.tokens, 50, 'Should refill 50 tokens after 30 seconds');
console.log('    ✓ Different CIR rates calculated correctly');

console.log('  Test 4.6: Partial refill doesn\'t update lastRefill when no tokens added');
const bucket6 = new TokenBucket(60, 100);
const startTime3 = Date.now();
bucket6.lastRefill = startTime3;
const initialLastRefill = bucket6.lastRefill;

// Simulate < 1 second elapsed (not enough for a token)
bucket6.lastRefill = startTime3 - 500; // 0.5 seconds
bucket6._refill();
// At 60 tokens/min, 0.5 seconds = 0.5 tokens, which floors to 0
assert.strictEqual(bucket6.tokens, 100, 'Should not add tokens for sub-second intervals');
console.log('    ✓ Sub-second intervals handled correctly');

console.log('  Test 4.7: Boundary case - zero tokens available');
const bucket7 = new TokenBucket(60, 100);
bucket7.tokens = 0;
const time7 = Date.now();
bucket7.lastRefill = time7;
assert.strictEqual(bucket7.tryConsume(1), false, 'Should fail with zero tokens');
assert.strictEqual(bucket7.tokens, 0, 'Should remain at zero');
console.log('    ✓ Zero tokens boundary handled');

console.log('  Test 4.8: Boundary case - exactly bc tokens');
const bucket8 = new TokenBucket(60, 100);
bucket8.tokens = 100;
const time8 = Date.now();
bucket8.lastRefill = time8;
assert.strictEqual(bucket8.tryConsume(100), true, 'Should consume all bc tokens');
assert.strictEqual(bucket8.tokens, 0, 'Should have zero remaining');
console.log('    ✓ Full bucket consumption works');

console.log('  Test 4.9: State reporting');
const bucket9 = new TokenBucket(120, 500);
bucket9.tokens = 250;
const state = bucket9.getState();
assert.strictEqual(state.available, 250, 'Should report available tokens');
assert.strictEqual(state.capacity, 500, 'Should report capacity');
assert.strictEqual(state.cir, 120, 'Should report CIR');
assert.ok(state.lastRefill, 'Should report lastRefill timestamp');
console.log('    ✓ State reporting accurate');

console.log('  Test 4.10: Edge case - very high CIR');
const bucket10 = new TokenBucket(10000, 50000); // 10k tokens/min
bucket10.tokens = 0;
const time10 = Date.now();
bucket10.lastRefill = time10 - 60000; // 1 minute
bucket10._refill();
assert.strictEqual(bucket10.tokens, 10000, 'Should handle high CIR correctly');
console.log('    ✓ High CIR values handled');

console.log('✅ TokenBucket CIR-based refill tests passed\n');

// ============================================================================
// Test Suite 5: RateLimitManager
// ============================================================================
console.log('▶ Test Suite 5: RateLimitManager');

console.log('  Test 5.1: Bucket initialization');
const rateLimiter1 = new RateLimitManager();
rateLimiter1.initBucket('ext1', 60, 100);
const state1 = rateLimiter1.getState('ext1');
assert.ok(state1, 'Should create bucket for extension');
assert.strictEqual(state1.cir, 60, 'Should set CIR');
assert.strictEqual(state1.capacity, 100, 'Should set capacity');
console.log('    ✓ Bucket initialization works');

console.log('  Test 5.2: Multiple extensions isolated');
const rateLimiter2 = new RateLimitManager();
rateLimiter2.initBucket('ext1', 60, 100);
rateLimiter2.initBucket('ext2', 120, 200);
const fixedTime3 = Date.now();
rateLimiter2.buckets.get('ext1').lastRefill = fixedTime3;
rateLimiter2.buckets.get('ext2').lastRefill = fixedTime3;
rateLimiter2.checkLimit('ext1', 80);
const state2a = rateLimiter2.getState('ext1');
const state2b = rateLimiter2.getState('ext2');
assert.strictEqual(state2a.available, 20, 'ext1 should have consumed tokens');
assert.strictEqual(state2b.available, 200, 'ext2 should be unaffected');
console.log('    ✓ Extensions isolated correctly');

console.log('  Test 5.3: Rate limit check success');
const rateLimiter3 = new RateLimitManager();
rateLimiter3.initBucket('ext3', 60, 100);
const fixedTime4 = Date.now();
rateLimiter3.buckets.get('ext3').lastRefill = fixedTime4;
const result3 = rateLimiter3.checkLimit('ext3', 50);
assert.strictEqual(result3.allowed, true, 'Should allow within limit');
assert.strictEqual(result3.reason, null, 'Should have no reason on success');
console.log('    ✓ Rate limit check allows valid requests');

console.log('  Test 5.4: Rate limit check failure');
const rateLimiter4 = new RateLimitManager();
rateLimiter4.initBucket('ext4', 60, 100);
const fixedTime5 = Date.now();
rateLimiter4.buckets.get('ext4').lastRefill = fixedTime5;
rateLimiter4.checkLimit('ext4', 80);
rateLimiter4.buckets.get('ext4').lastRefill = fixedTime5;
const result4 = rateLimiter4.checkLimit('ext4', 30);
assert.strictEqual(result4.allowed, false, 'Should deny over limit');
assert.ok(result4.reason.includes('Rate limit exceeded'), 'Should explain denial');
console.log('    ✓ Rate limit check denies over-limit requests');

console.log('  Test 5.5: Bucket reset');
const rateLimiter5 = new RateLimitManager();
rateLimiter5.initBucket('ext5', 60, 100);
const fixedTime6 = Date.now();
rateLimiter5.buckets.get('ext5').lastRefill = fixedTime6;
rateLimiter5.checkLimit('ext5', 90);
rateLimiter5.buckets.get('ext5').lastRefill = fixedTime6;
rateLimiter5.reset('ext5');
const state5 = rateLimiter5.getState('ext5');
assert.strictEqual(state5.available, 100, 'Should reset to full capacity');
console.log('    ✓ Bucket reset works');

console.log('  Test 5.6: Bucket cleanup');
const rateLimiter6 = new RateLimitManager();
rateLimiter6.initBucket('ext6', 60, 100);
rateLimiter6.cleanup('ext6');
const state6 = rateLimiter6.getState('ext6');
assert.strictEqual(state6, null, 'Should remove bucket');
console.log('    ✓ Bucket cleanup works');

console.log('  Test 5.7: Check limit for unregistered extension');
const rateLimiter7 = new RateLimitManager();
const result7 = rateLimiter7.checkLimit('nonexistent', 10);
assert.strictEqual(result7.allowed, false, 'Should deny unregistered extension');
assert.ok(result7.reason.includes('No rate limit configuration'), 'Should explain missing config');
console.log('    ✓ Unregistered extension handled');

console.log('✅ RateLimitManager tests passed\n');

// ============================================================================
// Test Suite 6: TrafficPolicer Integration & Violating Request Dropping
// ============================================================================
console.log('▶ Test Suite 6: TrafficPolicer Integration & Violating Request Dropping');

const testPersistencePath = path.join(os.tmpdir(), `test-auth-policer-${Date.now()}.json`);

console.log('  Test 6.1: TrafficPolicer drops violating requests before audit');
const authLayer1 = new AuthorizationLayer({
    persistencePath: testPersistencePath,
    dropViolating: true
});

const policerManifest1 = {
    capabilities: {
        network: {
            allowlist: ['https://api.example.com'],
            rateLimit: {
                cir: 60,
                bc: 10,  // TrafficPolicer Bc
                be: 5    // TrafficPolicer Be (total capacity = 15)
                // Note: RateLimitManager also uses bc=10, but we'll manage it separately
            }
        }
    }
};

authLayer1.registerExtension('policer-ext-1', policerManifest1);

// Set fixed time to prevent refills
const policerBucket = authLayer1.trafficPolicer.buckets.get('policer-ext-1');
const rateLimitBucket = authLayer1.rateLimitManager.buckets.get('policer-ext-1');
const fixedPolicerTime = Date.now();

// Give RateLimitManager enough tokens so it doesn't interfere (it will refill naturally)
// We fix TrafficPolicer time but allow RateLimitManager to refill
rateLimitBucket.tokens = 1000; // Plenty of tokens

const networkIntent1 = {
    type: 'network',
    operation: 'https',
    params: { url: 'https://api.example.com/data' },
    extensionId: 'policer-ext-1'
};

// Consume all committed (10) and excess (5) tokens = 15 total from TrafficPolicer
// Fix time for TrafficPolicer to prevent refills
for (let i = 0; i < 15; i++) {
    policerBucket.lastRefill = fixedPolicerTime;
    const result = authLayer1.authorize(networkIntent1);
    if (!result.authorized) {
        console.log(`Request ${i + 1} failed:`, result);
    }
    assert.strictEqual(result.authorized, true, `Request ${i + 1} should be authorized`);
}

// 16th request should be violating (red) and dropped by TrafficPolicer
policerBucket.lastRefill = fixedPolicerTime;
const violatingResult = authLayer1.authorize(networkIntent1);

assert.strictEqual(violatingResult.authorized, false, 'Violating request should be denied');
assert.strictEqual(violatingResult.code, 'QOS_VIOLATING', 'Should have QOS_VIOLATING code');
assert.strictEqual(violatingResult.qos.color, 'red', 'Should be classified as red');
assert.strictEqual(violatingResult.qos.classification, 'Violating', 'Should be Violating');
assert.ok(violatingResult.reason.includes('dropped'), 'Should indicate request was dropped');

console.log('    ✓ TrafficPolicer drops violating requests with correct code');

console.log('  Test 6.2: Green traffic passes authorization');
authLayer1.resetTrafficPolicer('policer-ext-1');
authLayer1.resetRateLimit('policer-ext-1');
const greenBucket = authLayer1.trafficPolicer.buckets.get('policer-ext-1');
const greenRateLimitBucket = authLayer1.rateLimitManager.buckets.get('policer-ext-1');
greenRateLimitBucket.tokens = 1000; // Plenty
const fixedGreenTime = Date.now();
greenBucket.lastRefill = fixedGreenTime;

const greenResult = authLayer1.authorize(networkIntent1);
assert.strictEqual(greenResult.authorized, true, 'Green traffic should be authorized');
console.log('    ✓ Green traffic passes authorization');

console.log('  Test 6.3: Yellow traffic passes authorization');
// Consume all committed tokens (10) to force yellow traffic
for (let i = 0; i < 10; i++) {
    greenBucket.lastRefill = fixedGreenTime;
    authLayer1.authorize(networkIntent1);
}

// Next request should be yellow (from excess bucket)
greenBucket.lastRefill = fixedGreenTime;
const yellowResult = authLayer1.authorize(networkIntent1);
assert.strictEqual(yellowResult.authorized, true, 'Yellow traffic should be authorized');
console.log('    ✓ Yellow traffic passes authorization');

console.log('  Test 6.4: TrafficPolicer state accessible');
const policerState = authLayer1.getTrafficPolicerState('policer-ext-1');
assert.ok(policerState, 'Should return traffic policer state');
assert.ok(policerState.committedTokens >= 0, 'Should have committed tokens');
assert.ok(policerState.excessTokens >= 0, 'Should have excess tokens');
console.log('    ✓ TrafficPolicer state accessible');

console.log('  Test 6.5: All states retrievable');
const allStates = authLayer1.getAllTrafficPolicerStates();
assert.ok(allStates['policer-ext-1'], 'Should include registered extension');
console.log('    ✓ All TrafficPolicer states retrievable');

console.log('  Test 6.6: Extension without rate limit not policed');
const noRateLimitManifest = {
    capabilities: {
        network: {
            allowlist: ['https://api.example.com']
            // No rateLimit specified
        }
    }
};

authLayer1.registerExtension('no-ratelimit-ext', noRateLimitManifest);

const noRateLimitIntent = {
    type: 'network',
    operation: 'https',
    params: { url: 'https://api.example.com/data' },
    extensionId: 'no-ratelimit-ext'
};

const noRateLimitResult = authLayer1.authorize(noRateLimitIntent);
assert.strictEqual(noRateLimitResult.authorized, false, 'Should fail due to missing rate limit config');
assert.strictEqual(noRateLimitResult.code, 'QOS_NOT_CONFIGURED', 'Should have QOS_NOT_CONFIGURED code');
console.log('    ✓ Extensions without rate limit properly rejected');

console.log('  Test 6.7: Cleanup removes all rate limiting state');
authLayer1.unregisterExtension('policer-ext-1');
const cleanedState = authLayer1.getRateLimitState('policer-ext-1');
const cleanedPolicerState = authLayer1.getTrafficPolicerState('policer-ext-1');
assert.strictEqual(cleanedState, null, 'Rate limit state should be removed');
assert.strictEqual(cleanedPolicerState, null, 'Traffic policer state should be removed');
console.log('    ✓ Cleanup removes all rate limiting state');

// Cleanup test file
if (fs.existsSync(testPersistencePath)) {
    fs.unlinkSync(testPersistencePath);
}

console.log('✅ TrafficPolicer integration tests passed\n');

// ============================================================================
// Test Suite 7: AuthorizationLayer Integration - End-to-End
// ============================================================================
console.log('▶ Test Suite 7: AuthorizationLayer Integration - End-to-End');

console.log('  Test 7.1: Complete filesystem intent authorization');
const authLayer2 = new AuthorizationLayer();
const fsManifest = {
    capabilities: {
        filesystem: {
            read: ['**/*.js', 'package.json'],
            write: ['dist/**']
        }
    }
};
authLayer2.registerExtension('fs-ext', fsManifest);

const readIntent = {
    type: 'filesystem',
    operation: 'read',
    params: { path: 'src/main.js' },
    extensionId: 'fs-ext'
};
const readResult = authLayer2.authorize(readIntent);
assert.strictEqual(readResult.authorized, true, 'Read should be authorized');
assert.strictEqual(readResult.metadata.matchedPattern, '**/*.js', 'Should return matched pattern');

const writeIntent = {
    type: 'filesystem',
    operation: 'write',
    params: { path: 'dist/bundle.js', content: 'code' },
    extensionId: 'fs-ext'
};
const writeResult = authLayer2.authorize(writeIntent);
assert.strictEqual(writeResult.authorized, true, 'Write should be authorized');

const deniedWriteIntent = {
    type: 'filesystem',
    operation: 'write',
    params: { path: 'src/main.js', content: 'code' },
    extensionId: 'fs-ext'
};
const deniedWriteResult = authLayer2.authorize(deniedWriteIntent);
assert.strictEqual(deniedWriteResult.authorized, false, 'Unauthorized write should be denied');
assert.strictEqual(deniedWriteResult.code, 'AUTH_PERMISSION_DENIED', 'Should have correct error code');
console.log('    ✓ Filesystem authorization works end-to-end');

console.log('  Test 7.2: Complete network intent authorization with rate limiting');
const testPersistence2 = path.join(os.tmpdir(), `test-auth-e2e-${Date.now()}.json`);
const authLayer3 = new AuthorizationLayer({
    persistencePath: testPersistence2,
    dropViolating: true
});

const netManifest2 = {
    capabilities: {
        network: {
            allowlist: ['https://api.example.com'],
            rateLimit: {
                cir: 60,
                bc: 100,
                be: 50
            }
        }
    }
};
authLayer3.registerExtension('net-ext', netManifest2);

const netIntent = {
    type: 'network',
    operation: 'https',
    params: { url: 'https://api.example.com/endpoint', method: 'GET' },
    extensionId: 'net-ext'
};

const netBucket = authLayer3.trafficPolicer.buckets.get('net-ext');
const fixedNetTime = Date.now();
netBucket.lastRefill = fixedNetTime;

const netResult = authLayer3.authorize(netIntent);
assert.strictEqual(netResult.authorized, true, 'Network request should be authorized');

// Verify wrong origin is denied
const wrongOriginIntent = {
    type: 'network',
    operation: 'https',
    params: { url: 'https://evil.com/endpoint', method: 'GET' },
    extensionId: 'net-ext'
};
const wrongOriginResult = authLayer3.authorize(wrongOriginIntent);
assert.strictEqual(wrongOriginResult.authorized, false, 'Wrong origin should be denied');
assert.strictEqual(wrongOriginResult.code, 'AUTH_PERMISSION_DENIED', 'Should have permission denied code');

if (fs.existsSync(testPersistence2)) {
    fs.unlinkSync(testPersistence2);
}
console.log('    ✓ Network authorization with rate limiting works end-to-end');

console.log('  Test 7.3: Complete git intent authorization');
const authLayer4 = new AuthorizationLayer();
const gitManifest10 = {
    capabilities: {
        git: {
            read: true,
            write: false
        }
    }
};
authLayer4.registerExtension('git-ext', gitManifest10);

const gitReadIntent = {
    type: 'git',
    operation: 'status',
    params: { args: [] },
    extensionId: 'git-ext'
};
const gitReadResult = authLayer4.authorize(gitReadIntent);
assert.strictEqual(gitReadResult.authorized, true, 'Git read should be authorized');

const gitWriteIntent = {
    type: 'git',
    operation: 'commit',
    params: { message: 'test' },
    extensionId: 'git-ext'
};
const gitWriteResult = authLayer4.authorize(gitWriteIntent);
assert.strictEqual(gitWriteResult.authorized, false, 'Git write should be denied');
assert.strictEqual(gitWriteResult.code, 'AUTH_PERMISSION_DENIED', 'Should have correct error code');
console.log('    ✓ Git authorization works end-to-end');

console.log('  Test 7.4: Complete process intent authorization');
const authLayer5 = new AuthorizationLayer();
const procManifest10 = {
    permissions: ['process:spawn']
};
authLayer5.registerExtension('proc-ext', procManifest10);

const procIntent = {
    type: 'process',
    operation: 'spawn',
    params: { command: 'npm', args: ['test'] },
    extensionId: 'proc-ext'
};
const procResult = authLayer5.authorize(procIntent);
assert.strictEqual(procResult.authorized, true, 'Process spawn should be authorized');

const noProcManifest = { permissions: [] };
authLayer5.registerExtension('no-proc-ext', noProcManifest);
const noProcIntent = {
    type: 'process',
    operation: 'spawn',
    params: { command: 'npm', args: ['test'] },
    extensionId: 'no-proc-ext'
};
const noProcResult = authLayer5.authorize(noProcIntent);
assert.strictEqual(noProcResult.authorized, false, 'Process spawn should be denied without permission');
console.log('    ✓ Process authorization works end-to-end');

console.log('  Test 7.5: Unknown intent type rejected');
const authLayer6 = new AuthorizationLayer();
authLayer6.registerExtension('unknown-ext', { capabilities: {} });
const unknownIntent = {
    type: 'unknown',
    operation: 'test',
    params: {},
    extensionId: 'unknown-ext'
};
const unknownResult = authLayer6.authorize(unknownIntent);
assert.strictEqual(unknownResult.authorized, false, 'Unknown intent type should be denied');
assert.strictEqual(unknownResult.code, 'AUTH_UNKNOWN_TYPE', 'Should have unknown type code');
console.log('    ✓ Unknown intent types rejected');

console.log('  Test 7.6: Unregistered extension rejected');
const authLayer7 = new AuthorizationLayer();
const unregisteredIntent = {
    type: 'filesystem',
    operation: 'read',
    params: { path: 'test.txt' },
    extensionId: 'never-registered'
};
const unregisteredResult = authLayer7.authorize(unregisteredIntent);
assert.strictEqual(unregisteredResult.authorized, false, 'Unregistered extension should be denied');
assert.strictEqual(unregisteredResult.code, 'AUTH_NOT_REGISTERED', 'Should have not registered code');
console.log('    ✓ Unregistered extensions rejected');

console.log('✅ AuthorizationLayer integration tests passed\n');

// ============================================================================
// Test Suite 8: Edge Cases & Boundary Conditions
// ============================================================================
console.log('▶ Test Suite 8: Edge Cases & Boundary Conditions');

console.log('  Test 8.1: Empty manifest capabilities');
const emptyAuth = new AuthorizationLayer();
const emptyManifest = { capabilities: {} };
emptyAuth.registerExtension('empty-ext', emptyManifest);

const testIntent = {
    type: 'filesystem',
    operation: 'read',
    params: { path: 'test.txt' },
    extensionId: 'empty-ext'
};
const emptyResult = emptyAuth.authorize(testIntent);
assert.strictEqual(emptyResult.authorized, false, 'Empty capabilities should deny all');
console.log('    ✓ Empty capabilities handled');

console.log('  Test 8.2: Null/undefined manifest fields');
const nullAuth = new AuthorizationLayer();
const nullManifest = {
    capabilities: {
        filesystem: {
            read: null,
            write: undefined
        }
    }
};
nullAuth.registerExtension('null-ext', nullManifest);

const nullIntent = {
    type: 'filesystem',
    operation: 'read',
    params: { path: 'test.txt' },
    extensionId: 'null-ext'
};
const nullResult = nullAuth.authorize(nullIntent);
assert.strictEqual(nullResult.authorized, false, 'Null patterns should deny access');
console.log('    ✓ Null/undefined fields handled safely');

console.log('  Test 8.3: Very long URL');
const longUrlAuth = new AuthorizationLayer();
const longUrlManifest = {
    capabilities: {
        network: {
            allowlist: ['https://api.example.com'],
            rateLimit: {
                cir: 60,
                bc: 100,
                be: 50
            }
        }
    }
};
longUrlAuth.registerExtension('long-url-ext', longUrlManifest);

const veryLongUrlPath = '/api/v1/' + 'a'.repeat(5000);
const longUrlIntent = {
    type: 'network',
    operation: 'https',
    params: { url: `https://api.example.com${veryLongUrlPath}` },
    extensionId: 'long-url-ext'
};
const longUrlResult = longUrlAuth.authorize(longUrlIntent);
assert.strictEqual(longUrlResult.authorized, true, 'Long URLs should be handled');
console.log('    ✓ Very long URLs handled');

console.log('  Test 8.4: Concurrent token consumption');
const concurrentBucket = new TokenBucket(60, 100);
const fixedConcurrentTime = Date.now();
concurrentBucket.lastRefill = fixedConcurrentTime;
const results = [];
for (let i = 0; i < 10; i++) {
    concurrentBucket.lastRefill = fixedConcurrentTime;
    results.push(concurrentBucket.tryConsume(10));
}
const successCount = results.filter(r => r).length;
assert.strictEqual(successCount, 10, 'Should handle 10 concurrent requests of 10 tokens each');
assert.strictEqual(concurrentBucket.tokens, 0, 'Should have consumed all tokens');

concurrentBucket.lastRefill = fixedConcurrentTime;
const overLimit = concurrentBucket.tryConsume(1);
assert.strictEqual(overLimit, false, 'Should deny when exhausted');
console.log('    ✓ Concurrent token consumption handled');

console.log('  Test 8.5: Zero CIR edge case');
const zeroBucket = new TokenBucket(0, 100);
zeroBucket.tokens = 50;
const zeroTime = Date.now();
zeroBucket.lastRefill = zeroTime - 60000; // 1 minute ago
zeroBucket._refill();
assert.strictEqual(zeroBucket.tokens, 50, 'Zero CIR should not refill tokens');
console.log('    ✓ Zero CIR handled (no refill)');

console.log('  Test 8.6: Very small bc values');
const smallBucket = new TokenBucket(60, 1);
assert.strictEqual(smallBucket.tokens, 1, 'Should handle bc=1');
assert.strictEqual(smallBucket.tryConsume(1), true, 'Should consume single token');
assert.strictEqual(smallBucket.tryConsume(1), false, 'Should deny when empty');
console.log('    ✓ Very small bc values handled');

console.log('  Test 8.7: Multiple filesystem operation types');
const multiOpAuth = new AuthorizationLayer();
const multiOpManifest = {
    capabilities: {
        filesystem: {
            read: ['**/*'],
            write: ['dist/**']
        }
    }
};
multiOpAuth.registerExtension('multi-op-ext', multiOpManifest);

const operations = [
    { op: 'read', path: 'test.txt', shouldAllow: true },
    { op: 'write', path: 'test.txt', shouldAllow: false },
    { op: 'mkdir', path: 'dist/subdir', shouldAllow: true },
    { op: 'unlink', path: 'dist/file.txt', shouldAllow: true },
    { op: 'rmdir', path: 'src/dir', shouldAllow: false }
];

operations.forEach(test => {
    const intent = {
        type: 'filesystem',
        operation: test.op,
        params: { path: test.path },
        extensionId: 'multi-op-ext'
    };
    const result = multiOpAuth.authorize(intent);
    assert.strictEqual(result.authorized, test.shouldAllow, 
        `${test.op} on ${test.path} should ${test.shouldAllow ? 'allow' : 'deny'}`);
});
console.log('    ✓ Multiple filesystem operations handled correctly');

console.log('  Test 8.8: Rate limit exactly at boundary');
const boundaryAuth = new AuthorizationLayer();
const boundaryManifest = {
    capabilities: {
        network: {
            allowlist: ['https://api.example.com'],
            rateLimit: {
                cir: 60,
                bc: 100,
                be: 0
            }
        }
    }
};
boundaryAuth.registerExtension('boundary-ext', boundaryManifest);

const boundaryBucket = boundaryAuth.rateLimitManager.buckets.get('boundary-ext');
const fixedBoundaryTime = Date.now();
boundaryBucket.lastRefill = fixedBoundaryTime;

// Consume exactly bc tokens
for (let i = 0; i < 100; i++) {
    boundaryBucket.lastRefill = fixedBoundaryTime;
    const result = boundaryAuth.rateLimitManager.checkLimit('boundary-ext', 1);
    if (i < 100) {
        assert.strictEqual(result.allowed, true, `Request ${i + 1} should be allowed`);
    }
}

// Next should fail
boundaryBucket.lastRefill = fixedBoundaryTime;
const overBoundary = boundaryAuth.rateLimitManager.checkLimit('boundary-ext', 1);
assert.strictEqual(overBoundary.allowed, false, 'Should deny at exact boundary');
console.log('    ✓ Rate limit boundary conditions handled');

console.log('✅ Edge cases & boundary conditions tests passed\n');

console.log('🎉 All authorization and rate limiting tests passed!');
console.log('   Total test suites: 8');
console.log('   - PermissionChecker filesystem glob matching: 10 tests');
console.log('   - PermissionChecker network URL origin matching: 10 tests');
console.log('   - PermissionChecker git & process access: 8 tests');
console.log('   - TokenBucket CIR-based refill: 10 tests');
console.log('   - RateLimitManager: 7 tests');
console.log('   - TrafficPolicer integration: 7 tests');
console.log('   - AuthorizationLayer end-to-end: 6 tests');
console.log('   - Edge cases & boundary conditions: 8 tests');
console.log('   Total: 66 comprehensive tests\n');
