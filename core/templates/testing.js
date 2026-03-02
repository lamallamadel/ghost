const BaseTemplate = require('./base-template');

class TestingTemplate extends BaseTemplate {
    constructor() {
        super({
            id: 'testing',
            name: 'Testing Template',
            description: 'Vitest setup with comprehensive mocking',
            category: 'Testing',
            features: ['Vitest', 'Mocking', 'Coverage', 'Test utilities'],
            prompts: [
                { key: 'framework', question: 'Test framework (vitest/jest): ', default: 'vitest' },
                { key: 'coverage', question: 'Enable coverage reporting (yes/no): ', default: 'yes' },
                { key: 'e2e', question: 'Include E2E tests (yes/no): ', default: 'no' }
            ],
            setup: [
                'npm install',
                'npm test'
            ],
            usage: [
                'npm test',
                'npm run test:watch',
                'npm run test:coverage',
                'npm run test:ui'
            ]
        });
    }

    async generate(outputDir, data) {
        const framework = data.framework || 'vitest';
        const enableCoverage = data.coverage === 'yes';
        const includeE2E = data.e2e === 'yes';

        this._generateManifest(outputDir, data);
        this._generatePackageJson(outputDir, data, framework, enableCoverage, includeE2E);
        this._generateConfig(outputDir, data, framework, enableCoverage);
        this._generateMainFile(outputDir, data);
        this._generateTestFiles(outputDir, data, framework);
        this._generateTestUtilities(outputDir, data, framework);
        this._generateMockHelpers(outputDir, data, framework);
        
        if (includeE2E) {
            this._generateE2ETests(outputDir, data, framework);
        }
        
        this._generateReadme(outputDir, data, framework, enableCoverage, includeE2E);
        this.writeFile(outputDir, '.gitignore', this._generateGitignore());
    }

    _generateManifest(outputDir, data) {
        const manifest = {
            id: data.id,
            name: data.name,
            version: data.version,
            description: data.description,
            author: data.author,
            main: 'index.js',
            capabilities: {
                filesystem: {
                    read: ['**/*'],
                    write: ['test-results/**/*', 'coverage/**/*']
                }
            },
            commands: ['test']
        };

        this.writeFile(outputDir, 'manifest.json', JSON.stringify(manifest, null, 2));
    }

    _generatePackageJson(outputDir, data, framework, enableCoverage, includeE2E) {
        const dependencies = {
            '@ghost/extension-sdk': '^1.0.0'
        };

        const devDependencies = {};

        if (framework === 'vitest') {
            devDependencies['vitest'] = '^1.0.0';
            devDependencies['@vitest/ui'] = '^1.0.0';
            if (enableCoverage) {
                devDependencies['@vitest/coverage-v8'] = '^1.0.0';
            }
        } else {
            devDependencies['jest'] = '^29.0.0';
            if (enableCoverage) {
                devDependencies['jest-coverage'] = '^29.0.0';
            }
        }

        if (includeE2E) {
            devDependencies['@playwright/test'] = '^1.40.0';
        }

        const scripts = {
            test: framework === 'vitest' ? 'vitest run' : 'jest',
            'test:watch': framework === 'vitest' ? 'vitest' : 'jest --watch',
            'test:ui': framework === 'vitest' ? 'vitest --ui' : 'jest --watch',
        };

        if (enableCoverage) {
            scripts['test:coverage'] = framework === 'vitest' 
                ? 'vitest run --coverage' 
                : 'jest --coverage';
        }

        if (includeE2E) {
            scripts['test:e2e'] = 'playwright test';
        }

        const packageJson = {
            name: data.id,
            version: data.version,
            description: data.description,
            main: 'index.js',
            scripts,
            dependencies,
            devDependencies
        };

        this.writeFile(outputDir, 'package.json', JSON.stringify(packageJson, null, 2));
    }

