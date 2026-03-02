const path = require('path');
const { RegistryDatabase } = require('./database');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'registry.db');

console.log('Running database migrations...');
console.log(`Database path: ${DB_PATH}\n`);

const db = new RegistryDatabase(DB_PATH);
db.initialize();

console.log('✓ Migrations completed successfully');

db.close();
