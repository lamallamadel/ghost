const assert = require('assert');
const ExtensionLoader = require('../../core/extension-loader');

console.log('🧪 Testing ExtensionLoader Integration with Dependency Resolver...\n');

// Test that ExtensionLoader can be instantiated with dependency resolver
console.log('▶ Test 1: ExtensionLoader instantiation with dependency resolver');
try {
    const loader = new ExtensionLoader('./test-extensions');
    assert.ok(loader.dependencyResolver, 'Dependency resolver should be initialized');
    console.log('✅ ExtensionLoader instantiated with dependency resolver\n');
} catch (error) {
    console.error('❌ Failed:', error.message);
    process.exit(1);
}

// Test that dependency methods exist
console.log('▶ Test 2: Dependency API methods exist');
try {
    const loader = new ExtensionLoader('./test-extensions');
    assert.ok(typeof loader.getDependencyGraph === 'function', 'getDependencyGraph method exists');
    assert.ok(typeof loader.getReverseDependencyGraph === 'function', 'getReverseDependencyGraph method exists');
    assert.ok(typeof loader.getExtensionDependencies === 'function', 'getExtensionDependencies method exists');
    assert.ok(typeof loader.canUnload === 'function', 'canUnload method exists');
    assert.ok(typeof loader.resolveDependencies === 'function', 'resolveDependencies method exists');
    console.log('✅ All dependency API methods exist\n');
} catch (error) {
    console.error('❌ Failed:', error.message);
    process.exit(1);
}

console.log('✅ All integration tests passed!');