    _generateConfig(outputDir, data, framework, enableCoverage) {
        if (framework === 'vitest') {
            const config = `import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./test/setup.js'],
        ${enableCoverage ? `coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'test/',
                'coverage/',
                '*.config.js'
            ],
            lines: 80,
            functions: 80,
            branches: 80,
            statements: 80
        },` : ''}
        testTimeout: 10000,
        hookTimeout: 10000
    }
});
`;
            this.writeFile(outputDir, 'vitest.config.js', config);
        } else {
            const config = {
                testEnvironment: 'node',
                setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
                testMatch: ['**/test/**/*.test.js'],
                collectCoverageFrom: [
                    '*.js',
                    '!*.config.js',
                    '!coverage/**'
                ],
                coverageThreshold: enableCoverage ? {
                    global: {
                        branches: 80,
                        functions: 80,
                        lines: 80,
                        statements: 80
                    }
                } : undefined
            };

            this.writeFile(outputDir, 'jest.config.json', JSON.stringify(config, null, 2));
        }
    }

    _generateMainFile(outputDir, data) {
        const className = this._toPascalCase(data.id);
        
        const content = `const { ExtensionSDK } = require('@ghost/extension-sdk');

class ${className} {
    constructor() {
        this.sdk = new ExtensionSDK('${data.id}');
    }

    async init(context) {
        console.log('${data.name} initialized');
        this.context = context;
    }

    async test(params) {
        const { args, flags } = params;
        const command = args[0] || 'run';

        switch (command) {
            case 'run':
                return this.runTests(flags);
            case 'watch':
                return this.watchTests(flags);
            case 'coverage':
                return this.runCoverage(flags);
            default:
                return {
                    success: false,
                    error: \`Unknown test command: \${command}\`
                };
        }
    }

    async runTests(flags) {
        console.log('Running tests...');
        
        return {
            success: true,
            output: 'Tests completed'
        };
    }

    async watchTests(flags) {
        console.log('Starting test watcher...');
        
        return {
            success: true,
            output: 'Test watcher started'
        };
    }

    async runCoverage(flags) {
        console.log('Running tests with coverage...');
        
        return {
            success: true,
            output: 'Coverage report generated'
        };
    }

    async cleanup() {
        console.log('${data.name} cleanup');
    }
}

module.exports = ${className};
`;

        this.writeFile(outputDir, 'index.js', content);
    }

    _generateTestFiles(outputDir, data, framework) {
        const className = this._toPascalCase(data.id);
        const testDir = this.createDir(outputDir, 'test');
        
        const setupContent = framework === 'vitest' 
            ? `import { beforeEach, afterEach, vi } from 'vitest';

// Global test setup
beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
});

afterEach(() => {
    // Cleanup after each test
    vi.restoreAllMocks();
});

// Global test utilities
global.mockSDK = () => ({
    requestFileRead: vi.fn(),
    requestFileWrite: vi.fn(),
    requestNetworkCall: vi.fn(),
    requestGitExec: vi.fn()
});
`
            : `// Global test setup
beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
});

afterEach(() => {
    // Cleanup after each test
    jest.restoreAllMocks();
});

// Global test utilities
global.mockSDK = () => ({
    requestFileRead: jest.fn(),
    requestFileWrite: jest.fn(),
    requestNetworkCall: jest.fn(),
    requestGitExec: jest.fn()
});
`;

        this.writeFile(testDir, 'setup.js', setupContent);

        const unitTestContent = framework === 'vitest'
            ? `import { describe, it, expect, beforeEach, vi } from 'vitest';
import Extension from '../index.js';

describe('${className}', () => {
    let extension;

    beforeEach(() => {
        extension = new Extension();
    });

    describe('initialization', () => {
        it('should initialize with context', async () => {
            const context = { name: '${data.name}' };
            await extension.init(context);
            
            expect(extension.context).toEqual(context);
        });

        it('should have SDK instance', () => {
            expect(extension.sdk).toBeDefined();
        });
    });

    describe('test command', () => {
        beforeEach(async () => {
            await extension.init({ name: '${data.name}' });
        });

        it('should run tests', async () => {
            const result = await extension.test({
                args: ['run'],
                flags: {}
            });

            expect(result.success).toBe(true);
            expect(result.output).toContain('completed');
        });

        it('should start test watcher', async () => {
            const result = await extension.test({
                args: ['watch'],
                flags: {}
            });

            expect(result.success).toBe(true);
            expect(result.output).toContain('watcher');
        });

        it('should run coverage', async () => {
            const result = await extension.test({
                args: ['coverage'],
                flags: {}
            });

            expect(result.success).toBe(true);
            expect(result.output).toContain('coverage');
        });

        it('should handle unknown command', async () => {
            const result = await extension.test({
                args: ['invalid'],
                flags: {}
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Unknown');
        });
    });

    describe('cleanup', () => {
        it('should cleanup resources', async () => {
            await extension.init({ name: '${data.name}' });
            await extension.cleanup();
            
            // Verify cleanup (add specific assertions)
            expect(true).toBe(true);
        });
    });
});
`
            : `const Extension = require('../index');

describe('${className}', () => {
    let extension;

    beforeEach(() => {
        extension = new Extension();
    });

    describe('initialization', () => {
        it('should initialize with context', async () => {
            const context = { name: '${data.name}' };
            await extension.init(context);
            
            expect(extension.context).toEqual(context);
        });

        it('should have SDK instance', () => {
            expect(extension.sdk).toBeDefined();
        });
    });

    describe('test command', () => {
        beforeEach(async () => {
            await extension.init({ name: '${data.name}' });
        });

        it('should run tests', async () => {
            const result = await extension.test({
                args: ['run'],
                flags: {}
            });

            expect(result.success).toBe(true);
            expect(result.output).toContain('completed');
        });

        it('should start test watcher', async () => {
            const result = await extension.test({
                args: ['watch'],
                flags: {}
            });

            expect(result.success).toBe(true);
            expect(result.output).toContain('watcher');
        });

        it('should run coverage', async () => {
            const result = await extension.test({
                args: ['coverage'],
                flags: {}
            });

            expect(result.success).toBe(true);
            expect(result.output).toContain('coverage');
        });

        it('should handle unknown command', async () => {
            const result = await extension.test({
                args: ['invalid'],
                flags: {}
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Unknown');
        });
    });

    describe('cleanup', () => {
        it('should cleanup resources', async () => {
            await extension.init({ name: '${data.name}' });
            await extension.cleanup();
            
            // Verify cleanup (add specific assertions)
            expect(true).toBe(true);
        });
    });
});
`;

        this.writeFile(testDir, 'index.test.js', unitTestContent);
    }

    _generateTestUtilities(outputDir, data, framework) {
        const testDir = path.join(outputDir, 'test');
        
        const content = framework === 'vitest'
            ? `import { vi } from 'vitest';

export function createMockSDK(overrides = {}) {
    return {
        requestFileRead: vi.fn().mockResolvedValue('mock content'),
        requestFileWrite: vi.fn().mockResolvedValue({ success: true }),
        requestNetworkCall: vi.fn().mockResolvedValue({ status: 200, body: {} }),
        requestGitExec: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
        ...overrides
    };
}

export function createMockContext(overrides = {}) {
    return {
        name: 'Test Extension',
        config: {},
        ...overrides
    };
}

export function createMockParams(args = [], flags = {}) {
    return {
        args,
        flags,
        subcommand: args[0] || null
    };
}

export async function waitFor(condition, timeout = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        if (await condition()) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(\`Timeout waiting for condition after \${timeout}ms\`);
}

export function mockFileSystem(files = {}) {
    const mockedFs = {
        files: { ...files },
        readFile: vi.fn((path) => {
            if (mockedFs.files[path]) {
                return Promise.resolve(mockedFs.files[path]);
            }
            return Promise.reject(new Error(\`File not found: \${path}\`));
        }),
        writeFile: vi.fn((path, content) => {
            mockedFs.files[path] = content;
            return Promise.resolve();
        }),
        deleteFile: vi.fn((path) => {
            delete mockedFs.files[path];
            return Promise.resolve();
        }),
        listFiles: vi.fn(() => {
            return Promise.resolve(Object.keys(mockedFs.files));
        })
    };
    
    return mockedFs;
}
`
            : `function createMockSDK(overrides = {}) {
    return {
        requestFileRead: jest.fn().mockResolvedValue('mock content'),
        requestFileWrite: jest.fn().mockResolvedValue({ success: true }),
        requestNetworkCall: jest.fn().mockResolvedValue({ status: 200, body: {} }),
        requestGitExec: jest.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
        ...overrides
    };
}

function createMockContext(overrides = {}) {
    return {
        name: 'Test Extension',
        config: {},
        ...overrides
    };
}

function createMockParams(args = [], flags = {}) {
    return {
        args,
        flags,
        subcommand: args[0] || null
    };
}

async function waitFor(condition, timeout = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        if (await condition()) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(\`Timeout waiting for condition after \${timeout}ms\`);
}

function mockFileSystem(files = {}) {
    const mockedFs = {
        files: { ...files },
        readFile: jest.fn((path) => {
            if (mockedFs.files[path]) {
                return Promise.resolve(mockedFs.files[path]);
            }
            return Promise.reject(new Error(\`File not found: \${path}\`));
        }),
        writeFile: jest.fn((path, content) => {
            mockedFs.files[path] = content;
            return Promise.resolve();
        }),
        deleteFile: jest.fn((path) => {
            delete mockedFs.files[path];
            return Promise.resolve();
        }),
        listFiles: jest.fn(() => {
            return Promise.resolve(Object.keys(mockedFs.files));
        })
    };
    
    return mockedFs;
}

module.exports = {
    createMockSDK,
    createMockContext,
    createMockParams,
    waitFor,
    mockFileSystem
};
`;

        this.writeFile(testDir, 'utils.js', content);
    }

    _generateMockHelpers(outputDir, data, framework) {
        const testDir = path.join(outputDir, 'test');
        const mocksDir = this.createDir(testDir, 'mocks');
        
        const content = framework === 'vitest'
            ? `import { vi } from 'vitest';

export const mockNetworkResponses = {
    success: {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { success: true, data: {} }
    },
    error: {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'content-type': 'application/json' },
        body: { success: false, error: 'Server error' }
    },
    notFound: {
        status: 404,
        statusText: 'Not Found',
        headers: { 'content-type': 'application/json' },
        body: { success: false, error: 'Not found' }
    }
};

export const mockGitResponses = {
    status: {
        stdout: 'M  file1.js\\nA  file2.js\\n',
        stderr: '',
        exitCode: 0
    },
    branch: {
        stdout: 'main\\n',
        stderr: '',
        exitCode: 0
    },
    log: {
        stdout: 'abc123|feat: add feature\\ndef456|fix: bug fix\\n',
        stderr: '',
        exitCode: 0
    }
};

export const mockFileContents = {
    'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }, null, 2),
    'README.md': '# Test Project\\n\\nThis is a test.',
    '.gitignore': 'node_modules/\\ndist/\\n'
};

export function setupNetworkMock(sdk, response = mockNetworkResponses.success) {
    sdk.requestNetworkCall.mockResolvedValue(response);
}

export function setupGitMock(sdk, command, response) {
    sdk.requestGitExec.mockImplementation((params) => {
        if (params.command === command) {
            return Promise.resolve(response);
        }
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
    });
}

export function setupFileMock(sdk, files = mockFileContents) {
    sdk.requestFileRead.mockImplementation((params) => {
        const content = files[params.path];
        if (content !== undefined) {
            return Promise.resolve(content);
        }
        return Promise.reject(new Error(\`File not found: \${params.path}\`));
    });
}
`
            : `const mockNetworkResponses = {
    success: {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { success: true, data: {} }
    },
    error: {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'content-type': 'application/json' },
        body: { success: false, error: 'Server error' }
    },
    notFound: {
        status: 404,
        statusText: 'Not Found',
        headers: { 'content-type': 'application/json' },
        body: { success: false, error: 'Not found' }
    }
};

const mockGitResponses = {
    status: {
        stdout: 'M  file1.js\\nA  file2.js\\n',
        stderr: '',
        exitCode: 0
    },
    branch: {
        stdout: 'main\\n',
        stderr: '',
        exitCode: 0
    },
    log: {
        stdout: 'abc123|feat: add feature\\ndef456|fix: bug fix\\n',
        stderr: '',
        exitCode: 0
    }
};

const mockFileContents = {
    'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }, null, 2),
    'README.md': '# Test Project\\n\\nThis is a test.',
    '.gitignore': 'node_modules/\\ndist/\\n'
};

function setupNetworkMock(sdk, response = mockNetworkResponses.success) {
    sdk.requestNetworkCall.mockResolvedValue(response);
}

function setupGitMock(sdk, command, response) {
    sdk.requestGitExec.mockImplementation((params) => {
        if (params.command === command) {
            return Promise.resolve(response);
        }
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
    });
}

function setupFileMock(sdk, files = mockFileContents) {
    sdk.requestFileRead.mockImplementation((params) => {
        const content = files[params.path];
        if (content !== undefined) {
            return Promise.resolve(content);
        }
        return Promise.reject(new Error(\`File not found: \${params.path}\`));
    });
}

module.exports = {
    mockNetworkResponses,
    mockGitResponses,
    mockFileContents,
    setupNetworkMock,
    setupGitMock,
    setupFileMock
};
`;

        this.writeFile(mocksDir, 'index.js', content);
    }

    _generateE2ETests(outputDir, data, framework) {
        const e2eDir = this.createDir(outputDir, 'e2e');
        
        const playwrightConfig = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        trace: 'on-first-retry',
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
`;

        this.writeFile(outputDir, 'playwright.config.js', playwrightConfig);

        const e2eTestContent = `import { test, expect } from '@playwright/test';

test.describe('${data.name} E2E', () => {
    test('should initialize extension', async ({ page }) => {
        // Add E2E test implementation
        expect(true).toBe(true);
    });
});
`;

        this.writeFile(e2eDir, 'extension.spec.js', e2eTestContent);
    }

    _generateReadme(outputDir, data, framework, enableCoverage, includeE2E) {
        const readme = `# ${data.name}

${data.description}

## Features

- ${framework === 'vitest' ? 'Vitest' : 'Jest'} test framework
- ${enableCoverage ? '✓' : '✗'} Code coverage reporting
- ${includeE2E ? '✓' : '✗'} E2E testing with Playwright
- Comprehensive mock helpers
- Test utilities and fixtures
- Watch mode for development

## Installation

\`\`\`bash
npm install
\`\`\`

## Running Tests

### Unit Tests

\`\`\`bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Interactive UI (Vitest only)
${framework === 'vitest' ? 'npm run test:ui' : '# Not available with Jest'}
\`\`\`

${enableCoverage ? `### Coverage

\`\`\`bash
npm run test:coverage
\`\`\`

Coverage reports are generated in the \`coverage/\` directory.

` : ''}${includeE2E ? `### E2E Tests

\`\`\`bash
npm run test:e2e
\`\`\`

` : ''}## Test Structure

