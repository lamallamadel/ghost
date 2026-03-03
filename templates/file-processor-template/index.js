const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { createReadStream, createWriteStream } = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');

const pipelineAsync = promisify(pipeline);

/**
 * File Processor Extension Template
 * 
 * Features:
 * - Batch file operations with concurrent processing
 * - Progress events for long-running operations
 * - Streaming support for large files
 * - Glob pattern matching
 * - Recursive directory traversal
 * - Error recovery and retry logic
 * 
 * Usage:
 *   ghost process-files --pattern "**\/*.txt" --operation uppercase
 *   ghost batch-transform --input "src/**\/*.js" --output dist/
 *   ghost stream-large-file --input large.txt --output processed.txt
 */
class FileProcessorExtension extends EventEmitter {
    constructor() {
        super();
        this.processingState = {
            total: 0,
            processed: 0,
            failed: 0,
            errors: []
        };
        this.concurrency = 5;
        this.chunkSize = 64 * 1024; // 64KB chunks for streaming
    }

    async init(context) {
        this.context = context;
        console.log('File Processor Extension initialized');
    }

    /**
     * Process multiple files matching a glob pattern
     * 
     * Flags:
     *   --pattern <glob>           Glob pattern to match files (e.g., "**\/*.txt")
     *   --operation <op>           Operation to perform (uppercase, lowercase, minify, etc.)
     *   --output <dir>             Output directory (default: overwrite in place)
     *   --recursive                Process directories recursively
     *   --concurrency <n>          Number of concurrent operations (default: 5)
     *   --dry-run                  Show what would be processed without making changes
     */
    async 'process-files'(params) {
        const { flags } = params;
        
        if (!flags.pattern) {
            return {
                success: false,
                error: 'Pattern is required. Use --pattern flag.'
            };
        }

        const pattern = flags.pattern;
        const operation = flags.operation || 'copy';
        const outputDir = flags.output;
        const recursive = flags.recursive !== false;
        const concurrency = parseInt(flags.concurrency) || this.concurrency;
        const dryRun = flags['dry-run'];

        console.log(`🔍 Finding files matching: ${pattern}`);
        
        // Find matching files
        const files = await this.findFiles(pattern, { recursive });
        
        console.log(`📁 Found ${files.length} file(s)`);

        if (dryRun) {
            console.log('\n📋 Dry run - files that would be processed:');
            files.forEach(file => console.log(`  - ${file}`));
            return { 
                success: true, 
                message: `Would process ${files.length} files`,
                files 
            };
        }

        // Initialize progress tracking
        this.processingState = {
            total: files.length,
            processed: 0,
            failed: 0,
            errors: []
        };

        // Process files with concurrency control
        const results = await this.processBatch(files, async (file) => {
            try {
                await this.processFile(file, operation, outputDir);
                this.updateProgress(file, true);
                return { file, success: true };
            } catch (error) {
                this.updateProgress(file, false, error);
                return { file, success: false, error: error.message };
            }
        }, concurrency);

        const summary = {
            total: this.processingState.total,
            processed: this.processingState.processed,
            failed: this.processingState.failed,
            errors: this.processingState.errors
        };

        console.log(`\n✅ Processing complete: ${summary.processed}/${summary.total} successful`);
        
        if (summary.failed > 0) {
            console.log(`⚠️  ${summary.failed} file(s) failed`);
        }

        return {
            success: summary.failed === 0,
            summary,
            results
        };
    }

