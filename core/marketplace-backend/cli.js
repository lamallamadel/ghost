#!/usr/bin/env node

const { MarketplaceServer } = require('./server');
const path = require('path');

function parseArgs(args) {
    const options = {
        port: 3000,
        dbPath: path.join(__dirname, 'registry.db')
    };

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--port' && args[i + 1]) {
            options.port = parseInt(args[i + 1]);
            i++;
        } else if (args[i] === '--db' && args[i + 1]) {
            options.dbPath = args[i + 1];
            i++;
        } else if (args[i] === '--help' || args[i] === '-h') {
            console.log(`
Ghost Extension Marketplace Server

Usage: node cli.js [options]

Options:
  --port <number>    Port to listen on (default: 3000)
  --db <path>        Path to SQLite database (default: ./registry.db)
  --help, -h         Show this help message

Examples:
  node cli.js
  node cli.js --port 8080
  node cli.js --port 8080 --db /var/lib/ghost/registry.db
            `);
            process.exit(0);
        }
    }

    return options;
}

const options = parseArgs(process.argv.slice(2));
const server = new MarketplaceServer(options);

server.start().catch(err => {
    console.error('[Marketplace] Failed to start:', err);
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log('\n[Marketplace] Shutting down...');
    server.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[Marketplace] Shutting down...');
    server.stop();
    process.exit(0);
});
