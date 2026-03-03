const fs = require('fs');
const path = require('path');
const os = require('os');
const { createStorageAdapter } = require('./storage');
const { Database } = require('./database');

class RegistryMigration {
    constructor(options = {}) {
        this.localExtensionsDir = options.localExtensionsDir || path.join(os.homedir(), '.ghost', 'extensions');
        this.storageAdapter = options.storageAdapter || createStorageAdapter();
        this.db = options.database || new Database();
        this.verbose = options.verbose || false;
    }

    log(message) {
        if (this.verbose) {
            console.log(`[Migration] ${message}`);
        }
    }

    async exportLocalExtensions(outputPath) {
        this.log('Starting local extensions export...');
        
        if (!fs.existsSync(this.localExtensionsDir)) {
            throw new Error(`Local extensions directory not found: ${this.localExtensionsDir}`);
        }

        const extensions = [];
        const extensionDirs = fs.readdirSync(this.localExtensionsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        for (const extName of extensionDirs) {
            const extPath = path.join(this.localExtensionsDir, extName);
            const manifestPath = path.join(extPath, 'manifest.json');

            if (!fs.existsSync(manifestPath)) {
                this.log(`Skipping ${extName}: no manifest.json found`);
                continue;
            }

            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                const files = this._getAllFiles(extPath);
                
                const extensionData = {
                    id: manifest.id || extName,
                    name: manifest.name || extName,
                    version: manifest.version || '1.0.0',
                    description: manifest.description || '',
                    author: manifest.author || 'unknown',
                    manifest,
                    files: files.map(f => ({
                        path: path.relative(extPath, f),
                        content: fs.readFileSync(f, 'base64')
                    })),
                    createdAt: fs.statSync(manifestPath).birthtime.toISOString()
                };

                extensions.push(extensionData);
                this.log(`Exported: ${extensionData.id} v${extensionData.version}`);
            } catch (error) {
                this.log(`Error exporting ${extName}: ${error.message}`);
            }
        }

        const exportData = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            extensionCount: extensions.length,
            extensions
        };

        fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
        this.log(`Export completed: ${extensions.length} extensions exported to ${outputPath}`);
        
        return {
            success: true,
            extensionCount: extensions.length,
            outputPath
        };
    }

    async importToHostedRegistry(importPath, options = {}) {
        this.log('Starting import to hosted registry...');
        
        if (!fs.existsSync(importPath)) {
            throw new Error(`Import file not found: ${importPath}`);
        }

        const importData = JSON.parse(fs.readFileSync(importPath, 'utf8'));
        const results = {
            success: [],
            failed: [],
            skipped: []
        };

        for (const extensionData of importData.extensions) {
            try {
                const tarballBuffer = await this._createTarball(extensionData);
                
                const uploadResult = await this.storageAdapter.uploadExtension(
                    extensionData.id,
                    extensionData.version,
                    tarballBuffer
                );

                if (uploadResult.success) {
                    const dbEntry = this.db.createExtension({
                        id: extensionData.id,
                        name: extensionData.name,
                        description: extensionData.description,
                        author: extensionData.author,
                        version: extensionData.version,
                        manifest: extensionData.manifest,
                        filePath: uploadResult.key,
                        status: options.autoApprove ? 'approved' : 'pending'
                    });

                    results.success.push({
                        id: extensionData.id,
                        version: extensionData.version,
                        url: uploadResult.url
                    });

                    this.log(`Imported: ${extensionData.id} v${extensionData.version}`);
                } else {
                    results.failed.push({
                        id: extensionData.id,
                        error: 'Upload failed'
                    });
                }
            } catch (error) {
                results.failed.push({
                    id: extensionData.id,
                    error: error.message
                });
                this.log(`Failed to import ${extensionData.id}: ${error.message}`);
            }
        }

        this.log(`Import completed: ${results.success.length} succeeded, ${results.failed.length} failed`);
        
        return results;
    }

    async migrateToS3(options = {}) {
        this.log('Starting full migration to S3...');
        
        const exportPath = options.exportPath || path.join(os.tmpdir(), `ghost-extensions-export-${Date.now()}.json`);
        
        const exportResult = await this.exportLocalExtensions(exportPath);
        
        const importResult = await this.importToHostedRegistry(exportPath, options);
        
        if (options.deleteLocal && importResult.success.length > 0) {
            this.log('Cleaning up local extensions...');
            
            for (const item of importResult.success) {
                const localPath = path.join(this.localExtensionsDir, item.id);
                if (fs.existsSync(localPath)) {
                    fs.rmSync(localPath, { recursive: true });
                    this.log(`Deleted local copy: ${item.id}`);
                }
            }
        }

        const backupPath = options.backupPath || path.join(os.homedir(), '.ghost', 'backups', `extensions-backup-${Date.now()}.json`);
        const backupDir = path.dirname(backupPath);
        
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        fs.copyFileSync(exportPath, backupPath);
        this.log(`Backup saved to: ${backupPath}`);

        return {
            success: true,
            exported: exportResult.extensionCount,
            imported: importResult.success.length,
            failed: importResult.failed.length,
            backupPath
        };
    }

    async verifyMigration(importResults) {
        this.log('Verifying migration...');
        
        const verificationResults = {
            verified: [],
            failed: []
        };

        for (const item of importResults.success) {
            try {
                const metadata = await this.storageAdapter.getExtensionMetadata(
                    item.id,
                    item.version
                );

                if (metadata.success) {
                    verificationResults.verified.push({
                        id: item.id,
                        version: item.version,
                        size: metadata.contentLength
                    });
                    this.log(`Verified: ${item.id} v${item.version}`);
                } else {
                    verificationResults.failed.push({
                        id: item.id,
                        error: 'Metadata check failed'
                    });
                }
            } catch (error) {
                verificationResults.failed.push({
                    id: item.id,
                    error: error.message
                });
            }
        }

        this.log(`Verification completed: ${verificationResults.verified.length} verified, ${verificationResults.failed.length} failed`);
        
        return verificationResults;
    }

    _getAllFiles(dir, fileList = []) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    this._getAllFiles(fullPath, fileList);
                }
            } else {
                fileList.push(fullPath);
            }
        }

        return fileList;
    }

    async _createTarball(extensionData) {
        const tar = require('tar-stream');
        const zlib = require('zlib');
        const { Readable } = require('stream');

        const pack = tar.pack();

        for (const file of extensionData.files) {
            const content = Buffer.from(file.content, 'base64');
            pack.entry({ name: file.path, size: content.length }, content);
        }

        pack.finalize();

        return new Promise((resolve, reject) => {
            const chunks = [];
            const gzip = zlib.createGzip();
            
            pack.pipe(gzip);
            
            gzip.on('data', chunk => chunks.push(chunk));
            gzip.on('end', () => resolve(Buffer.concat(chunks)));
            gzip.on('error', reject);
        });
    }
}

