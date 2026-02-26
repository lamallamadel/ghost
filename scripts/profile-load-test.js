#!/usr/bin/env node
/**
 * Profile Script for Gateway Pipeline Load Tests
 * 
 * This script runs the pipeline load test with various Node.js profiling flags
 * and generates performance reports.
 * 
 * Usage:
 *   node scripts/profile-load-test.js [mode]
 * 
 * Modes:
 *   cpu     - CPU profiling with --prof flag
 *   heap    - Heap profiling with --heap-prof flag
 *   both    - Both CPU and heap profiling
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const mode = process.argv[2] || 'cpu';
const testFile = path.join(__dirname, '..', 'test', 'gateway', 'pipeline-load.test.js');
const outputDir = path.join(__dirname, '..', 'profiling-output');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

console.log('🔬 Ghost Pipeline Profiling Suite');
console.log('=====================================');
console.log(`Mode: ${mode}`);
console.log(`Output directory: ${outputDir}\n`);

function runProfiler(flags, label) {
    return new Promise((resolve, reject) => {
        console.log(`\n▶ Running ${label}...`);
        console.log(`Command: node ${flags.join(' ')} ${testFile}\n`);
        
        const startTime = Date.now();
        const proc = spawn('node', [...flags, testFile], {
            cwd: path.join(__dirname, '..'),
            stdio: 'inherit'
        });

        proc.on('close', (code) => {
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            if (code === 0) {
                console.log(`\n✅ ${label} completed in ${duration}s`);
                resolve();
            } else {
                console.error(`\n❌ ${label} failed with code ${code}`);
                reject(new Error(`Profiler exited with code ${code}`));
            }
        });

        proc.on('error', (error) => {
            console.error(`\n❌ ${label} error:`, error);
            reject(error);
        });
    });
}

async function processCPUProfile() {
    console.log('\n🔍 Processing CPU profile...');
    
    // Find the most recent isolate-*.log file
    const files = fs.readdirSync(process.cwd())
        .filter(f => f.startsWith('isolate-') && f.endsWith('.log'))
        .map(f => ({
            name: f,
            time: fs.statSync(f).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

    if (files.length === 0) {
        console.error('❌ No isolate log files found');
        return;
    }

    const logFile = files[0].name;
    console.log(`Found profile: ${logFile}`);

    return new Promise((resolve, reject) => {
        const outputFile = path.join(outputDir, 'cpu-profile.txt');
        const proc = spawn('node', ['--prof-process', logFile], {
            cwd: process.cwd()
        });

        const output = [];
        proc.stdout.on('data', (data) => {
            output.push(data.toString());
            process.stdout.write(data);
        });

        proc.stderr.on('data', (data) => {
            process.stderr.write(data);
        });

        proc.on('close', (code) => {
            if (code === 0) {
                fs.writeFileSync(outputFile, output.join(''));
                console.log(`\n✅ CPU profile saved to: ${outputFile}`);
                
                // Clean up isolate log
                fs.unlinkSync(logFile);
                console.log(`🗑️  Cleaned up ${logFile}`);
                
                resolve();
            } else {
                reject(new Error(`prof-process exited with code ${code}`));
            }
        });
    });
}

async function processHeapProfile() {
    console.log('\n🔍 Processing heap profile...');
    
    // Find the most recent Heap-*.heapprofile file
    const files = fs.readdirSync(process.cwd())
        .filter(f => f.startsWith('Heap-') && f.endsWith('.heapprofile'))
        .map(f => ({
            name: f,
            time: fs.statSync(f).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

    if (files.length === 0) {
        console.error('❌ No heap profile files found');
        return;
    }

    const heapFile = files[0].name;
    const destFile = path.join(outputDir, 'heap-profile.heapprofile');
    
    fs.renameSync(heapFile, destFile);
    console.log(`✅ Heap profile saved to: ${destFile}`);
    console.log('💡 Tip: Open this file in Chrome DevTools (Memory > Load)');
}

async function main() {
    try {
        if (mode === 'cpu' || mode === 'both') {
            await runProfiler(['--prof', '--no-logfile-per-isolate'], 'CPU Profiling');
            await processCPUProfile();
        }

        if (mode === 'heap' || mode === 'both') {
            await runProfiler(['--heap-prof', '--heap-prof-interval=512'], 'Heap Profiling');
            await processHeapProfile();
        }

        console.log('\n=====================================');
        console.log('✅ Profiling complete!');
        console.log(`📁 Results in: ${outputDir}`);
        console.log('=====================================\n');
        
    } catch (error) {
        console.error('\n❌ Profiling failed:', error.message);
        process.exit(1);
    }
}

main();