\`\`\`
test/
├── setup.js              # Global test setup
├── utils.js              # Test utilities
├── mocks/
│   └── index.js          # Mock helpers
└── *.test.js             # Test files
${includeE2E ? `
e2e/
└── *.spec.js             # E2E test files
` : ''}
\`\`\`

## Writing Tests

### Basic Test

\`\`\`javascript
${framework === 'vitest' 
    ? "import { describe, it, expect } from 'vitest';" 
    : "const { describe, it, expect } = require('@jest/globals');"}

describe('Feature', () => {
    it('should work', () => {
        expect(true).toBe(true);
    });
});
\`\`\`

### Using Mock Helpers

\`\`\`javascript
${framework === 'vitest' 
    ? "import { setupNetworkMock, mockNetworkResponses } from './test/mocks';" 
    : "const { setupNetworkMock, mockNetworkResponses } = require('./test/mocks');"}

it('should handle API response', async () => {
    const sdk = createMockSDK();
    setupNetworkMock(sdk, mockNetworkResponses.success);
    
    const result = await sdk.requestNetworkCall({ url: 'https://api.example.com' });
    expect(result.status).toBe(200);
});
\`\`\`

### Using Test Utilities

\`\`\`javascript
${framework === 'vitest' 
    ? "import { waitFor, mockFileSystem } from './test/utils';" 
    : "const { waitFor, mockFileSystem } = require('./test/utils');"}

it('should wait for condition', async () => {
    let flag = false;
    setTimeout(() => flag = true, 100);
    
    await waitFor(() => flag);
    expect(flag).toBe(true);
});
\`\`\`

## Mock Helpers

The template includes comprehensive mocking utilities:

- **Network Mocks**: Pre-configured HTTP responses
- **Git Mocks**: Mock git command outputs
- **File System Mocks**: In-memory file system for testing
- **SDK Mocks**: Complete Ghost SDK mock implementations

## Configuration

### ${framework === 'vitest' ? 'Vitest' : 'Jest'} Configuration

${framework === 'vitest' ? 'See `vitest.config.js`' : 'See `jest.config.json`'} for test configuration options.

${enableCoverage ? `### Coverage Thresholds

Current coverage thresholds:
- Lines: 80%
- Functions: 80%
- Branches: 80%
- Statements: 80%

` : ''}## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Mock External Dependencies**: Use provided mock helpers
3. **Descriptive Names**: Use clear test descriptions
4. **Arrange-Act-Assert**: Follow the AAA pattern
5. **Coverage**: Aim for high coverage but focus on meaningful tests

## Extension Usage

\`\`\`bash
ghost extension install .
ghost test run
\`\`\`

## License

MIT
`;

        this.writeFile(outputDir, 'README.md', readme);
    }
}

const path = require('path');
module.exports = TestingTemplate;