async function runMigrationCLI() {
    const args = process.argv.slice(2);
    const command = args[0];

    const migration = new RegistryMigration({ verbose: true });

    try {
        switch (command) {
            case 'export':
                const exportPath = args[1] || './ghost-extensions-export.json';
                const exportResult = await migration.exportLocalExtensions(exportPath);
                console.log('\nExport Summary:');
                console.log(`  Extensions: ${exportResult.extensionCount}`);
                console.log(`  Output: ${exportResult.outputPath}`);
                break;

            case 'import':
                const importPath = args[1];
                if (!importPath) {
                    console.error('Usage: node migrations.js import <export-file.json>');
                    process.exit(1);
                }
                const autoApprove = args.includes('--auto-approve');
                const importResult = await migration.importToHostedRegistry(importPath, { autoApprove });
                console.log('\nImport Summary:');
                console.log(`  Succeeded: ${importResult.success.length}`);
                console.log(`  Failed: ${importResult.failed.length}`);
                if (importResult.failed.length > 0) {
                    console.log('\nFailed imports:');
                    importResult.failed.forEach(f => console.log(`  - ${f.id}: ${f.error}`));
                }
                break;

            case 'migrate':
                const deleteLocal = args.includes('--delete-local');
                const migrateAutoApprove = args.includes('--auto-approve');
                const migrateResult = await migration.migrateToS3({ 
                    deleteLocal, 
                    autoApprove: migrateAutoApprove 
                });
                console.log('\nMigration Summary:');
                console.log(`  Exported: ${migrateResult.exported}`);
                console.log(`  Imported: ${migrateResult.imported}`);
                console.log(`  Failed: ${migrateResult.failed}`);
                console.log(`  Backup: ${migrateResult.backupPath}`);
                break;

            default:
                console.log('Ghost Registry Migration Tool');
                console.log('\nUsage:');
                console.log('  node migrations.js export [output.json]');
                console.log('  node migrations.js import <export.json> [--auto-approve]');
                console.log('  node migrations.js migrate [--delete-local] [--auto-approve]');
                console.log('\nCommands:');
                console.log('  export   - Export local extensions to JSON file');
                console.log('  import   - Import extensions from JSON to hosted registry');
                console.log('  migrate  - Full migration from local to S3 (export + import + backup)');
                console.log('\nOptions:');
                console.log('  --auto-approve  - Automatically approve imported extensions');
                console.log('  --delete-local  - Delete local extensions after successful migration');
                process.exit(0);
        }
    } catch (error) {
        console.error('\nError:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    runMigrationCLI();
}

module.exports = { RegistryMigration };
