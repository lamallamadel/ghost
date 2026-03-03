/**
 * Template Fixtures for E2E Testing
 * 
 * Provides pre-built extension templates and manifests for testing
 * the complete extension workflow from scaffolding to installation.
 */

const fs = require('fs');
const path = require('path');

/**
 * API Integration Template Fixture
 */
const apiIntegrationTemplate = {
  manifest: {
    id: 'api-integration-test',
    name: 'API Integration Test',
    version: '1.0.0',
    description: 'REST/GraphQL client with authentication for testing',
    author: 'Test Suite',
    main: 'index.js',
    capabilities: {
      network: {
        allowlist: ['https://api.example.com', 'https://api.github.com'],
        rateLimit: {
          cir: 60,
          bc: 100,
          be: 150
        }
      },
      filesystem: {
        read: ['config/*.json', '.env']
      }
    },
    commands: ['api', 'api-config']
  },
  
  indexJs: `const { ExtensionSDK, IntentBuilder } = require('@ghost/extension-sdk');

class ApiIntegrationTest {
  constructor() {
    this.sdk = new ExtensionSDK('api-integration-test');
    this.intentBuilder = new IntentBuilder('api-integration-test');
    this.baseUrl = 'https://api.example.com';
  }

  async init(context) {
    console.log('API Integration Test initialized');
    this.context = context;
  }

  async api(params) {
    const { args, flags } = params;
    const endpoint = args[0];
    const method = flags.method || 'GET';
    
    try {
      const intent = this.intentBuilder.network('request', {
        url: this.baseUrl + endpoint,
        method: method
      });
      
      return {
        success: true,
        output: \`API request to \${endpoint} executed successfully\`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async apiConfig(params) {
    const { flags } = params;
    
    if (flags.baseUrl) {
      this.baseUrl = flags.baseUrl;
    }
    
    return {
      success: true,
      output: \`API base URL set to: \${this.baseUrl}\`
    };
  }

  async cleanup() {
    console.log('API Integration Test cleanup');
  }
}

module.exports = ApiIntegrationTest;
`,

  packageJson: {
    name: 'api-integration-test',
    version: '1.0.0',
    description: 'API Integration Test Extension',
    main: 'index.js',
    dependencies: {
      '@ghost/extension-sdk': '^1.0.0'
    }
  },

  readme: `# API Integration Test Extension

Test extension for API integration workflows.

## Installation

\`\`\`bash
ghost extension install .
\`\`\`

## Usage

\`\`\`bash
ghost api /users --method GET
ghost api-config --baseUrl https://api.example.com
\`\`\`
`
};

/**
 * File Processor Template Fixture
 */
const fileProcessorTemplate = {
  manifest: {
    id: 'file-processor-test',
    name: 'File Processor Test',
    version: '1.0.0',
    description: 'Batch file operations with progress tracking for testing',
    author: 'Test Suite',
    main: 'index.js',
    capabilities: {
      filesystem: {
        read: ['**/*.js', '**/*.md', '**/*.json'],
        write: ['dist/**/*', 'output/**/*']
      }
    },
    commands: ['process', 'analyze']
  },

  indexJs: `const { ExtensionSDK, IntentBuilder } = require('@ghost/extension-sdk');

class FileProcessorTest {
  constructor() {
    this.sdk = new ExtensionSDK('file-processor-test');
    this.intentBuilder = new IntentBuilder('file-processor-test');
  }

  async init(context) {
    console.log('File Processor Test initialized');
    this.context = context;
  }

  async process(params) {
    const { args, flags } = params;
    const sourceDir = args[0] || './src';
    const outputDir = args[1] || './dist';
    
    console.log(\`Processing files from \${sourceDir} to \${outputDir}\`);
    
    return {
      success: true,
      output: \`Processed files from \${sourceDir} to \${outputDir}\`
    };
  }

  async analyze(params) {
    const { args, flags } = params;
    const targetDir = args[0] || './src';
    
    console.log(\`Analyzing files in \${targetDir}\`);
    
    return {
      success: true,
      output: \`Analysis complete for \${targetDir}\`
    };
  }

  async cleanup() {
    console.log('File Processor Test cleanup');
  }
}

module.exports = FileProcessorTest;
`,

  packageJson: {
    name: 'file-processor-test',
    version: '1.0.0',
    description: 'File Processor Test Extension',
    main: 'index.js',
    dependencies: {
      '@ghost/extension-sdk': '^1.0.0'
    }
  },

  readme: `# File Processor Test Extension

Test extension for file processing workflows.

## Installation

\`\`\`bash
ghost extension install .
\`\`\`

## Usage

\`\`\`bash
ghost process src dist
ghost analyze src
\`\`\`
`
};

/**
 * Git Workflow Template Fixture
 */
const gitWorkflowTemplate = {
  manifest: {
    id: 'git-workflow-test',
    name: 'Git Workflow Test',
    version: '1.0.0',
    description: 'Git hooks and workflow automation for testing',
    author: 'Test Suite',
    main: 'index.js',
    capabilities: {
      git: {
        read: true,
        write: false
      },
      filesystem: {
        read: ['.git/**/*', '.gitignore']
      }
    },
    hooks: ['pre-commit', 'commit-msg'],
    commands: ['validate-commit', 'install-hooks']
  },

  indexJs: `const { ExtensionSDK } = require('@ghost/extension-sdk');

class GitWorkflowTest {
  constructor() {
    this.sdk = new ExtensionSDK('git-workflow-test');
  }

  async init(context) {
    console.log('Git Workflow Test initialized');
    this.context = context;
  }

  async preCommit(params) {
    console.log('Running pre-commit hook');
    return { success: true };
  }

  async commitMsg(params) {
    console.log('Validating commit message');
    return { success: true };
  }

  async validateCommit(params) {
    return {
      success: true,
      output: 'Commit validation passed'
    };
  }

  async installHooks(params) {
    return {
      success: true,
      output: 'Git hooks installed'
    };
  }

  async cleanup() {
    console.log('Git Workflow Test cleanup');
  }
}

module.exports = GitWorkflowTest;
`,

  packageJson: {
    name: 'git-workflow-test',
    version: '1.0.0',
    description: 'Git Workflow Test Extension',
    main: 'index.js',
    dependencies: {
      '@ghost/extension-sdk': '^1.0.0'
    }
  }
};

