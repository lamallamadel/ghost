const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { ExtensionRegistry } = require('./api/registry');
const { RegistryDatabase } = require('./db/database');
const { setupRoutes } = require('./api/routes');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'registry.db');

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' }
});

app.use('/api', limiter);

app.use((req, res, next) => {
    req.requestId = require('crypto').randomBytes(8).toString('hex');
    req.timestamp = Date.now();
    next();
});

const db = new RegistryDatabase(DB_PATH);
db.initialize();

const registry = new ExtensionRegistry(db);

setupRoutes(app, registry);

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

app.use((req, res) => {
    res.status(404).json({ 
        error: 'Not Found',
        path: req.path,
        requestId: req.requestId 
    });
});

app.use((err, req, res, next) => {
    console.error(`[${req.requestId}] Error:`, err);
    res.status(err.status || 500).json({ 
        error: err.message || 'Internal Server Error',
        requestId: req.requestId
    });
});

const server = app.listen(PORT, () => {
    console.log(`Ghost Extension Registry API running on port ${PORT}`);
    console.log(`Database: ${DB_PATH}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        db.close();
        process.exit(0);
    });
});

module.exports = app;