    /**
     * Batch transform files from input to output directory
     * 
     * Flags:
     *   --input <pattern>          Input file pattern
     *   --output <dir>             Output directory
     *   --transform <fn>           Transform function name
     *   --preserve-structure       Preserve directory structure in output
     */
    async 'batch-transform'(params) {
        const { flags } = params;
        
        if (!flags.input || !flags.output) {
            return {
                success: false,
                error: 'Input pattern and output directory required'
            };
        }

        const files = await this.findFiles(flags.input);
        const outputDir = flags.output;
        const transform = flags.transform || 'identity';
        const preserveStructure = flags['preserve-structure'];

        console.log(`🔄 Transforming ${files.length} file(s)...`);

        this.processingState = {
            total: files.length,
            processed: 0,
            failed: 0,
            errors: []
        };

        const results = await this.processBatch(files, async (file) => {
            try {
                const content = await fs.promises.readFile(file, 'utf8');
                const transformed = await this.applyTransform(content, transform);
                
                let outputPath;
                if (preserveStructure) {
                    const relativePath = path.relative(process.cwd(), file);
                    outputPath = path.join(outputDir, relativePath);
                    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
                } else {
                    outputPath = path.join(outputDir, path.basename(file));
                }

                await fs.promises.writeFile(outputPath, transformed);
                this.updateProgress(file, true);
                
                return { file, outputPath, success: true };
            } catch (error) {
                this.updateProgress(file, false, error);
                return { file, success: false, error: error.message };
            }
        }, this.concurrency);

        return {
            success: this.processingState.failed === 0,
            summary: this.processingState,
            results
        };
    }

