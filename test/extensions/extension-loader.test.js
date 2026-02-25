const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ExtensionLoader = require('../../core/extension-loader');

console.log('🧪 Testing Extension Loader Admission Controller...\n');

// Test fixtures directory
const testExtensionsDir = path.join(os.tmpdir(), 'ghost-test-extension-loader');

// Helper to create test extension directory
function createTestExtension(name, manifest, mainContent = null) {
    const extPath = path.join(testExtensionsDir, name);
    if (!fs.existsSync(extPath)) {
        fs.mkdirSync(extPath, { recursive: true });
    }
    
    if (manifest !== null) {
        fs.writeFileSync(
            path.join(extPath, 'manifest.json'),
            typeof manifest === 'string' ? manifest : JSON.stringify(manifest, null, 2)
        );
    }
    
    if (mainContent !== null) {
        const mainFile = (manifest && typeof manifest === 'object' && manifest.main) ? manifest.main : 'index.js';
        fs.writeFileSync(path.join(extPath, mainFile), mainContent);
    }
    
    return extPath;
}

// Helper to clean up test directory
function cleanupTests() {
    if (fs.existsSync(testExtensionsDir)) {
        fs.rmSync(testExtensionsDir, { recursive: true, force: true });
    }
}

async function runTests() {
    // Setup
    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // ===== VALID MANIFEST TESTS =====

    // Test 1: Load valid extension with minimal manifest
    console.log('▶ Test 1: Load valid extension with minimal manifest');
    const validManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {}
    };
    createTestExtension('valid-ext', validManifest, 'module.exports = {};');
    
    const loader1 = new ExtensionLoader(testExtensionsDir);
    const extensions1 = await loader1.discoverAndLoad();
    assert.strictEqual(extensions1.length, 1, 'Should load valid extension');
    assert.strictEqual(extensions1[0].manifest.id, 'test-extension', 'Should have correct ID');
    console.log('✅ Valid extension loaded successfully\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 2: Load extension with full manifest schema
    console.log('▶ Test 2: Load extension with complete manifest');
    const fullManifest = {
        id: 'full-extension',
        name: 'Full Extension',
        version: '2.1.5',
        description: 'Full featured extension',
        author: 'Test Author',
        main: 'lib/main.js',
        capabilities: {
            filesystem: {
                read: ['**/*.js'],
                write: ['dist/**']
            },
            network: {
                allowlist: ['https://api.example.com'],
                rateLimit: {
                    cir: 60,
                    bc: 100,
                    be: 50
                }
            },
            git: {
                read: true,
                write: false
            },
            hooks: ['pre-commit', 'post-commit']
        },
        permissions: ['filesystem:read', 'git:read'],
        dependencies: {
            'lodash': '^4.17.21'
        },
        config: {
            apiKey: 'default-key'
        }
    };
    
    const extPath2 = createTestExtension('full-ext', fullManifest, null);
    fs.mkdirSync(path.join(extPath2, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(extPath2, 'lib', 'main.js'), 'module.exports = {};');
    
    const loader2 = new ExtensionLoader(testExtensionsDir);
    const extensions2 = await loader2.discoverAndLoad();
    assert.strictEqual(extensions2.length, 1, 'Should load full manifest extension');
    assert.strictEqual(extensions2[0].manifest.version, '2.1.5', 'Should preserve version');
    assert.ok(extensions2[0].manifest.capabilities.network, 'Should have network capabilities');
    console.log('✅ Extension with complete manifest loaded\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // ===== MISSING REQUIRED FIELDS TESTS =====

    // Test 3: Reject manifest missing id field
    console.log('▶ Test 3: Reject manifest missing "id" field');
    const noIdManifest = {
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {}
    };
    createTestExtension('no-id-ext', noIdManifest, 'module.exports = {};');
    
    const loader3 = new ExtensionLoader(testExtensionsDir);
    const extensions3 = await loader3.discoverAndLoad();
    assert.strictEqual(extensions3.length, 0, 'Should not load extension without id');
    console.log('✅ Manifest without id rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 4: Reject manifest missing name field
    console.log('▶ Test 4: Reject manifest missing "name" field');
    const noNameManifest = {
        id: 'test-extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {}
    };
    createTestExtension('no-name-ext', noNameManifest, 'module.exports = {};');
    
    const loader4 = new ExtensionLoader(testExtensionsDir);
    const extensions4 = await loader4.discoverAndLoad();
    assert.strictEqual(extensions4.length, 0, 'Should not load extension without name');
    console.log('✅ Manifest without name rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 5: Reject manifest missing version field
    console.log('▶ Test 5: Reject manifest missing "version" field');
    const noVersionManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        main: 'index.js',
        capabilities: {}
    };
    createTestExtension('no-version-ext', noVersionManifest, 'module.exports = {};');
    
    const loader5 = new ExtensionLoader(testExtensionsDir);
    const extensions5 = await loader5.discoverAndLoad();
    assert.strictEqual(extensions5.length, 0, 'Should not load extension without version');
    console.log('✅ Manifest without version rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 6: Reject manifest missing main field
    console.log('▶ Test 6: Reject manifest missing "main" field');
    const noMainManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        capabilities: {}
    };
    createTestExtension('no-main-ext', noMainManifest, 'module.exports = {};');
    
    const loader6 = new ExtensionLoader(testExtensionsDir);
    const extensions6 = await loader6.discoverAndLoad();
    assert.strictEqual(extensions6.length, 0, 'Should not load extension without main');
    console.log('✅ Manifest without main rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 7: Reject manifest missing capabilities field
    console.log('▶ Test 7: Reject manifest missing "capabilities" field');
    const noCapabilitiesManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js'
    };
    createTestExtension('no-capabilities-ext', noCapabilitiesManifest, 'module.exports = {};');
    
    const loader7 = new ExtensionLoader(testExtensionsDir);
    const extensions7 = await loader7.discoverAndLoad();
    assert.strictEqual(extensions7.length, 0, 'Should not load extension without capabilities');
    console.log('✅ Manifest without capabilities rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // ===== INVALID FIELD TYPE TESTS =====

    // Test 8: Reject manifest with non-string id
    console.log('▶ Test 8: Reject manifest with non-string id');
    const nonStringIdManifest = {
        id: 123,
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {}
    };
    createTestExtension('non-string-id-ext', nonStringIdManifest, 'module.exports = {};');
    
    const loader8 = new ExtensionLoader(testExtensionsDir);
    const extensions8 = await loader8.discoverAndLoad();
    assert.strictEqual(extensions8.length, 0, 'Should reject non-string id');
    console.log('✅ Non-string id rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 9: Reject manifest with non-string name
    console.log('▶ Test 9: Reject manifest with non-string name');
    const nonStringNameManifest = {
        id: 'test-extension',
        name: ['Test', 'Extension'],
        version: '1.0.0',
        main: 'index.js',
        capabilities: {}
    };
    createTestExtension('non-string-name-ext', nonStringNameManifest, 'module.exports = {};');
    
    const loader9 = new ExtensionLoader(testExtensionsDir);
    const extensions9 = await loader9.discoverAndLoad();
    assert.strictEqual(extensions9.length, 0, 'Should reject non-string name');
    console.log('✅ Non-string name rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 10: Reject manifest with non-object capabilities (string)
    console.log('▶ Test 10: Reject manifest with non-object capabilities (string)');
    const nonObjectCapabilitiesManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: 'all'
    };
    createTestExtension('non-object-capabilities-ext', nonObjectCapabilitiesManifest, 'module.exports = {};');
    
    const loader10 = new ExtensionLoader(testExtensionsDir);
    const extensions10 = await loader10.discoverAndLoad();
    assert.strictEqual(extensions10.length, 0, 'Should reject non-object capabilities');
    console.log('✅ Non-object capabilities (string) rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 10a: Reject manifest with null capabilities
    console.log('▶ Test 10a: Reject manifest with null capabilities');
    const nullCapabilitiesManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: null
    };
    createTestExtension('null-capabilities-ext', nullCapabilitiesManifest, 'module.exports = {};');
    
    const loader10a = new ExtensionLoader(testExtensionsDir);
    const extensions10a = await loader10a.discoverAndLoad();
    assert.strictEqual(extensions10a.length, 0, 'Should reject null capabilities');
    console.log('✅ Null capabilities rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 10b: Reject manifest with array capabilities
    console.log('▶ Test 10b: Reject manifest with array capabilities');
    const arrayCapabilitiesManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: []
    };
    createTestExtension('array-capabilities-ext', arrayCapabilitiesManifest, 'module.exports = {};');
    
    const loader10b = new ExtensionLoader(testExtensionsDir);
    const extensions10b = await loader10b.discoverAndLoad();
    assert.strictEqual(extensions10b.length, 0, 'Should reject array capabilities');
    console.log('✅ Array capabilities rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // ===== INVALID FIELD FORMAT TESTS =====

    // Test 11: Reject manifest with invalid id format (uppercase)
    console.log('▶ Test 11: Reject manifest with invalid id format (uppercase)');
    const uppercaseIdManifest = {
        id: 'Test-Extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {}
    };
    createTestExtension('uppercase-id-ext', uppercaseIdManifest, 'module.exports = {};');
    
    const loader11 = new ExtensionLoader(testExtensionsDir);
    const extensions11 = await loader11.discoverAndLoad();
    assert.strictEqual(extensions11.length, 0, 'Should reject uppercase in id');
    console.log('✅ Invalid id format (uppercase) rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 12: Reject manifest with invalid id format (special chars)
    console.log('▶ Test 12: Reject manifest with invalid id format (special chars)');
    const specialCharsIdManifest = {
        id: 'test_extension!',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {}
    };
    createTestExtension('special-chars-id-ext', specialCharsIdManifest, 'module.exports = {};');
    
    const loader12 = new ExtensionLoader(testExtensionsDir);
    const extensions12 = await loader12.discoverAndLoad();
    assert.strictEqual(extensions12.length, 0, 'Should reject special chars in id');
    console.log('✅ Invalid id format (special chars) rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 13: Reject manifest with invalid version format
    console.log('▶ Test 13: Reject manifest with invalid version format');
    const invalidVersionManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0',
        main: 'index.js',
        capabilities: {}
    };
    createTestExtension('invalid-version-ext', invalidVersionManifest, 'module.exports = {};');
    
    const loader13 = new ExtensionLoader(testExtensionsDir);
    const extensions13 = await loader13.discoverAndLoad();
    assert.strictEqual(extensions13.length, 0, 'Should reject invalid semver');
    console.log('✅ Invalid version format rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 14: Reject manifest with version containing non-numeric parts
    console.log('▶ Test 14: Reject manifest with non-numeric version');
    const nonNumericVersionManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.2.x',
        main: 'index.js',
        capabilities: {}
    };
    createTestExtension('non-numeric-version-ext', nonNumericVersionManifest, 'module.exports = {};');
    
    const loader14 = new ExtensionLoader(testExtensionsDir);
    const extensions14 = await loader14.discoverAndLoad();
    assert.strictEqual(extensions14.length, 0, 'Should reject non-numeric version parts');
    console.log('✅ Non-numeric version rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // ===== MAIN FILE VALIDATION TESTS =====

    // Test 15: Reject extension when main file does not exist
    console.log('▶ Test 15: Reject extension when main file does not exist');
    const missingMainManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'nonexistent.js',
        capabilities: {}
    };
    createTestExtension('missing-main-ext', missingMainManifest, null); // Don't create main file
    
    const loader15 = new ExtensionLoader(testExtensionsDir);
    const extensions15 = await loader15.discoverAndLoad();
    assert.strictEqual(extensions15.length, 0, 'Should reject when main file missing');
    console.log('✅ Missing main file rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 16: Load extension with main file in subdirectory
    console.log('▶ Test 16: Load extension with main file in subdirectory');
    const subdirMainManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'src/lib/index.js',
        capabilities: {}
    };
    const extPath16 = createTestExtension('subdir-main-ext', subdirMainManifest, null);
    fs.mkdirSync(path.join(extPath16, 'src', 'lib'), { recursive: true });
    fs.writeFileSync(path.join(extPath16, 'src', 'lib', 'index.js'), 'module.exports = {};');
    
    const loader16 = new ExtensionLoader(testExtensionsDir);
    const extensions16 = await loader16.discoverAndLoad();
    assert.strictEqual(extensions16.length, 1, 'Should load extension with nested main file');
    console.log('✅ Extension with nested main file loaded\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // ===== CAPABILITY VALIDATION TESTS =====

    // Test 17: Reject filesystem capability with non-array read
    console.log('▶ Test 17: Reject filesystem capability with non-array read');
    const nonArrayReadManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {
            filesystem: {
                read: '**/*.js'
            }
        }
    };
    createTestExtension('non-array-read-ext', nonArrayReadManifest, 'module.exports = {};');
    
    const loader17 = new ExtensionLoader(testExtensionsDir);
    const extensions17 = await loader17.discoverAndLoad();
    assert.strictEqual(extensions17.length, 0, 'Should reject non-array filesystem.read');
    console.log('✅ Non-array filesystem.read rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 18: Reject filesystem capability with non-array write
    console.log('▶ Test 18: Reject filesystem capability with non-array write');
    const nonArrayWriteManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {
            filesystem: {
                write: 'dist/**'
            }
        }
    };
    createTestExtension('non-array-write-ext', nonArrayWriteManifest, 'module.exports = {};');
    
    const loader18 = new ExtensionLoader(testExtensionsDir);
    const extensions18 = await loader18.discoverAndLoad();
    assert.strictEqual(extensions18.length, 0, 'Should reject non-array filesystem.write');
    console.log('✅ Non-array filesystem.write rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 19: Reject network capability with non-array allowlist
    console.log('▶ Test 19: Reject network capability with non-array allowlist');
    const nonArrayAllowlistManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {
            network: {
                allowlist: 'https://api.example.com'
            }
        }
    };
    createTestExtension('non-array-allowlist-ext', nonArrayAllowlistManifest, 'module.exports = {};');
    
    const loader19 = new ExtensionLoader(testExtensionsDir);
    const extensions19 = await loader19.discoverAndLoad();
    assert.strictEqual(extensions19.length, 0, 'Should reject non-array network.allowlist');
    console.log('✅ Non-array network.allowlist rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 20: Reject network allowlist with invalid URL format (with path)
    console.log('▶ Test 20: Reject network allowlist with invalid URL format (with path)');
    const urlWithPathManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {
            network: {
                allowlist: ['https://api.example.com/v1/endpoint']
            }
        }
    };
    createTestExtension('url-with-path-ext', urlWithPathManifest, 'module.exports = {};');
    
    const loader20 = new ExtensionLoader(testExtensionsDir);
    const extensions20 = await loader20.discoverAndLoad();
    assert.strictEqual(extensions20.length, 0, 'Should reject URL with path in allowlist');
    console.log('✅ URL with path in allowlist rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 21: Reject network allowlist with invalid URL format (no protocol)
    console.log('▶ Test 21: Reject network allowlist with invalid URL format (no protocol)');
    const noProtocolUrlManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {
            network: {
                allowlist: ['api.example.com']
            }
        }
    };
    createTestExtension('no-protocol-url-ext', noProtocolUrlManifest, 'module.exports = {};');
    
    const loader21 = new ExtensionLoader(testExtensionsDir);
    const extensions21 = await loader21.discoverAndLoad();
    assert.strictEqual(extensions21.length, 0, 'Should reject URL without protocol');
    console.log('✅ URL without protocol rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 22: Reject network rateLimit with non-positive cir
    console.log('▶ Test 22: Reject network rateLimit with non-positive cir');
    const invalidCirManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {
            network: {
                allowlist: ['https://api.example.com'],
                rateLimit: {
                    cir: 0,
                    bc: 100
                }
            }
        }
    };
    createTestExtension('invalid-cir-ext', invalidCirManifest, 'module.exports = {};');
    
    const loader22 = new ExtensionLoader(testExtensionsDir);
    const extensions22 = await loader22.discoverAndLoad();
    assert.strictEqual(extensions22.length, 0, 'Should reject non-positive cir');
    console.log('✅ Non-positive cir rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 23: Reject network rateLimit with non-positive bc
    console.log('▶ Test 23: Reject network rateLimit with non-positive bc');
    const invalidBcManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {
            network: {
                allowlist: ['https://api.example.com'],
                rateLimit: {
                    cir: 60,
                    bc: -10
                }
            }
        }
    };
    createTestExtension('invalid-bc-ext', invalidBcManifest, 'module.exports = {};');
    
    const loader23 = new ExtensionLoader(testExtensionsDir);
    const extensions23 = await loader23.discoverAndLoad();
    assert.strictEqual(extensions23.length, 0, 'Should reject non-positive bc');
    console.log('✅ Non-positive bc rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 24: Reject network rateLimit with negative be
    console.log('▶ Test 24: Reject network rateLimit with negative be');
    const negativeBeManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {
            network: {
                allowlist: ['https://api.example.com'],
                rateLimit: {
                    cir: 60,
                    bc: 100,
                    be: -5
                }
            }
        }
    };
    createTestExtension('negative-be-ext', negativeBeManifest, 'module.exports = {};');
    
    const loader24 = new ExtensionLoader(testExtensionsDir);
    const extensions24 = await loader24.discoverAndLoad();
    assert.strictEqual(extensions24.length, 0, 'Should reject negative be');
    console.log('✅ Negative be rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 25: Accept network rateLimit with be = 0
    console.log('▶ Test 25: Accept network rateLimit with be = 0');
    const zeroBeManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
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
    createTestExtension('zero-be-ext', zeroBeManifest, 'module.exports = {};');
    
    const loader25 = new ExtensionLoader(testExtensionsDir);
    const extensions25 = await loader25.discoverAndLoad();
    assert.strictEqual(extensions25.length, 1, 'Should accept be = 0');
    console.log('✅ Zero be accepted\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 26: Reject git capability with non-boolean read
    console.log('▶ Test 26: Reject git capability with non-boolean read');
    const nonBooleanGitReadManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {
            git: {
                read: 'yes'
            }
        }
    };
    createTestExtension('non-boolean-git-read-ext', nonBooleanGitReadManifest, 'module.exports = {};');
    
    const loader26 = new ExtensionLoader(testExtensionsDir);
    const extensions26 = await loader26.discoverAndLoad();
    assert.strictEqual(extensions26.length, 0, 'Should reject non-boolean git.read');
    console.log('✅ Non-boolean git.read rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 27: Reject git capability with non-boolean write
    console.log('▶ Test 27: Reject git capability with non-boolean write');
    const nonBooleanGitWriteManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {
            git: {
                write: 1
            }
        }
    };
    createTestExtension('non-boolean-git-write-ext', nonBooleanGitWriteManifest, 'module.exports = {};');
    
    const loader27 = new ExtensionLoader(testExtensionsDir);
    const extensions27 = await loader27.discoverAndLoad();
    assert.strictEqual(extensions27.length, 0, 'Should reject non-boolean git.write');
    console.log('✅ Non-boolean git.write rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 28: Reject hooks capability with non-array value
    console.log('▶ Test 28: Reject hooks capability with non-array value');
    const nonArrayHooksManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {
            hooks: 'pre-commit'
        }
    };
    createTestExtension('non-array-hooks-ext', nonArrayHooksManifest, 'module.exports = {};');
    
    const loader28 = new ExtensionLoader(testExtensionsDir);
    const extensions28 = await loader28.discoverAndLoad();
    assert.strictEqual(extensions28.length, 0, 'Should reject non-array hooks');
    console.log('✅ Non-array hooks rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 29: Reject hooks capability with invalid hook name
    console.log('▶ Test 29: Reject hooks capability with invalid hook name');
    const invalidHookManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {
            hooks: ['pre-commit', 'invalid-hook']
        }
    };
    createTestExtension('invalid-hook-ext', invalidHookManifest, 'module.exports = {};');
    
    const loader29 = new ExtensionLoader(testExtensionsDir);
    const extensions29 = await loader29.discoverAndLoad();
    assert.strictEqual(extensions29.length, 0, 'Should reject invalid hook name');
    console.log('✅ Invalid hook name rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 30: Accept all valid hook names
    console.log('▶ Test 30: Accept all valid hook names');
    const allValidHooksManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {
            hooks: ['pre-commit', 'post-commit', 'pre-push', 'post-checkout', 'commit-msg', 'pre-rebase']
        }
    };
    createTestExtension('all-valid-hooks-ext', allValidHooksManifest, 'module.exports = {};');
    
    const loader30 = new ExtensionLoader(testExtensionsDir);
    const extensions30 = await loader30.discoverAndLoad();
    assert.strictEqual(extensions30.length, 1, 'Should accept all valid hooks');
    assert.strictEqual(extensions30[0].manifest.capabilities.hooks.length, 6, 'Should have all 6 hooks');
    console.log('✅ All valid hook names accepted\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // ===== MALFORMED JSON TESTS =====

    // Test 31: Reject manifest with invalid JSON syntax
    console.log('▶ Test 31: Reject manifest with invalid JSON syntax');
    createTestExtension('malformed-json-ext', '{ invalid json }', 'module.exports = {};');
    
    const loader31 = new ExtensionLoader(testExtensionsDir);
    const extensions31 = await loader31.discoverAndLoad();
    assert.strictEqual(extensions31.length, 0, 'Should reject malformed JSON');
    console.log('✅ Malformed JSON rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 32: Reject manifest with trailing comma
    console.log('▶ Test 32: Reject manifest with trailing comma');
    const trailingCommaJson = `{
        "id": "test-extension",
        "name": "Test Extension",
        "version": "1.0.0",
        "main": "index.js",
        "capabilities": {},
    }`;
    createTestExtension('trailing-comma-ext', trailingCommaJson, 'module.exports = {};');
    
    const loader32 = new ExtensionLoader(testExtensionsDir);
    const extensions32 = await loader32.discoverAndLoad();
    assert.strictEqual(extensions32.length, 0, 'Should reject trailing comma JSON');
    console.log('✅ Trailing comma JSON rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // ===== MULTIPLE EXTENSIONS TEST =====

    // Test 33: Load multiple valid extensions, skip invalid ones
    console.log('▶ Test 33: Load multiple extensions with mixed validity');
    
    const valid1 = {
        id: 'valid-ext-1',
        name: 'Valid Extension 1',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {}
    };
    createTestExtension('valid-1', valid1, 'module.exports = {};');
    
    const valid2 = {
        id: 'valid-ext-2',
        name: 'Valid Extension 2',
        version: '2.0.0',
        main: 'index.js',
        capabilities: {}
    };
    createTestExtension('valid-2', valid2, 'module.exports = {};');
    
    const invalid = {
        id: 'invalid-ext',
        name: 'Invalid Extension',
        // missing version
        main: 'index.js',
        capabilities: {}
    };
    createTestExtension('invalid', invalid, 'module.exports = {};');
    
    const loader33 = new ExtensionLoader(testExtensionsDir);
    const extensions33 = await loader33.discoverAndLoad();
    assert.strictEqual(extensions33.length, 2, 'Should load 2 valid extensions');
    assert.ok(extensions33.some(e => e.manifest.id === 'valid-ext-1'), 'Should have valid-ext-1');
    assert.ok(extensions33.some(e => e.manifest.id === 'valid-ext-2'), 'Should have valid-ext-2');
    assert.ok(!extensions33.some(e => e.manifest.id === 'invalid-ext'), 'Should not have invalid-ext');
    console.log('✅ Multiple extensions loaded correctly\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // ===== EDGE CASES =====

    // Test 34: Skip directory without manifest.json
    console.log('▶ Test 34: Skip directory without manifest.json');
    const noManifestDir = path.join(testExtensionsDir, 'no-manifest-ext');
    fs.mkdirSync(noManifestDir, { recursive: true });
    fs.writeFileSync(path.join(noManifestDir, 'index.js'), 'module.exports = {};');
    
    const loader34 = new ExtensionLoader(testExtensionsDir);
    const extensions34 = await loader34.discoverAndLoad();
    assert.strictEqual(extensions34.length, 0, 'Should skip directory without manifest');
    console.log('✅ Directory without manifest skipped\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 35: Skip non-directory entries in extensions directory
    console.log('▶ Test 35: Skip non-directory entries');
    fs.writeFileSync(path.join(testExtensionsDir, 'readme.txt'), 'Not an extension');
    const validManifest35 = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {}
    };
    createTestExtension('valid-ext', validManifest35, 'module.exports = {};');
    
    const loader35 = new ExtensionLoader(testExtensionsDir);
    const extensions35 = await loader35.discoverAndLoad();
    assert.strictEqual(extensions35.length, 1, 'Should only load directory-based extension');
    console.log('✅ Non-directory entries skipped\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 36: Handle extensions directory that doesn't exist
    console.log('▶ Test 36: Handle non-existent extensions directory');
    cleanupTests();
    
    const loader36 = new ExtensionLoader(testExtensionsDir);
    const extensions36 = await loader36.discoverAndLoad();
    assert.strictEqual(extensions36.length, 0, 'Should return empty array for non-existent dir');
    assert.ok(fs.existsSync(testExtensionsDir), 'Should create extensions directory');
    console.log('✅ Non-existent directory handled gracefully\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 37: Extension instantiation failure doesn't block loading
    console.log('▶ Test 37: Extension instantiation failure handled gracefully');
    const validManifest37 = {
        id: 'crash-on-load',
        name: 'Crash Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {}
    };
    createTestExtension('crash-ext', validManifest37, 'throw new Error("Crash on load");');
    
    const loader37 = new ExtensionLoader(testExtensionsDir);
    const extensions37 = await loader37.discoverAndLoad();
    assert.strictEqual(extensions37.length, 1, 'Should load extension metadata even if instantiation fails');
    assert.strictEqual(extensions37[0].instance, null, 'Instance should be null on instantiation failure');
    console.log('✅ Instantiation failure handled gracefully\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 38: getLoadedExtensions returns correct metadata
    console.log('▶ Test 38: getLoadedExtensions returns correct metadata');
    const manifest38 = {
        id: 'metadata-test',
        name: 'Metadata Test Extension',
        version: '3.2.1',
        main: 'index.js',
        capabilities: {}
    };
    createTestExtension('metadata-ext', manifest38, 'module.exports = {};');
    
    const loader38 = new ExtensionLoader(testExtensionsDir);
    await loader38.discoverAndLoad();
    const metadata = loader38.getLoadedExtensions();
    assert.strictEqual(metadata.length, 1, 'Should have metadata for one extension');
    assert.strictEqual(metadata[0].id, 'metadata-test', 'Metadata should have correct id');
    assert.strictEqual(metadata[0].name, 'Metadata Test Extension', 'Metadata should have correct name');
    assert.strictEqual(metadata[0].version, '3.2.1', 'Metadata should have correct version');
    assert.ok(metadata[0].loaded, 'Metadata should have loaded timestamp');
    console.log('✅ getLoadedExtensions returns correct metadata\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 39: unload extension works correctly
    console.log('▶ Test 39: Unload extension removes it from loaded list');
    const manifest39 = {
        id: 'unload-test',
        name: 'Unload Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {}
    };
    createTestExtension('unload-ext', manifest39, 'module.exports = { cleanup: () => {} };');
    
    const loader39 = new ExtensionLoader(testExtensionsDir);
    await loader39.discoverAndLoad();
    assert.strictEqual(loader39.getLoadedExtensions().length, 1, 'Should have one loaded extension');
    
    const unloaded = loader39.unload('unload-test');
    assert.strictEqual(unloaded, true, 'Should return true on successful unload');
    assert.strictEqual(loader39.getLoadedExtensions().length, 0, 'Should have zero loaded extensions');
    
    const unloadedAgain = loader39.unload('unload-test');
    assert.strictEqual(unloadedAgain, false, 'Should return false when extension not found');
    console.log('✅ Unload extension works correctly\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 40: Validation error messages are descriptive
    console.log('▶ Test 40: Validation error messages are descriptive');
    const multiErrorManifest = {
        id: 'Invalid_ID',  // Invalid format
        name: 123,  // Wrong type
        version: '1.x.0',  // Invalid format
        main: 'index.js',
        capabilities: {
            git: {
                read: 'yes',  // Wrong type
                write: 'no'   // Wrong type
            }
        }
    };
    createTestExtension('multi-error-ext', multiErrorManifest, 'module.exports = {};');
    
    const loader40 = new ExtensionLoader(testExtensionsDir);
    
    // Capture console.error output to verify error logging
    let errorLogged = false;
    const originalError = console.error;
    console.error = (...args) => {
        errorLogged = true;
        const message = args.join(' ');
        assert.ok(message.includes('Failed to load'), 'Error should mention failure');
        assert.ok(message.includes('multi-error-ext'), 'Error should mention extension name');
    };
    
    await loader40.discoverAndLoad();
    console.error = originalError;
    
    assert.strictEqual(errorLogged, true, 'Should log detailed error');
    console.log('✅ Validation errors are logged descriptively\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 41: Reject manifest with empty string id
    console.log('▶ Test 41: Reject manifest with empty string id');
    const emptyIdManifest = {
        id: '',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {}
    };
    createTestExtension('empty-id-ext', emptyIdManifest, 'module.exports = {};');
    
    const loader41 = new ExtensionLoader(testExtensionsDir);
    const extensions41 = await loader41.discoverAndLoad();
    assert.strictEqual(extensions41.length, 0, 'Should reject empty string id');
    console.log('✅ Empty string id rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 42: Reject manifest with empty string name
    console.log('▶ Test 42: Reject manifest with empty string name');
    const emptyNameManifest = {
        id: 'test-extension',
        name: '',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {}
    };
    createTestExtension('empty-name-ext', emptyNameManifest, 'module.exports = {};');
    
    const loader42 = new ExtensionLoader(testExtensionsDir);
    const extensions42 = await loader42.discoverAndLoad();
    assert.strictEqual(extensions42.length, 0, 'Should reject empty string name');
    console.log('✅ Empty string name rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 43: Reject manifest with empty string version
    console.log('▶ Test 43: Reject manifest with empty string version');
    const emptyVersionManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '',
        main: 'index.js',
        capabilities: {}
    };
    createTestExtension('empty-version-ext', emptyVersionManifest, 'module.exports = {};');
    
    const loader43 = new ExtensionLoader(testExtensionsDir);
    const extensions43 = await loader43.discoverAndLoad();
    assert.strictEqual(extensions43.length, 0, 'Should reject empty string version');
    console.log('✅ Empty string version rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 44: Reject manifest with empty string main
    console.log('▶ Test 44: Reject manifest with empty string main');
    const emptyMainManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: '',
        capabilities: {}
    };
    createTestExtension('empty-main-ext', emptyMainManifest, 'module.exports = {};');
    
    const loader44 = new ExtensionLoader(testExtensionsDir);
    const extensions44 = await loader44.discoverAndLoad();
    assert.strictEqual(extensions44.length, 0, 'Should reject empty string main');
    console.log('✅ Empty string main rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 45: Accept valid network rateLimit with only required fields
    console.log('▶ Test 45: Accept valid network rateLimit with only required fields');
    const minimalRateLimitManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {
            network: {
                allowlist: ['https://api.example.com'],
                rateLimit: {
                    cir: 60,
                    bc: 100
                }
            }
        }
    };
    createTestExtension('minimal-rate-limit-ext', minimalRateLimitManifest, 'module.exports = {};');
    
    const loader45 = new ExtensionLoader(testExtensionsDir);
    const extensions45 = await loader45.discoverAndLoad();
    assert.strictEqual(extensions45.length, 1, 'Should accept minimal rateLimit');
    console.log('✅ Minimal rateLimit accepted\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 46: Reject network rateLimit with string cir
    console.log('▶ Test 46: Reject network rateLimit with string cir');
    const stringCirManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {
            network: {
                allowlist: ['https://api.example.com'],
                rateLimit: {
                    cir: '60',
                    bc: 100
                }
            }
        }
    };
    createTestExtension('string-cir-ext', stringCirManifest, 'module.exports = {};');
    
    const loader46 = new ExtensionLoader(testExtensionsDir);
    const extensions46 = await loader46.discoverAndLoad();
    assert.strictEqual(extensions46.length, 0, 'Should reject string cir');
    console.log('✅ String cir rejected\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 47: Accept valid localhost URL
    console.log('▶ Test 47: Accept valid localhost URL');
    const localhostManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {
            network: {
                allowlist: ['http://localhost:3000']
            }
        }
    };
    createTestExtension('localhost-ext', localhostManifest, 'module.exports = {};');
    
    const loader47 = new ExtensionLoader(testExtensionsDir);
    const extensions47 = await loader47.discoverAndLoad();
    assert.strictEqual(extensions47.length, 1, 'Should accept localhost URL');
    console.log('✅ Localhost URL accepted\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 48: Accept valid git capabilities with undefined values
    console.log('▶ Test 48: Accept git capabilities with only read defined');
    const gitReadOnlyManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {
            git: {
                read: true
            }
        }
    };
    createTestExtension('git-read-only-ext', gitReadOnlyManifest, 'module.exports = {};');
    
    const loader48 = new ExtensionLoader(testExtensionsDir);
    const extensions48 = await loader48.discoverAndLoad();
    assert.strictEqual(extensions48.length, 1, 'Should accept git with only read defined');
    console.log('✅ Git with only read defined accepted\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 49: Accept empty hooks array
    console.log('▶ Test 49: Accept empty hooks array');
    const emptyHooksManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {
            hooks: []
        }
    };
    createTestExtension('empty-hooks-ext', emptyHooksManifest, 'module.exports = {};');
    
    const loader49 = new ExtensionLoader(testExtensionsDir);
    const extensions49 = await loader49.discoverAndLoad();
    assert.strictEqual(extensions49.length, 1, 'Should accept empty hooks array');
    console.log('✅ Empty hooks array accepted\n');

    cleanupTests();
    fs.mkdirSync(testExtensionsDir, { recursive: true });

    // Test 50: Accept empty filesystem read/write arrays
    console.log('▶ Test 50: Accept empty filesystem read/write arrays');
    const emptyFsManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {
            filesystem: {
                read: [],
                write: []
            }
        }
    };
    createTestExtension('empty-fs-ext', emptyFsManifest, 'module.exports = {};');
    
    const loader50 = new ExtensionLoader(testExtensionsDir);
    const extensions50 = await loader50.discoverAndLoad();
    assert.strictEqual(extensions50.length, 1, 'Should accept empty filesystem arrays');
    console.log('✅ Empty filesystem arrays accepted\n');

    // Cleanup
    cleanupTests();

    console.log('🎉 All Extension Loader tests passed!');
}

runTests().then(() => {
    process.exit(0);
}).catch((error) => {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
});
