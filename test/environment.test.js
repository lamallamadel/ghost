'use strict';

/**
 * Tests for core/environment.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// --- helpers ---

const GHOSTRC_PATH = path.join(os.homedir(), '.ghost', 'config', 'ghostrc.json');

function backupGhostrc() {
    try { return fs.readFileSync(GHOSTRC_PATH, 'utf8'); } catch { return null; }
}

function restoreGhostrc(backup) {
    if (backup === null) {
        try { fs.unlinkSync(GHOSTRC_PATH); } catch {}
    } else {
        fs.mkdirSync(path.dirname(GHOSTRC_PATH), { recursive: true });
        fs.writeFileSync(GHOSTRC_PATH, backup);
    }
}

function writeGhostrc(obj) {
    fs.mkdirSync(path.dirname(GHOSTRC_PATH), { recursive: true });
    fs.writeFileSync(GHOSTRC_PATH, JSON.stringify(obj, null, 2));
}

function freshRequire(mod) {
    // bust require cache so env changes are picked up
    delete require.cache[require.resolve(mod)];
    return require(mod);
}

let passed = 0;
let failed = 0;

function test(name, fn) {
    const backup = backupGhostrc();
    const savedEnv = process.env.GHOST_ENV;
    try {
        delete process.env.GHOST_ENV;
        fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ✗ ${name}`);
        console.error(`    ${err.message}`);
        failed++;
    } finally {
        restoreGhostrc(backup);
        if (savedEnv !== undefined) process.env.GHOST_ENV = savedEnv;
        else delete process.env.GHOST_ENV;
    }
}

// --- tests ---

console.log('\ncore/environment.js');

test('getActiveEnvironment() defaults to local when ghostrc absent', () => {
    try { fs.unlinkSync(GHOSTRC_PATH); } catch {}
    const env = freshRequire('../core/environment.js');
    assert.strictEqual(env.getActiveEnvironment(), 'local');
});

test('getActiveEnvironment() reads from ghostrc.json', () => {
    writeGhostrc({ environment: 'dev' });
    const env = freshRequire('../core/environment.js');
    assert.strictEqual(env.getActiveEnvironment(), 'dev');
});

test('GHOST_ENV env var overrides ghostrc', () => {
    writeGhostrc({ environment: 'local' });
    process.env.GHOST_ENV = 'dev';
    const env = freshRequire('../core/environment.js');
    assert.strictEqual(env.getActiveEnvironment(), 'dev');
});

test('resolveServiceUrl() returns local preset by default', () => {
    try { fs.unlinkSync(GHOSTRC_PATH); } catch {}
    const env = freshRequire('../core/environment.js');
    assert.strictEqual(env.resolveServiceUrl('registryUrl'), 'http://localhost:3000/api');
    assert.strictEqual(env.resolveServiceUrl('marketplaceUrl'), 'http://localhost:3000');
});

test('resolveServiceUrl() returns dev preset when environment=dev', () => {
    writeGhostrc({ environment: 'dev' });
    const env = freshRequire('../core/environment.js');
    assert.strictEqual(env.resolveServiceUrl('registryUrl'), 'http://ghost-registry.dev.local/api');
    assert.strictEqual(env.resolveServiceUrl('marketplaceUrl'), 'http://ghost-deployments.dev.local');
});

test('resolveServiceUrl() analyticsUrl is always localhost', () => {
    writeGhostrc({ environment: 'dev' });
    const env = freshRequire('../core/environment.js');
    assert.strictEqual(env.resolveServiceUrl('analyticsUrl'), 'http://localhost:9876');
});

test('resolveServiceUrl() respects user override in ghostrc', () => {
    writeGhostrc({
        environment: 'dev',
        environments: { dev: { registryUrl: 'http://custom.dev.local/api' } }
    });
    const env = freshRequire('../core/environment.js');
    assert.strictEqual(env.resolveServiceUrl('registryUrl'), 'http://custom.dev.local/api');
    // non-overridden key still uses preset
    assert.strictEqual(env.resolveServiceUrl('marketplaceUrl'), 'http://ghost-deployments.dev.local');
});

test('setActiveEnvironment() writes to ghostrc.json', () => {
    writeGhostrc({});
    const env = freshRequire('../core/environment.js');
    env.setActiveEnvironment('dev');
    const rc = JSON.parse(fs.readFileSync(GHOSTRC_PATH, 'utf8'));
    assert.strictEqual(rc.environment, 'dev');
});

test('setActiveEnvironment() preserves existing ghostrc fields', () => {
    writeGhostrc({ marketplace: { token: 'tok123' } });
    const env = freshRequire('../core/environment.js');
    env.setActiveEnvironment('dev');
    const rc = JSON.parse(fs.readFileSync(GHOSTRC_PATH, 'utf8'));
    assert.strictEqual(rc.environment, 'dev');
    assert.strictEqual(rc.marketplace.token, 'tok123');
});

test('setActiveEnvironment() throws for unknown environment', () => {
    writeGhostrc({});
    const env = freshRequire('../core/environment.js');
    assert.throws(() => env.setActiveEnvironment('staging'), /Unknown environment/);
});

test('listEnvironments() returns all envs with active flag', () => {
    writeGhostrc({ environment: 'dev' });
    const env = freshRequire('../core/environment.js');
    const list = env.listEnvironments();
    const local = list.find(e => e.name === 'local');
    const dev = list.find(e => e.name === 'dev');
    assert.ok(local, 'local env should be listed');
    assert.ok(dev, 'dev env should be listed');
    assert.strictEqual(local.active, false);
    assert.strictEqual(dev.active, true);
    assert.ok(dev.urls.registryUrl.includes('ghost-registry'));
});

test('setEnvUrl() writes override and resolveServiceUrl picks it up', () => {
    writeGhostrc({ environment: 'local' });
    const env = freshRequire('../core/environment.js');
    env.setEnvUrl('local', 'registryUrl', 'http://my-override.local/api');
    // re-require to reset module cache (ghostrc already written, same process)
    const env2 = freshRequire('../core/environment.js');
    assert.strictEqual(env2.resolveServiceUrl('registryUrl'), 'http://my-override.local/api');
});

test('setEnvUrl() throws for unknown key', () => {
    writeGhostrc({});
    const env = freshRequire('../core/environment.js');
    assert.throws(() => env.setEnvUrl('local', 'badKey', 'http://x'), /Unknown URL key/);
});

// --- summary ---

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
