'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const GHOSTRC_PATH = path.join(os.homedir(), '.ghost', 'config', 'ghostrc.json');

const PRESETS = {
    local: {
        registryUrl:    'http://localhost:3000/api',
        marketplaceUrl: 'http://localhost:3000',
        analyticsUrl:   'http://localhost:9876',
    },
    dev: {
        registryUrl:    'http://ghost-registry.dev.local/api',
        marketplaceUrl: 'http://ghost-deployments.dev.local',
        analyticsUrl:   'http://localhost:9876',
    },
};

const KNOWN_ENVS = Object.keys(PRESETS);

function _readGhostrc() {
    try {
        return JSON.parse(fs.readFileSync(GHOSTRC_PATH, 'utf8'));
    } catch {
        return {};
    }
}

function _writeGhostrc(rc) {
    const dir = path.dirname(GHOSTRC_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(GHOSTRC_PATH, JSON.stringify(rc, null, 2));
}

/**
 * Returns the active environment name.
 * Resolution order: GHOST_ENV env var → ghostrc.json `.environment` → 'local'
 */
function getActiveEnvironment() {
    if (process.env.GHOST_ENV) {
        return process.env.GHOST_ENV;
    }
    const rc = _readGhostrc();
    return rc.environment || 'local';
}

/**
 * Resolves a service URL for the active environment.
 * Resolution order:
 *   1. GHOST_ENV selects env name (no ghostrc write)
 *   2. ghostrc.json `.environment` (persistent)
 *   3. User override in ghostrc.json `.environments[name][key]`
 *   4. Built-in preset
 *
 * @param {string} key  - e.g. 'registryUrl', 'marketplaceUrl', 'analyticsUrl'
 * @param {string} [envName] - override env name (skips auto-detection)
 */
function resolveServiceUrl(key, envName = null) {
    const name = envName || getActiveEnvironment();
    const rc = _readGhostrc();

    // User per-env override
    const override = rc.environments?.[name]?.[key];
    if (override) return override;

    // Preset
    const preset = PRESETS[name];
    if (preset && preset[key]) return preset[key];

    // Fallback to local preset
    return PRESETS.local[key];
}

/**
 * Writes the active environment to ghostrc.json.
 * @param {string} name - environment name ('local' | 'dev')
 */
function setActiveEnvironment(name) {
    if (!PRESETS[name]) {
        throw new Error(`Unknown environment: '${name}'. Known environments: ${KNOWN_ENVS.join(', ')}`);
    }
    const rc = _readGhostrc();
    rc.environment = name;
    _writeGhostrc(rc);
}

/**
 * Returns all known environments with their fully-resolved URLs.
 */
function listEnvironments() {
    const rc = _readGhostrc();
    const active = getActiveEnvironment();
    return KNOWN_ENVS.map(name => {
        const urls = {};
        for (const key of Object.keys(PRESETS.local)) {
            const override = rc.environments?.[name]?.[key];
            urls[key] = override || PRESETS[name][key];
        }
        return { name, active: name === active, urls };
    });
}

/**
 * Sets a per-env URL override in ghostrc.json.
 * @param {string} envName
 * @param {string} key
 * @param {string} url
 */
function setEnvUrl(envName, key, url) {
    if (!PRESETS[envName]) {
        throw new Error(`Unknown environment: '${envName}'. Known environments: ${KNOWN_ENVS.join(', ')}`);
    }
    const validKeys = Object.keys(PRESETS.local);
    if (!validKeys.includes(key)) {
        throw new Error(`Unknown URL key: '${key}'. Valid keys: ${validKeys.join(', ')}`);
    }
    const rc = _readGhostrc();
    if (!rc.environments) rc.environments = {};
    if (!rc.environments[envName]) rc.environments[envName] = {};
    rc.environments[envName][key] = url;
    _writeGhostrc(rc);
}

module.exports = { getActiveEnvironment, resolveServiceUrl, setActiveEnvironment, listEnvironments, setEnvUrl, PRESETS, KNOWN_ENVS };
