const assert = require('assert');
const FileProcessorExtension = require('../index');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('File Processor Extension', () => {
    let extension;
    let testDir;

    beforeEach(async () => {
        extension = new FileProcessorExtension();
        await extension.init({});
        
        // Create temp test directory
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-test-'));
    });

    afterEach(() => {
        // Clean up test directory
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe('Pattern Matching', () => {
        it('should match simple wildcard patterns', () => {
            assert.strictEqual(extension.matchPattern('test.txt', '*.txt'), true);
            assert.strictEqual(extension.matchPattern('test.js', '*.txt'), false);
        });

        it('should match double star patterns', () => {
            assert.strictEqual(extension.matchPattern('src/utils/helper.js', '**/*.js'), true);
            assert.strictEqual(extension.matchPattern('src/utils/helper.ts', '**/*.js'), false);
        });

        it('should match question mark patterns', () => {
            assert.strictEqual(extension.matchPattern('test1.txt', 'test?.txt'), true);
            assert.strictEqual(extension.matchPattern('test12.txt', 'test?.txt'), false);
        });
    });

    describe('File Operations', () => {
        it('should apply uppercase operation', async () => {
            const result = await extension.applyOperation('hello world', 'uppercase');
            assert.strictEqual(result, 'HELLO WORLD');
        });

        it('should apply lowercase operation', async () => {
            const result = await extension.applyOperation('HELLO WORLD', 'lowercase');
            assert.strictEqual(result, 'hello world');
        });

        it('should apply trim operation', async () => {
            const result = await extension.applyOperation('  hello  ', 'trim');
            assert.strictEqual(result, 'hello');
        });

        it('should apply minify operation', async () => {
            const result = await extension.applyOperation('hello   world\n\ntest', 'minify');
            assert.strictEqual(result, 'hello world test');
        });

        it('should return content unchanged for copy operation', async () => {
            const content = 'test content';
            const result = await extension.applyOperation(content, 'copy');
            assert.strictEqual(result, content);
        });
    });

    describe('File Finding', () => {
        beforeEach(() => {
            // Create test file structure
            fs.writeFileSync(path.join(testDir, 'file1.txt'), 'content1');
            fs.writeFileSync(path.join(testDir, 'file2.js'), 'content2');
            
            const subDir = path.join(testDir, 'sub');
            fs.mkdirSync(subDir);
            fs.writeFileSync(path.join(subDir, 'file3.txt'), 'content3');
        });

        it('should find files matching pattern', async () => {
            const pattern = path.join(testDir, '**/*.txt');
            const files = await extension.findFiles(pattern);
            
            assert.strictEqual(files.length, 2);
            assert(files.some(f => f.endsWith('file1.txt')));
            assert(files.some(f => f.endsWith('file3.txt')));
        });

        it('should find single file', async () => {
            const filePath = path.join(testDir, 'file1.txt');
            const files = await extension.findFiles(filePath);
            
            assert.strictEqual(files.length, 1);
            assert.strictEqual(files[0], filePath);
        });

        it('should handle non-recursive option', async () => {
            const pattern = path.join(testDir, '*.txt');
            const files = await extension.findFiles(pattern, { recursive: false });
            
            assert.strictEqual(files.length, 1);
            assert(files[0].endsWith('file1.txt'));
        });
    });

    describe('Batch Processing', () => {
        it('should process items with concurrency control', async () => {
            const items = [1, 2, 3, 4, 5];
            const results = [];
            
            const processed = await extension.processBatch(
                items,
                async (item) => {
                    await new Promise(resolve => setTimeout(resolve, 10));
                    return item * 2;
                },
                2
            );

            assert.strictEqual(processed.length, 5);
            processed.forEach((result, idx) => {
                assert.strictEqual(result, items[idx] * 2);
            });
        });

        it('should handle errors in batch processing', async () => {
            const items = [1, 2, 3];
            
            const processed = await extension.processBatch(
                items,
                async (item) => {
                    if (item === 2) {
                        throw new Error('Test error');
                    }
                    return item * 2;
                },
                1
            );

            assert.strictEqual(processed.length, 3);
            assert.strictEqual(processed[0], 2);
            assert.strictEqual(processed[1].success, false);
            assert.strictEqual(processed[2], 6);
        });
    });

    describe('Progress Tracking', () => {
        it('should emit progress events', (done) => {
            extension.on('progress', (state) => {
                assert.ok(state.processed !== undefined);
                assert.ok(state.total !== undefined);
                done();
            });

            extension.updateProgress('test.txt', true);
        });

        it('should track processing state correctly', () => {
            extension.processingState = {
                total: 3,
                processed: 0,
                failed: 0,
                errors: []
            };

            extension.updateProgress('file1.txt', true);
            assert.strictEqual(extension.processingState.processed, 1);
            assert.strictEqual(extension.processingState.failed, 0);

            extension.updateProgress('file2.txt', false, new Error('Test error'));
            assert.strictEqual(extension.processingState.processed, 1);
            assert.strictEqual(extension.processingState.failed, 1);
            assert.strictEqual(extension.processingState.errors.length, 1);
        });
    });

    describe('Utilities', () => {
        it('should format bytes correctly', () => {
            assert.strictEqual(extension.formatBytes(0), '0 Bytes');
            assert.strictEqual(extension.formatBytes(1024), '1 KB');
            assert.strictEqual(extension.formatBytes(1048576), '1 MB');
            assert.strictEqual(extension.formatBytes(1073741824), '1 GB');
        });
    });

    describe('Process Files Command', () => {
        beforeEach(() => {
            // Create test files
            fs.writeFileSync(path.join(testDir, 'test1.txt'), 'hello');
            fs.writeFileSync(path.join(testDir, 'test2.txt'), 'world');
        });

        it('should require pattern flag', async () => {
            const result = await extension['process-files']({ flags: {} });
            
            assert.strictEqual(result.success, false);
            assert(result.error.includes('Pattern is required'));
        });

        it('should perform dry run', async () => {
            const pattern = path.join(testDir, '*.txt');
            const result = await extension['process-files']({
                flags: { pattern, 'dry-run': true }
            });

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.files.length, 2);
        });

        it('should process files with operation', async () => {
            const pattern = path.join(testDir, '*.txt');
            const result = await extension['process-files']({
                flags: { pattern, operation: 'uppercase' }
            });

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.summary.processed, 2);
            
            const content = fs.readFileSync(path.join(testDir, 'test1.txt'), 'utf8');
            assert.strictEqual(content, 'HELLO');
        });
    });

    describe('Batch Transform Command', () => {
        beforeEach(() => {
            fs.writeFileSync(path.join(testDir, 'input.txt'), 'test content');
        });

        it('should require input and output', async () => {
            const result = await extension['batch-transform']({ flags: {} });
            
            assert.strictEqual(result.success, false);
        });

        it('should transform files to output directory', async () => {
            const inputPattern = path.join(testDir, '*.txt');
            const outputDir = path.join(testDir, 'output');
            
            const result = await extension['batch-transform']({
                flags: {
                    input: inputPattern,
                    output: outputDir,
                    transform: 'uppercase'
                }
            });

            assert.strictEqual(result.success, true);
            assert(fs.existsSync(path.join(outputDir, 'input.txt')));
            
            const content = fs.readFileSync(path.join(outputDir, 'input.txt'), 'utf8');
            assert.strictEqual(content, 'TEST CONTENT');
        });
    });

    describe('Stream Large File Command', () => {
        it('should require input and output', async () => {
            const result = await extension['stream-large-file']({ flags: {} });
            
            assert.strictEqual(result.success, false);
        });

        it('should handle non-existent input file', async () => {
            const result = await extension['stream-large-file']({
                flags: {
                    input: 'nonexistent.txt',
                    output: 'output.txt'
                }
            });

            assert.strictEqual(result.success, false);
            assert(result.error.includes('not found'));
        });
    });

    describe('Cleanup', () => {
        it('should clean up resources', async () => {
            extension.on('test', () => {});
            assert.strictEqual(extension.listenerCount('test'), 1);
            
            await extension.cleanup();
            assert.strictEqual(extension.listenerCount('test'), 0);
        });
    });
});
