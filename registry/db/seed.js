const path = require('path');
const { RegistryDatabase } = require('./database');
const { ExtensionRegistry } = require('../api/registry');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'registry.db');

const db = new RegistryDatabase(DB_PATH);
db.initialize();

const registry = new ExtensionRegistry(db);

const sampleExtensions = [
    {
        id: 'ai-commit-helper',
        name: 'AI Commit Helper',
        version: '2.1.0',
        description: 'Generates intelligent commit messages using AI models based on staged changes',
        author: 'Ghost Team',
        author_email: 'team@ghost-cli.dev',
        category: 'git',
        homepage: 'https://github.com/ghost/ai-commit-helper',
        repository: 'https://github.com/ghost/ai-commit-helper.git',
        license: 'MIT',
        tags: ['ai', 'git', 'commit', 'automation'],
        manifest: {
            id: 'ai-commit-helper',
            name: 'AI Commit Helper',
            version: '2.1.0',
            main: 'index.js',
            capabilities: {
                filesystem: { read: ['**/*'], write: [] },
                network: {
                    allowlist: ['https://api.openai.com', 'https://api.anthropic.com'],
                    rateLimit: { cir: 30, bc: 50, be: 20 }
                },
                git: { read: true, write: false }
            }
        },
        tarball_url: '/packages/ai-commit-helper-2.1.0.tar.gz',
        tarball_hash: 'abc123def456',
        readme: '# AI Commit Helper\n\nGenerates intelligent commit messages using AI.'
    },
    {
        id: 'code-review-assistant',
        name: 'Code Review Assistant',
        version: '1.5.2',
        description: 'Automated code review with best practices checking, security scanning, and style enforcement',
        author: 'DevTools Contributors',
        author_email: 'devtools@example.com',
        category: 'development',
        homepage: 'https://github.com/devtools/code-review',
        repository: 'https://github.com/devtools/code-review.git',
        license: 'MIT',
        tags: ['review', 'quality', 'security', 'linting'],
        manifest: {
            id: 'code-review-assistant',
            name: 'Code Review Assistant',
            version: '1.5.2',
            main: 'index.js',
            capabilities: {
                filesystem: {
                    read: ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx'],
                    write: ['reports/**']
                },
                network: {
                    allowlist: ['https://api.sonarqube.com'],
                    rateLimit: { cir: 20, bc: 30, be: 10 }
                },
                git: { read: true, write: false }
            }
        },
        tarball_url: '/packages/code-review-assistant-1.5.2.tar.gz',
        tarball_hash: 'def789ghi012',
        readme: '# Code Review Assistant\n\nAutomated code review tool.'
    },
    {
        id: 'dependency-scanner',
        name: 'Dependency Security Scanner',
        version: '3.2.1',
        description: 'Scans project dependencies for known vulnerabilities and license compliance issues',
        author: 'Security Tools Inc',
        author_email: 'security@tools.com',
        category: 'security',
        homepage: 'https://github.com/sectools/dep-scanner',
        repository: 'https://github.com/sectools/dep-scanner.git',
        license: 'MIT',
        tags: ['security', 'dependencies', 'vulnerabilities', 'npm'],
        manifest: {
            id: 'dependency-scanner',
            name: 'Dependency Security Scanner',
            version: '3.2.1',
            main: 'index.js',
            capabilities: {
                filesystem: {
                    read: ['**/package.json', '**/package-lock.json', '**/yarn.lock'],
                    write: ['security-reports/**']
                },
                network: {
                    allowlist: ['https://registry.npmjs.org', 'https://nvd.nist.gov'],
                    rateLimit: { cir: 60, bc: 100, be: 50 }
                },
                git: { read: true, write: false }
            }
        },
        tarball_url: '/packages/dependency-scanner-3.2.1.tar.gz',
        tarball_hash: 'ghi345jkl678',
        readme: '# Dependency Scanner\n\nScans for security vulnerabilities.'
    }
];

console.log('Seeding database...\n');

for (const ext of sampleExtensions) {
    try {
        const result = registry.publishExtension(ext);
        console.log(`✓ Published ${ext.id} v${ext.version} (${result.created ? 'new' : 'update'})`);
        
        registry.submitRating(ext.id, 'user1', 5);
        registry.submitRating(ext.id, 'user2', 4);
        registry.submitRating(ext.id, 'user3', 5);
        
        registry.submitReview({
            extension_id: ext.id,
            user_id: 'user1',
            rating: 5,
            title: 'Excellent extension!',
            comment: 'This extension has saved me so much time. Highly recommended!',
            verified_purchase: true
        });
        
        for (let i = 0; i < 10; i++) {
            registry.recordDownload(ext.id, ext.version, {
                ip: `192.168.1.${i}`,
                userAgent: 'Ghost CLI/1.0.0',
                country: 'US'
            });
        }
        
        console.log(`  Added 3 ratings, 1 review, and 10 downloads`);
        
    } catch (error) {
        console.error(`✗ Failed to publish ${ext.id}:`, error.message);
    }
}

console.log('\n✓ Database seeded successfully');

db.close();
