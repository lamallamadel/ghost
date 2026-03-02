const path = require('path');
const { RegistryDatabase } = require('../db/database');
const { ExtensionRegistry } = require('../api/registry');
const { SecurityScanner } = require('../security-scanner/scanner');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'registry.db');

async function scanAllExtensions() {
    console.log('Scanning all extensions in registry...\n');

    const db = new RegistryDatabase(DB_PATH);
    const registry = new ExtensionRegistry(db);
    const scanner = new SecurityScanner({ severityThreshold: 'medium' });

    const allExtensions = db.searchExtensions({ limit: 1000, offset: 0 });

    let scanned = 0;
    let passed = 0;
    let failed = 0;
    let warnings = 0;

    for (const ext of allExtensions) {
        console.log(`Scanning ${ext.id}...`);
        
        const versions = db.getVersions(ext.id);
        
        for (const version of versions) {
            const tarballPath = path.join(__dirname, '..', 'packages', path.basename(version.tarball_url));
            
            if (!fs.existsSync(tarballPath)) {
                console.log(`  ⊗ ${version.version} - tarball not found`);
                continue;
            }

            try {
                const extractPath = path.join(__dirname, '..', 'temp', `scan-${Date.now()}`);
                const results = await scanner.scanTarball(tarballPath, extractPath);

                if (fs.existsSync(extractPath)) {
                    fs.rmSync(extractPath, { recursive: true, force: true });
                }

                registry.recordSecurityScan(ext.id, version.version, 'batch-scan', results);

                scanned++;
                
                if (results.status === 'passed') {
                    console.log(`  ✓ ${version.version} - passed`);
                    passed++;
                } else if (results.status === 'warning') {
                    console.log(`  ⚠ ${version.version} - warnings (${results.summary.high} high, ${results.summary.medium} medium)`);
                    warnings++;
                } else {
                    console.log(`  ✗ ${version.version} - failed (${results.summary.critical} critical, ${results.summary.high} high)`);
                    failed++;
                }

            } catch (error) {
                console.error(`  ✗ ${version.version} - error: ${error.message}`);
                failed++;
            }
        }

        console.log('');
    }

    console.log('\nScan Summary:');
    console.log(`  Total scanned: ${scanned}`);
    console.log(`  Passed: ${passed}`);
    console.log(`  Warnings: ${warnings}`);
    console.log(`  Failed: ${failed}`);

    db.close();
}

scanAllExtensions().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
