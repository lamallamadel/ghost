#!/usr/bin/env node

const path = require('path');
const Gateway = require('../gateway');

async function demo() {
    console.log('=== Ghost Gateway Demo ===\n');

    console.log('1. Initializing Gateway...');
    const gateway = new Gateway({
        extensionsDir: path.join(__dirname, '../../', '.ghost', 'extensions')
    });

    try {
        const result = await gateway.initialize();
        console.log(`   ✓ Loaded ${result.loaded} extension(s)`);
        console.log(`   Extensions: ${result.extensions.join(', ') || '(none)'}\n`);
    } catch (error) {
        console.error(`   ✗ Initialization failed: ${error.message}\n`);
        return;
    }

    console.log('2. Listing Extensions...');
    const extensions = gateway.listExtensions();
    
    if (extensions.length === 0) {
        console.log('   (No extensions loaded)');
        console.log('\n   To load extensions, create a directory structure like:');
        console.log('   ~/.ghost/extensions/my-extension/');
        console.log('   ├── manifest.json');
        console.log('   └── index.js\n');
    } else {
        extensions.forEach(ext => {
            console.log(`   - ${ext.name} (${ext.id}@${ext.version})`);
            console.log(`     Capabilities: ${Object.keys(ext.capabilities).join(', ')}`);
        });
        console.log('');
    }

    if (extensions.length > 0) {
        console.log('3. Testing Extension Execution...');
        const firstExt = extensions[0];
        
        try {
            const ext = gateway.getExtension(firstExt.id);
            console.log(`   Extension instance: ${ext.instance ? 'Loaded' : 'Not loaded'}`);
            
            if (ext.instance && typeof ext.instance.init === 'function') {
                console.log(`   Calling init method...`);
                await gateway.executeExtension(firstExt.id, 'init', ext.manifest.config);
            }
        } catch (error) {
            console.error(`   ✗ Execution failed: ${error.message}`);
        }
        console.log('');
    }

    console.log('4. Shutting Down Gateway...');
    gateway.shutdown();
    console.log('   ✓ Shutdown complete\n');

    console.log('=== Demo Complete ===');
}

if (require.main === module) {
    demo().catch(console.error);
}

module.exports = { demo };
