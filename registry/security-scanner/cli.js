#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { SecurityScanner } = require('./scanner');

const args = process.argv.slice(2);

if (args.length === 0) {
    console.log(`\nGhost Extension Security Scanner\n`);
    console.log('Usage:');
    console.log('  node cli.js <extension-path> [options]\n');
    console.log('Options:');
    console.log('  --format <json|text>    Output format (default: json)');
    console.log('  --output <file>         Write report to file');
    console.log('  --severity <level>      Fail threshold: critical, high, medium, low (default: medium)');
    console.log('  --tarball <path>        Scan a tarball file\n');
    process.exit(1);
}

const extensionPath = args[0];
const options = {
    format: 'json',
    output: null,
    severityThreshold: 'medium',
    tarball: null
};

for (let i = 1; i < args.length; i++) {
    if (args[i] === '--format' && args[i + 1]) {
        options.format = args[i + 1];
        i++;
    } else if (args[i] === '--output' && args[i + 1]) {
        options.output = args[i + 1];
        i++;
    } else if (args[i] === '--severity' && args[i + 1]) {
        options.severityThreshold = args[i + 1];
        i++;
    } else if (args[i] === '--tarball' && args[i + 1]) {
        options.tarball = args[i + 1];
        i++;
    }
}

async function main() {
    try {
        const scanner = new SecurityScanner({ severityThreshold: options.severityThreshold });
        
        let results;
        
        if (options.tarball) {
            console.log(`Scanning tarball: ${options.tarball}`);
            const extractPath = path.join(__dirname, 'temp', Date.now().toString());
            results = await scanner.scanTarball(options.tarball, extractPath);
            
            if (fs.existsSync(extractPath)) {
                fs.rmSync(extractPath, { recursive: true, force: true });
            }
        } else {
            if (!fs.existsSync(extensionPath)) {
                console.error(`Error: Extension path does not exist: ${extensionPath}`);
                process.exit(1);
            }
            
            console.log(`Scanning extension: ${extensionPath}`);
            results = await scanner.scanExtension(extensionPath);
        }
        
        const report = scanner.generateReport(results, options.format);
        
        if (options.output) {
            fs.writeFileSync(options.output, report);
            console.log(`Report written to: ${options.output}`);
        } else {
            console.log(report);
        }
        
        if (results.status === 'failed') {
            console.error(`\nScan failed with ${results.summary.critical} critical and ${results.summary.high} high severity issues`);
            process.exit(1);
        } else if (results.status === 'warning') {
            console.warn(`\nScan completed with warnings`);
            process.exit(0);
        } else {
            console.log(`\nScan passed successfully`);
            process.exit(0);
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();
