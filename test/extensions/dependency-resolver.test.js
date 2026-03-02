const assert = require('assert');
const ExtensionDependencyResolver = require('../../core/extension-dependency-resolver');

console.log('🧪 Testing Extension Dependency Resolver...\n');

let testCount = 0;
let passCount = 0;
let failCount = 0;

function test(name, fn) {
    testCount++;
    try {
        fn();
        passCount++;
        console.log(`✅ Test ${testCount}: ${name}`);
    } catch (error) {
        failCount++;
        console.error(`❌ Test ${testCount}: ${name}`);
        console.error(`   Error: ${error.message}`);
    }
}

async function runTests() {
    console.log('▶ Basic Registration Tests\n');

    test('should register extension successfully', () => {
        const resolver = new ExtensionDependencyResolver();
        const extension = {
            manifest: {
                id: 'test-ext',
                version: '1.0.0',
                name: 'Test Extension'
            }
        };
        resolver.register(extension);
        assert.strictEqual(resolver.extensions.size, 1);
    });

    test('should throw on duplicate registration', () => {
        const resolver = new ExtensionDependencyResolver();
        const extension = {
            manifest: {
                id: 'test-ext',
                version: '1.0.0',
                name: 'Test Extension'
            }
        };
        resolver.register(extension);
        assert.throws(() => {
            resolver.register(extension);
        }, /already registered/);
    });

    test('should throw on missing manifest', () => {
        const resolver = new ExtensionDependencyResolver();
        const extension = {};
        assert.throws(() => {
            resolver.register(extension);
        }, /must have a manifest/);
    });

    console.log('\n▶ Version Constraint Validation Tests\n');

    test('should satisfy exact version', () => {
        const resolver = new ExtensionDependencyResolver();
        assert.strictEqual(resolver._versionSatisfies('1.0.0', '1.0.0'), true);
        assert.strictEqual(resolver._versionSatisfies('1.0.1', '1.0.0'), false);
    });

    test('should satisfy caret range (^)', () => {
        const resolver = new ExtensionDependencyResolver();
        assert.strictEqual(resolver._versionSatisfies('1.2.3', '^1.0.0'), true);
        assert.strictEqual(resolver._versionSatisfies('1.9.9', '^1.0.0'), true);
        assert.strictEqual(resolver._versionSatisfies('2.0.0', '^1.0.0'), false);
        assert.strictEqual(resolver._versionSatisfies('0.9.9', '^1.0.0'), false);
        assert.strictEqual(resolver._versionSatisfies('0.2.5', '^0.2.3'), true);
        assert.strictEqual(resolver._versionSatisfies('0.3.0', '^0.2.3'), false);
        assert.strictEqual(resolver._versionSatisfies('0.0.3', '^0.0.3'), true);
        assert.strictEqual(resolver._versionSatisfies('0.0.4', '^0.0.3'), false);
    });

    test('should satisfy tilde range (~)', () => {
        const resolver = new ExtensionDependencyResolver();
        assert.strictEqual(resolver._versionSatisfies('1.2.3', '~1.2.0'), true);
        assert.strictEqual(resolver._versionSatisfies('1.2.9', '~1.2.0'), true);
        assert.strictEqual(resolver._versionSatisfies('1.3.0', '~1.2.0'), false);
    });

    test('should satisfy greater than (>)', () => {
        const resolver = new ExtensionDependencyResolver();
        assert.strictEqual(resolver._versionSatisfies('2.0.0', '>1.0.0'), true);
        assert.strictEqual(resolver._versionSatisfies('1.0.1', '>1.0.0'), true);
        assert.strictEqual(resolver._versionSatisfies('1.0.0', '>1.0.0'), false);
    });

    test('should satisfy greater than or equal (>=)', () => {
        const resolver = new ExtensionDependencyResolver();
        assert.strictEqual(resolver._versionSatisfies('2.0.0', '>=1.0.0'), true);
        assert.strictEqual(resolver._versionSatisfies('1.0.0', '>=1.0.0'), true);
        assert.strictEqual(resolver._versionSatisfies('0.9.9', '>=1.0.0'), false);
    });

    test('should satisfy less than (<)', () => {
        const resolver = new ExtensionDependencyResolver();
        assert.strictEqual(resolver._versionSatisfies('0.9.9', '<1.0.0'), true);
        assert.strictEqual(resolver._versionSatisfies('1.0.0', '<1.0.0'), false);
    });

    test('should satisfy less than or equal (<=)', () => {
        const resolver = new ExtensionDependencyResolver();
        assert.strictEqual(resolver._versionSatisfies('0.9.9', '<=1.0.0'), true);
        assert.strictEqual(resolver._versionSatisfies('1.0.0', '<=1.0.0'), true);
        assert.strictEqual(resolver._versionSatisfies('1.0.1', '<=1.0.0'), false);
    });

    test('should satisfy wildcard (*)', () => {
        const resolver = new ExtensionDependencyResolver();
        assert.strictEqual(resolver._versionSatisfies('1.2.3', '*'), true);
        assert.strictEqual(resolver._versionSatisfies('0.0.1', '*'), true);
    });

    test('should satisfy x wildcard patterns', () => {
        const resolver = new ExtensionDependencyResolver();
        assert.strictEqual(resolver._versionSatisfies('1.2.3', '1.x'), true);
        assert.strictEqual(resolver._versionSatisfies('1.9.9', '1.x'), true);
        assert.strictEqual(resolver._versionSatisfies('2.0.0', '1.x'), false);
        assert.strictEqual(resolver._versionSatisfies('1.2.3', '1.2.x'), true);
        assert.strictEqual(resolver._versionSatisfies('1.2.9', '1.2.x'), true);
        assert.strictEqual(resolver._versionSatisfies('1.3.0', '1.2.x'), false);
    });

    test('should satisfy range (1.0.0 - 2.0.0)', () => {
        const resolver = new ExtensionDependencyResolver();
        assert.strictEqual(resolver._versionSatisfies('1.0.0', '1.0.0 - 2.0.0'), true);
        assert.strictEqual(resolver._versionSatisfies('1.5.0', '1.0.0 - 2.0.0'), true);
        assert.strictEqual(resolver._versionSatisfies('2.0.0', '1.0.0 - 2.0.0'), true);
        assert.strictEqual(resolver._versionSatisfies('2.0.1', '1.0.0 - 2.0.0'), false);
        assert.strictEqual(resolver._versionSatisfies('0.9.9', '1.0.0 - 2.0.0'), false);
    });

    console.log('\n▶ Dependency Resolution Tests\n');

    test('should resolve extensions with no dependencies', () => {
        const resolver = new ExtensionDependencyResolver();
        const ext1 = { manifest: { id: 'ext1', version: '1.0.0', name: 'Ext 1' } };
        const ext2 = { manifest: { id: 'ext2', version: '1.0.0', name: 'Ext 2' } };
        resolver.register(ext1);
        resolver.register(ext2);
        const resolved = resolver.resolve();
        assert.strictEqual(resolved.length, 2);
    });

    test('should resolve simple dependency chain (A -> B)', () => {
        const resolver = new ExtensionDependencyResolver();
        const extB = { manifest: { id: 'ext-b', version: '1.0.0', name: 'Ext B' } };
        const extA = {
            manifest: {
                id: 'ext-a',
                version: '1.0.0',
                name: 'Ext A',
                extensionDependencies: { 'ext-b': '^1.0.0' }
            }
        };
        resolver.register(extA);
        resolver.register(extB);
        const resolved = resolver.resolve();
        assert.strictEqual(resolved.length, 2);
        assert.strictEqual(resolved[0].manifest.id, 'ext-b');
        assert.strictEqual(resolved[1].manifest.id, 'ext-a');
    });

    test('should resolve longer chain (A -> B -> C)', () => {
        const resolver = new ExtensionDependencyResolver();
        const extC = { manifest: { id: 'ext-c', version: '1.0.0', name: 'Ext C' } };
        const extB = {
            manifest: {
                id: 'ext-b',
                version: '1.0.0',
                name: 'Ext B',
                extensionDependencies: { 'ext-c': '^1.0.0' }
            }
        };
        const extA = {
            manifest: {
                id: 'ext-a',
                version: '1.0.0',
                name: 'Ext A',
                extensionDependencies: { 'ext-b': '^1.0.0' }
            }
        };
        resolver.register(extA);
        resolver.register(extB);
        resolver.register(extC);
        const resolved = resolver.resolve();
        assert.strictEqual(resolved.length, 3);
        assert.strictEqual(resolved[0].manifest.id, 'ext-c');
        assert.strictEqual(resolved[1].manifest.id, 'ext-b');
        assert.strictEqual(resolved[2].manifest.id, 'ext-a');
    });

    test('should resolve diamond dependency (A->B, A->C, B->C)', () => {
        const resolver = new ExtensionDependencyResolver();
        const extC = { manifest: { id: 'ext-c', version: '1.0.0', name: 'Ext C' } };
        const extB = {
            manifest: {
                id: 'ext-b',
                version: '1.0.0',
                name: 'Ext B',
                extensionDependencies: { 'ext-c': '^1.0.0' }
            }
        };
        const extA = {
            manifest: {
                id: 'ext-a',
                version: '1.0.0',
                name: 'Ext A',
                extensionDependencies: { 'ext-b': '^1.0.0', 'ext-c': '^1.0.0' }
            }
        };
        resolver.register(extA);
        resolver.register(extB);
        resolver.register(extC);
        const resolved = resolver.resolve();
        assert.strictEqual(resolved.length, 3);
        assert.strictEqual(resolved[0].manifest.id, 'ext-c');
        const bIndex = resolved.findIndex(e => e.manifest.id === 'ext-b');
        const aIndex = resolved.findIndex(e => e.manifest.id === 'ext-a');
        assert.ok(bIndex < aIndex);
    });

    console.log('\n▶ Error Detection Tests\n');

    test('should throw on missing dependency', () => {
        const resolver = new ExtensionDependencyResolver();
        const extA = {
            manifest: {
                id: 'ext-a',
                version: '1.0.0',
                name: 'Ext A',
                extensionDependencies: { 'ext-missing': '^1.0.0' }
            }
        };
        resolver.register(extA);
        assert.throws(() => {
            resolver.resolve();
        }, /Dependency resolution failed/);
    });

    test('should throw on version constraint violation', () => {
        const resolver = new ExtensionDependencyResolver();
        const extB = { manifest: { id: 'ext-b', version: '2.0.0', name: 'Ext B' } };
        const extA = {
            manifest: {
                id: 'ext-a',
                version: '1.0.0',
                name: 'Ext A',
                extensionDependencies: { 'ext-b': '^1.0.0' }
            }
        };
        resolver.register(extA);
        resolver.register(extB);
        assert.throws(() => {
            resolver.resolve();
        }, /Version constraint validation failed/);
    });

    test('should detect simple circular dependency (A -> B -> A)', () => {
        const resolver = new ExtensionDependencyResolver();
        const extA = {
            manifest: {
                id: 'ext-a',
                version: '1.0.0',
                name: 'Ext A',
                extensionDependencies: { 'ext-b': '^1.0.0' }
            }
        };
        const extB = {
            manifest: {
                id: 'ext-b',
                version: '1.0.0',
                name: 'Ext B',
                extensionDependencies: { 'ext-a': '^1.0.0' }
            }
        };
        resolver.register(extA);
        resolver.register(extB);
        assert.throws(() => {
            resolver.resolve();
        }, /Circular dependency/);
    });

    test('should detect longer circular dependency (A -> B -> C -> A)', () => {
        const resolver = new ExtensionDependencyResolver();
        const extA = {
            manifest: {
                id: 'ext-a',
                version: '1.0.0',
                name: 'Ext A',
                extensionDependencies: { 'ext-b': '^1.0.0' }
            }
        };
        const extB = {
            manifest: {
                id: 'ext-b',
                version: '1.0.0',
                name: 'Ext B',
                extensionDependencies: { 'ext-c': '^1.0.0' }
            }
        };
        const extC = {
            manifest: {
                id: 'ext-c',
                version: '1.0.0',
                name: 'Ext C',
                extensionDependencies: { 'ext-a': '^1.0.0' }
            }
        };
        resolver.register(extA);
        resolver.register(extB);
        resolver.register(extC);
        assert.throws(() => {
            resolver.resolve();
        }, /Circular dependency/);
    });

    console.log('\n▶ Conflict Detection Tests\n');

    test('should detect command capability conflict', () => {
        const resolver = new ExtensionDependencyResolver();
        const ext1 = {
            manifest: {
                id: 'ext1',
                version: '1.0.0',
                name: 'Ext 1',
                commands: ['test']
            }
        };
        const ext2 = {
            manifest: {
                id: 'ext2',
                version: '1.0.0',
                name: 'Ext 2',
                commands: ['test']
            }
        };
        resolver.register(ext1);
        resolver.register(ext2);
        assert.throws(() => {
            resolver.resolve();
        }, /Capability conflicts detected/);
    });

    test('should detect hook capability conflict', () => {
        const resolver = new ExtensionDependencyResolver();
        const ext1 = {
            manifest: {
                id: 'ext1',
                version: '1.0.0',
                name: 'Ext 1',
                capabilities: { hooks: ['pre-commit'] }
            }
        };
        const ext2 = {
            manifest: {
                id: 'ext2',
                version: '1.0.0',
                name: 'Ext 2',
                capabilities: { hooks: ['pre-commit'] }
            }
        };
        resolver.register(ext1);
        resolver.register(ext2);
        assert.throws(() => {
            resolver.resolve();
        }, /Capability conflicts detected/);
    });

    test('should detect provides capability conflict', () => {
        const resolver = new ExtensionDependencyResolver();
        const ext1 = {
            manifest: {
                id: 'ext1',
                version: '1.0.0',
                name: 'Ext 1',
                provides: ['auth']
            }
        };
        const ext2 = {
            manifest: {
                id: 'ext2',
                version: '1.0.0',
                name: 'Ext 2',
                provides: ['auth']
            }
        };
        resolver.register(ext1);
        resolver.register(ext2);
        assert.throws(() => {
            resolver.resolve();
        }, /Capability conflicts detected/);
    });

    test('should allow different capabilities', () => {
        const resolver = new ExtensionDependencyResolver();
        const ext1 = {
            manifest: {
                id: 'ext1',
                version: '1.0.0',
                name: 'Ext 1',
                commands: ['test1']
            }
        };
        const ext2 = {
            manifest: {
                id: 'ext2',
                version: '1.0.0',
                name: 'Ext 2',
                commands: ['test2']
            }
        };
        resolver.register(ext1);
        resolver.register(ext2);
        const resolved = resolver.resolve();
        assert.strictEqual(resolved.length, 2);
    });

    console.log('\n▶ Dependency Graph API Tests\n');

    test('should return dependency graph', () => {
        const resolver = new ExtensionDependencyResolver();
        const extB = { manifest: { id: 'ext-b', version: '1.0.0', name: 'Ext B' } };
        const extA = {
            manifest: {
                id: 'ext-a',
                version: '1.0.0',
                name: 'Ext A',
                extensionDependencies: { 'ext-b': '^1.0.0' }
            }
        };
        resolver.register(extA);
        resolver.register(extB);
        resolver.resolve();
        const graph = resolver.getDependencyGraph();
        assert.deepStrictEqual(graph['ext-a'], ['ext-b']);
        assert.deepStrictEqual(graph['ext-b'], []);
    });

    test('should return reverse dependency graph', () => {
        const resolver = new ExtensionDependencyResolver();
        const extB = { manifest: { id: 'ext-b', version: '1.0.0', name: 'Ext B' } };
        const extA = {
            manifest: {
                id: 'ext-a',
                version: '1.0.0',
                name: 'Ext A',
                extensionDependencies: { 'ext-b': '^1.0.0' }
            }
        };
        resolver.register(extA);
        resolver.register(extB);
        resolver.resolve();
        const reverseGraph = resolver.getReverseDependencyGraph();
        assert.deepStrictEqual(reverseGraph['ext-b'], ['ext-a']);
        assert.deepStrictEqual(reverseGraph['ext-a'], []);
    });

    console.log('\n▶ Visualization Tests\n');

    test('should generate ASCII visualization', () => {
        const resolver = new ExtensionDependencyResolver();
        const extB = { manifest: { id: 'ext-b', version: '1.0.0', name: 'Ext B' } };
        const extA = {
            manifest: {
                id: 'ext-a',
                version: '1.0.0',
                name: 'Ext A',
                extensionDependencies: { 'ext-b': '^1.0.0' }
            }
        };
        resolver.register(extA);
        resolver.register(extB);
        resolver.resolve();
        const visualization = resolver.visualizeDependencies();
        assert.ok(visualization.includes('ext-a@1.0.0'));
        assert.ok(visualization.includes('ext-b@1.0.0'));
    });

    test('should generate DOT format', () => {
        const resolver = new ExtensionDependencyResolver();
        const extB = { manifest: { id: 'ext-b', version: '1.0.0', name: 'Ext B' } };
        const extA = {
            manifest: {
                id: 'ext-a',
                version: '1.0.0',
                name: 'Ext A',
                extensionDependencies: { 'ext-b': '^1.0.0' }
            }
        };
        resolver.register(extA);
        resolver.register(extB);
        resolver.resolve();
        const dot = resolver.exportToDot();
        assert.ok(dot.includes('digraph ExtensionDependencies'));
        assert.ok(dot.includes('"ext-a" -> "ext-b"'));
    });

    test('should return extension metadata', () => {
        const resolver = new ExtensionDependencyResolver();
        const extB = { manifest: { id: 'ext-b', version: '1.0.0', name: 'Ext B' } };
        const extA = {
            manifest: {
                id: 'ext-a',
                version: '1.0.0',
                name: 'Ext A',
                extensionDependencies: { 'ext-b': '^1.0.0' }
            }
        };
        resolver.register(extA);
        resolver.register(extB);
        resolver.resolve();
        const metadata = resolver.getExtensionMetadata('ext-a');
        assert.strictEqual(metadata.id, 'ext-a');
        assert.strictEqual(metadata.version, '1.0.0');
        assert.strictEqual(metadata.dependencies.length, 1);
        assert.strictEqual(metadata.dependencies[0].id, 'ext-b');
        assert.strictEqual(metadata.loadOrder, 2);
    });

    console.log('\n' + '='.repeat(50));
    console.log(`\n📊 Test Summary: ${passCount}/${testCount} passed, ${failCount} failed\n`);
    
    if (failCount > 0) {
        process.exit(1);
    }
}

runTests().catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
});