    /**
     * Stream process large file efficiently
     * 
     * Flags:
     *   --input <file>             Input file path
     *   --output <file>            Output file path
     *   --transform <fn>           Transform function to apply per line/chunk
     *   --chunk-size <bytes>       Chunk size for streaming (default: 64KB)
     *   --line-by-line             Process file line by line
     */
    async 'stream-large-file'(params) {
        const { flags } = params;
        
        if (!flags.input || !flags.output) {
            return {
                success: false,
                error: 'Input and output file paths required'
            };
        }

        const inputPath = flags.input;
        const outputPath = flags.output;
        const transform = flags.transform || 'identity';
        const chunkSize = parseInt(flags['chunk-size']) || this.chunkSize;
        const lineByLine = flags['line-by-line'];

        if (!fs.existsSync(inputPath)) {
            return {
                success: false,
                error: `Input file not found: ${inputPath}`
            };
        }

        const fileSize = fs.statSync(inputPath).size;
        console.log(`📖 Streaming file: ${inputPath} (${this.formatBytes(fileSize)})`);

        try {
            if (lineByLine) {
                await this.streamLineByLine(inputPath, outputPath, transform);
            } else {
                await this.streamChunks(inputPath, outputPath, transform, chunkSize);
            }

            console.log(`✅ Stream processing complete: ${outputPath}`);
            
            return {
                success: true,
                inputFile: inputPath,
                outputFile: outputPath,
                size: fileSize
            };
        } catch (error) {
            console.error(`❌ Stream processing failed: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Find files matching glob pattern
     */
    async findFiles(pattern, options = {}) {
        const { recursive = true } = options;
        const files = [];
        
        // Simple glob implementation
        const isGlob = pattern.includes('*') || pattern.includes('?');
        
        if (isGlob) {
            await this.walkDirectory(process.cwd(), (file) => {
                if (this.matchPattern(file, pattern)) {
                    files.push(file);
                }
            }, recursive);
        } else {
            // Direct file or directory
            const fullPath = path.resolve(pattern);
            if (fs.existsSync(fullPath)) {
                const stat = fs.statSync(fullPath);
                if (stat.isFile()) {
                    files.push(fullPath);
                } else if (stat.isDirectory() && recursive) {
                    await this.walkDirectory(fullPath, (file) => {
                        files.push(file);
                    }, true);
                }
            }
        }
        
        return files;
    }

    /**
     * Walk directory recursively
     */
    async walkDirectory(dir, callback, recursive = true) {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isFile()) {
                await callback(fullPath);
            } else if (entry.isDirectory() && recursive) {
                await this.walkDirectory(fullPath, callback, recursive);
            }
        }
    }

    /**
     * Match file path against glob pattern
     */
    matchPattern(filePath, pattern) {
        // Convert glob pattern to regex
        const regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*\*/g, '§§DOUBLESTAR§§')
            .replace(/\*/g, '[^/\\\\]*')
            .replace(/§§DOUBLESTAR§§/g, '.*')
            .replace(/\?/g, '.');
        
        const regex = new RegExp(`^${regexPattern}$`);
        const relativePath = path.relative(process.cwd(), filePath);
        
        return regex.test(relativePath) || regex.test(filePath);
    }

    /**
     * Process batch of items with concurrency control
     */
    async processBatch(items, processor, concurrency) {
        const results = [];
        const queue = [...items];
        const inProgress = new Set();

        return new Promise((resolve, reject) => {
            const processNext = () => {
                // Check if we're done
                if (queue.length === 0 && inProgress.size === 0) {
                    resolve(results);
                    return;
                }

                // Process items up to concurrency limit
                while (queue.length > 0 && inProgress.size < concurrency) {
                    const item = queue.shift();
                    const promise = processor(item);
                    
                    inProgress.add(promise);
                    
                    promise
                        .then(result => {
                            results.push(result);
                            inProgress.delete(promise);
                            processNext();
                        })
                        .catch(error => {
                            results.push({ error: error.message, success: false });
                            inProgress.delete(promise);
                            processNext();
                        });
                }
            };

            processNext();
        });
    }

    /**
     * Process single file
     */
    async processFile(filePath, operation, outputDir) {
        const content = await fs.promises.readFile(filePath, 'utf8');
        const processed = await this.applyOperation(content, operation);
        
        const outputPath = outputDir 
            ? path.join(outputDir, path.basename(filePath))
            : filePath;

        if (outputDir) {
            await fs.promises.mkdir(outputDir, { recursive: true });
        }

        await fs.promises.writeFile(outputPath, processed);
    }

    /**
     * Apply operation to content
     */
    async applyOperation(content, operation) {
        switch (operation) {
            case 'uppercase':
                return content.toUpperCase();
            case 'lowercase':
                return content.toLowerCase();
            case 'trim':
                return content.trim();
            case 'minify':
                return content.replace(/\s+/g, ' ').trim();
            case 'copy':
            default:
                return content;
        }
    }

    /**
     * Apply transform function
     */
    async applyTransform(content, transform) {
        // Same as applyOperation but for transforms
        return this.applyOperation(content, transform);
    }

    /**
     * Stream file line by line
     */
    async streamLineByLine(inputPath, outputPath, transform) {
        const readline = require('readline');
        const input = createReadStream(inputPath);
        const output = createWriteStream(outputPath);
        
        const rl = readline.createInterface({
            input,
            crlfDelay: Infinity
        });

        let lineCount = 0;
        
        for await (const line of rl) {
            const transformed = await this.applyTransform(line, transform);
            output.write(transformed + '\n');
            lineCount++;
            
            if (lineCount % 1000 === 0) {
                this.emit('progress', { lines: lineCount });
                console.log(`  Processed ${lineCount} lines...`);
            }
        }

        output.end();
        
        return new Promise((resolve, reject) => {
            output.on('finish', resolve);
            output.on('error', reject);
        });
    }

    /**
     * Stream file by chunks
     */
    async streamChunks(inputPath, outputPath, transform, chunkSize) {
        const input = createReadStream(inputPath, { highWaterMark: chunkSize });
        const output = createWriteStream(outputPath);

        let bytesProcessed = 0;
        const totalSize = fs.statSync(inputPath).size;

        input.on('data', (chunk) => {
            bytesProcessed += chunk.length;
            const progress = ((bytesProcessed / totalSize) * 100).toFixed(2);
            
            if (bytesProcessed % (chunkSize * 10) === 0) {
                this.emit('progress', { bytes: bytesProcessed, total: totalSize, progress });
                console.log(`  Progress: ${progress}% (${this.formatBytes(bytesProcessed)}/${this.formatBytes(totalSize)})`);
            }
        });

        await pipelineAsync(input, output);
    }

    /**
     * Update processing progress
     */
    updateProgress(file, success, error = null) {
        if (success) {
            this.processingState.processed++;
        } else {
            this.processingState.failed++;
            this.processingState.errors.push({ file, error: error?.message || 'Unknown error' });
        }

        const progress = ((this.processingState.processed + this.processingState.failed) / this.processingState.total * 100).toFixed(1);
        this.emit('progress', this.processingState);
        
        console.log(`  [${progress}%] ${path.basename(file)} ${success ? '✓' : '✗'}`);
    }

    /**
     * Format bytes to human readable
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async cleanup() {
        this.removeAllListeners();
        console.log('File Processor Extension cleanup complete');
    }
}

module.exports = FileProcessorExtension;
