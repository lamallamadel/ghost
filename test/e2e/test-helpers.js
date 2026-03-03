/**
 * E2E Test Helpers
 * 
 * Utility functions for extension workflow E2E testing
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Execute shell command synchronously
 */
function sh(cmd, cwd, env) {
  const options = { 
    cwd, 
    encoding: 'utf8', 
    stdio: ['ignore', 'pipe', 'pipe'],
    env: env || process.env
  };
  return execSync(cmd, options);
}

/**
 * Try to execute shell command, return success/failure
 */
function trySh(cmd, cwd, env) {
  try {
    return { 
      ok: true, 
      out: sh(cmd, cwd, env) 
    };
  } catch (e) {
    return { 
      ok: false, 
      out: (e.stdout || '') + (e.stderr || ''), 
      stderr: e.stderr || '', 
      code: e.status 
    };
  }
}

/**
 * Create temporary test directory
 */
function createTempDir(prefix = 'ghost-e2e-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Initialize git repository in directory
 */
function initGitRepo(dir) {
  sh('git init', dir);
  sh('git config user.email "test@example.com"', dir);
  sh('git config user.name "Test User"', dir);
}

/**
 * Create test environment with isolated HOME
 */
function createTestEnv(tmpRoot) {
  const homeDir = path.join(tmpRoot, '.ghost-home');
  const extensionsDir = path.join(homeDir, '.ghost', 'extensions');
  
  fs.mkdirSync(extensionsDir, { recursive: true });
  
  return {
    HOME: homeDir,
    USERPROFILE: homeDir,
    extensionsDir
  };
}

/**
 * Write manifest.json to directory
 */
function writeManifest(dir, manifest) {
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
}

/**
 * Read manifest.json from directory
 */
function readManifest(dir) {
  const content = fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8');
  return JSON.parse(content);
}

/**
 * Validate manifest against schema
 */
function validateManifestSchema(manifest) {
  const errors = [];
  
  if (!manifest.id || typeof manifest.id !== 'string') {
    errors.push('Missing or invalid id');
  }
  
  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('Missing or invalid name');
  }
  
  if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    errors.push('Missing or invalid version (must be semantic version)');
  }
  
  if (!manifest.main || typeof manifest.main !== 'string') {
    errors.push('Missing or invalid main');
  }
  
  if (!manifest.capabilities || typeof manifest.capabilities !== 'object') {
    errors.push('Missing or invalid capabilities');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate glob pattern syntax
 */
function validateGlobPattern(pattern) {
  try {
    // Basic validation - check for common invalid patterns
    if (pattern.includes('[') && !pattern.includes(']')) {
      return { valid: false, error: 'Unclosed bracket' };
    }
    
    if (pattern.includes('{') && !pattern.includes('}')) {
      return { valid: false, error: 'Unclosed brace' };
    }
    
    // Check for invalid bracket syntax like **[invalid
    if (/\*\*\[(?!\w+\])/.test(pattern)) {
      return { valid: false, error: 'Invalid bracket syntax' };
    }
    
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

/**
 * Validate network URL
 */
function validateNetworkUrl(url) {
  try {
    // Must start with http:// or https://
    if (!/^https?:\/\//.test(url)) {
      return { valid: false, error: 'URL must start with http:// or https://' };
    }
    
    const parsed = new URL(url);
    
    // Must have valid hostname
    if (!parsed.hostname || parsed.hostname === '') {
      return { valid: false, error: 'URL must have valid hostname' };
    }
    
    return { valid: true };
  } catch (e) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Create registry index with extensions
 */
function createRegistryIndex(extensions) {
  return {
    extensions: extensions.map(ext => ({
      id: ext.id,
      name: ext.name,
      version: ext.version,
      description: ext.description || '',
      author: ext.author || '',
      category: ext.category || 'Utilities',
      downloadUrl: ext.downloadUrl || `mock://registry/${ext.id}-${ext.version}.tgz`,
      checksum: ext.checksum || `sha256:${Math.random().toString(36).substring(7)}`,
      size: ext.size || 1024,
      published: ext.published || new Date().toISOString(),
      downloads: ext.downloads || 0
    })),
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Simulate registry search
 */
function searchRegistry(registryIndex, query) {
  const lowerQuery = query.toLowerCase();
  
  return registryIndex.extensions.filter(ext => 
    ext.id.toLowerCase().includes(lowerQuery) ||
    ext.name.toLowerCase().includes(lowerQuery) ||
    ext.description.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Simulate registry browse by category
 */
function browseRegistryByCategory(registryIndex, category) {
  if (!category) {
    return registryIndex.extensions;
  }
  
  return registryIndex.extensions.filter(ext => 
    ext.category.toLowerCase() === category.toLowerCase()
  );
}

/**
 * Verify checksum format
 */
function verifyChecksum(checksum) {
  return /^(sha256|sha512|md5):[a-fA-F0-9]+$/.test(checksum);
}

/**
 * Compare semantic versions
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < 3; i++) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }
  
  return 0;
}

/**
 * Check if version is upgrade
 */
function isVersionUpgrade(currentVersion, newVersion) {
  return compareVersions(newVersion, currentVersion) > 0;
}

/**
 * Copy directory recursively
 */
function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Remove directory recursively
 */
function removeDirectory(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Wait for condition with timeout
 */
async function waitFor(condition, timeout = 5000, interval = 100) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  return false;
}

/**
 * Retry function with exponential backoff
 */
async function retry(fn, maxAttempts = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Create test report
 */
function createTestReport(summary, fixtures = {}) {
  const passed = Object.values(summary).filter(r => r === 'PASS').length;
  const failed = Object.values(summary).filter(r => r === 'FAIL').length;
  const skipped = Object.values(summary).filter(r => r === 'SKIP').length;
  const total = Object.values(summary).length;
  
  return {
    timestamp: new Date().toISOString(),
    summary,
    stats: {
      total,
      passed,
      failed,
      skipped,
      passRate: (passed / (total - skipped)) * 100
    },
    fixtures
  };
}

/**
 * Assert helper with detailed error messages
 */
function assertExtensionValid(extensionDir, extensionId) {
  const errors = [];
  
  if (!fs.existsSync(extensionDir)) {
    errors.push(`Extension directory not found: ${extensionDir}`);
    return { valid: false, errors };
  }
  
  const manifestPath = path.join(extensionDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    errors.push('manifest.json not found');
  } else {
    try {
      const manifest = readManifest(extensionDir);
      
      if (manifest.id !== extensionId) {
        errors.push(`Extension ID mismatch: expected ${extensionId}, got ${manifest.id}`);
      }
      
      const validation = validateManifestSchema(manifest);
      if (!validation.valid) {
        errors.push(...validation.errors);
      }
    } catch (e) {
      errors.push(`Invalid manifest.json: ${e.message}`);
    }
  }
  
  const mainPath = path.join(extensionDir, 'index.js');
  if (!fs.existsSync(mainPath)) {
    errors.push('index.js not found');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Generate unique extension ID for testing
 */
function generateTestExtensionId(prefix = 'test-ext') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Cleanup test artifacts
 */
function cleanup(...paths) {
  for (const p of paths) {
    try {
      removeDirectory(p);
    } catch (e) {
      console.warn(`Failed to cleanup ${p}:`, e.message);
    }
  }
}

module.exports = {
  sh,
  trySh,
  createTempDir,
  initGitRepo,
  createTestEnv,
  writeManifest,
  readManifest,
  validateManifestSchema,
  validateGlobPattern,
  validateNetworkUrl,
  createRegistryIndex,
  searchRegistry,
  browseRegistryByCategory,
  verifyChecksum,
  compareVersions,
  isVersionUpgrade,
  copyDirectory,
  removeDirectory,
  waitFor,
  retry,
  createTestReport,
  assertExtensionValid,
  generateTestExtensionId,
  cleanup
};
