const fs = require('fs');
const path = require('path');

class PathValidator {
    constructor(options = {}) {
        this.allowedPaths = options.allowedPaths || [];
        this.allowedPatterns = options.allowedPatterns || [];
        this.deniedPaths = options.deniedPaths || [];
        this.rootDirectory = options.rootDirectory || process.cwd();
    }

    addAllowedPath(allowedPath) {
        const normalized = this.normalizePath(allowedPath);
        if (normalized && !this.allowedPaths.includes(normalized)) {
            this.allowedPaths.push(normalized);
        }
    }

    addAllowedPattern(pattern) {
        if (pattern && !this.allowedPatterns.includes(pattern)) {
            this.allowedPatterns.push(pattern);
        }
    }

    addDeniedPath(deniedPath) {
        const normalized = this.normalizePath(deniedPath);
        if (normalized && !this.deniedPaths.includes(normalized)) {
            this.deniedPaths.push(normalized);
        }
    }

    normalizePath(inputPath) {
        if (!inputPath || typeof inputPath !== 'string') {
            return null;
        }

        try {
            const resolved = path.resolve(this.rootDirectory, inputPath);
            const normalized = path.normalize(resolved);
            return normalized;
        } catch (error) {
            return null;
        }
    }

    isAbsolutePath(inputPath) {
        return path.isAbsolute(inputPath);
    }

    hasDirectoryTraversal(inputPath) {
        if (!inputPath || typeof inputPath !== 'string') {
            return false;
        }

        const normalized = path.normalize(inputPath);
        const parts = normalized.split(path.sep);
        
        return parts.includes('..') || inputPath.includes('../') || inputPath.includes('..\\');
    }

    isWithinRoot(targetPath) {
        const normalized = this.normalizePath(targetPath);
        if (!normalized) {
            return false;
        }

        const relative = path.relative(this.rootDirectory, normalized);
        return !relative.startsWith('..') && !path.isAbsolute(relative);
    }

    matchesPattern(inputPath, pattern) {
        if (!inputPath || !pattern) {
            return false;
        }

        const regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(inputPath);
    }

    matchesAnyPattern(inputPath, patterns) {
        return patterns.some(pattern => this.matchesPattern(inputPath, pattern));
    }

    isPathAllowed(inputPath) {
        if (this.hasDirectoryTraversal(inputPath)) {
            return {
                allowed: false,
                reason: 'Directory traversal detected (../ or ..\\)'
            };
        }

        const normalized = this.normalizePath(inputPath);
        if (!normalized) {
            return {
                allowed: false,
                reason: 'Invalid path format'
            };
        }

        if (!this.isWithinRoot(inputPath)) {
            return {
                allowed: false,
                reason: 'Path is outside allowed root directory'
            };
        }

        for (const deniedPath of this.deniedPaths) {
            if (normalized.startsWith(deniedPath) || normalized === deniedPath) {
                return {
                    allowed: false,
                    reason: `Path matches denied path: ${deniedPath}`
                };
            }
        }

        if (this.allowedPaths.length === 0 && this.allowedPatterns.length === 0) {
            return {
                allowed: true,
                reason: 'No restrictions configured'
            };
        }

        const relativePath = path.relative(this.rootDirectory, normalized);

        for (const allowedPath of this.allowedPaths) {
            if (normalized.startsWith(allowedPath) || normalized === allowedPath) {
                return {
                    allowed: true,
                    reason: `Path matches allowed path: ${allowedPath}`
                };
            }
        }

        if (this.allowedPatterns.length > 0) {
            if (this.matchesAnyPattern(relativePath, this.allowedPatterns)) {
                return {
                    allowed: true,
                    reason: 'Path matches allowed pattern'
                };
            }
        }

        return {
            allowed: false,
            reason: 'Path does not match any allowed path or pattern'
        };
    }

    validatePath(inputPath) {
        const result = this.isPathAllowed(inputPath);
        
        if (!result.allowed) {
            throw new Error(`Path validation failed: ${result.reason}`);
        }

        return this.normalizePath(inputPath);
    }

    validateFileAccess(filePath, mode = 'read') {
        const validation = this.isPathAllowed(filePath);
        
        if (!validation.allowed) {
            throw new Error(`File access denied: ${validation.reason}`);
        }

        const normalized = this.normalizePath(filePath);

        if (mode === 'read') {
            if (!fs.existsSync(normalized)) {
                throw new Error(`File does not exist: ${filePath}`);
            }
            
            try {
                fs.accessSync(normalized, fs.constants.R_OK);
            } catch (error) {
                throw new Error(`File is not readable: ${filePath}`);
            }
        } else if (mode === 'write') {
            const dir = path.dirname(normalized);
            if (!fs.existsSync(dir)) {
                throw new Error(`Parent directory does not exist: ${dir}`);
            }
            
            try {
                fs.accessSync(dir, fs.constants.W_OK);
            } catch (error) {
                throw new Error(`Directory is not writable: ${dir}`);
            }
        }

        return normalized;
    }

    sanitizePath(inputPath) {
        if (!inputPath || typeof inputPath !== 'string') {
            return null;
        }

        let sanitized = inputPath.replace(/\0/g, '');
        sanitized = sanitized.replace(/[<>"|?*]/g, '_');
        sanitized = path.normalize(sanitized);

        return sanitized;
    }

    static createDefault(rootDirectory) {
        return new PathValidator({
            rootDirectory: rootDirectory || process.cwd(),
            allowedPaths: [],
            allowedPatterns: ['**/*'],
            deniedPaths: []
        });
    }

    static createRestrictive(rootDirectory, allowedPaths = []) {
        return new PathValidator({
            rootDirectory: rootDirectory || process.cwd(),
            allowedPaths: allowedPaths,
            allowedPatterns: [],
            deniedPaths: []
        });
    }
}

module.exports = PathValidator;