/**
 * Invalid/Test Case Fixtures
 */
const invalidFixtures = {
  missingRequiredFields: {
    id: 'incomplete-test',
    name: 'Incomplete Test'
  },

  invalidGlobPattern: {
    id: 'invalid-glob-test',
    name: 'Invalid Glob Test',
    version: '1.0.0',
    main: 'index.js',
    capabilities: {
      filesystem: {
        read: ['**[invalid', '*.{js,ts}[']
      }
    }
  },

  invalidNetworkUrl: {
    id: 'invalid-network-test',
    name: 'Invalid Network Test',
    version: '1.0.0',
    main: 'index.js',
    capabilities: {
      network: {
        allowlist: ['not-a-valid-url', 'http://']
      }
    }
  },

  missingRateLimitFields: {
    id: 'invalid-ratelimit-test',
    name: 'Invalid Rate Limit Test',
    version: '1.0.0',
    main: 'index.js',
    capabilities: {
      network: {
        allowlist: ['https://api.example.com'],
        rateLimit: {
          cir: 60
        }
      }
    }
  }
};

/**
 * Registry Mock Data
 */
const registryMockData = {
  extensions: [
    {
      id: 'api-integration-test',
      name: 'API Integration Test',
      version: '1.0.0',
      description: 'Test API integration extension',
      author: 'Test Suite',
      category: 'API',
      downloadUrl: 'mock://registry/api-integration-test-1.0.0.tgz',
      checksum: 'sha256:abc123def456',
      size: 1024,
      published: '2024-01-01T00:00:00.000Z',
      downloads: 100
    },
    {
      id: 'file-processor-test',
      name: 'File Processor Test',
      version: '1.0.0',
      description: 'Test file processor extension',
      author: 'Test Suite',
      category: 'Utilities',
      downloadUrl: 'mock://registry/file-processor-test-1.0.0.tgz',
      checksum: 'sha256:def456ghi789',
      size: 2048,
      published: '2024-01-01T00:00:00.000Z',
      downloads: 50
    },
    {
      id: 'git-workflow-test',
      name: 'Git Workflow Test',
      version: '1.0.0',
      description: 'Test git workflow extension',
      author: 'Test Suite',
      category: 'Git',
      downloadUrl: 'mock://registry/git-workflow-test-1.0.0.tgz',
      checksum: 'sha256:ghi789jkl012',
      size: 1536,
      published: '2024-01-01T00:00:00.000Z',
      downloads: 75
    }
  ]
};

function scaffoldTemplate(template, outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify(template.manifest, null, 2)
  );

  fs.writeFileSync(
    path.join(outputDir, 'index.js'),
    template.indexJs
  );

  if (template.packageJson) {
    fs.writeFileSync(
      path.join(outputDir, 'package.json'),
      JSON.stringify(template.packageJson, null, 2)
    );
  }

  if (template.readme) {
    fs.writeFileSync(
      path.join(outputDir, 'README.md'),
      template.readme
    );
  }

  const gitignore = `node_modules/
dist/
*.log
.env
`;
  fs.writeFileSync(path.join(outputDir, '.gitignore'), gitignore);

  return outputDir;
}

function createSdkMock(extensionDir) {
  const sdkPath = path.join(extensionDir, 'node_modules', '@ghost', 'extension-sdk');
  fs.mkdirSync(sdkPath, { recursive: true });

  const mockSdk = `
class ExtensionSDK {
  constructor(extensionId) {
    this.extensionId = extensionId;
  }

  async requestFileRead(params) {
    return 'mock file content';
  }

  async requestFileWrite(params) {
    return { success: true };
  }

  async requestNetworkCall(params) {
    return { success: true, data: {} };
  }

  async requestGitExec(params) {
    return { success: true, output: '' };
  }
}

class IntentBuilder {
  constructor(extensionId) {
    this.extensionId = extensionId;
  }

  filesystem(operation, params) {
    return { type: 'filesystem', operation, params };
  }

  network(operation, params) {
    return { type: 'network', operation, params };
  }

  git(operation, params) {
    return { type: 'git', operation, params };
  }
}

class RPCClient {
  constructor(extensionId) {
    this.extensionId = extensionId;
  }

  async call(method, params) {
    return { success: true };
  }
}

module.exports = { ExtensionSDK, IntentBuilder, RPCClient };
`;

  fs.writeFileSync(path.join(sdkPath, 'index.js'), mockSdk);

  const packageJson = {
    name: '@ghost/extension-sdk',
    version: '1.0.0',
    main: 'index.js'
  };

  fs.writeFileSync(
    path.join(sdkPath, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  return sdkPath;
}

module.exports = {
  apiIntegrationTemplate,
  fileProcessorTemplate,
  gitWorkflowTemplate,
  invalidFixtures,
  registryMockData,
  scaffoldTemplate,
  createSdkMock
};
