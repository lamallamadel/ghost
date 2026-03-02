const BaseTemplate = require('./base-template');

class ApiIntegrationTemplate extends BaseTemplate {
    constructor() {
        super({
            id: 'api-integration',
            name: 'API Integration',
            description: 'REST/GraphQL client with authentication',
            category: 'API',
            features: ['REST client', 'GraphQL support', 'Auth handling', 'Rate limiting'],
            prompts: [
                { key: 'apiType', question: 'API type (rest/graphql): ', default: 'rest' },
                { key: 'baseUrl', question: 'API base URL: ', default: 'https://api.example.com' },
                { key: 'authType', question: 'Auth type (none/bearer/apikey/oauth): ', default: 'bearer' }
            ],
            setup: [
                'npm install',
                'cp .env.example .env',
                'Edit .env with your API credentials'
            ],
            usage: [
                'ghost api get /users',
                'ghost api post /users --data \'{"name":"John"}\'',
                'ghost api graphql --query \'{ users { name } }\''
            ]
        });
    }

    async generate(outputDir, data) {
        const apiType = data.apiType || 'rest';
        const baseUrl = data.baseUrl || 'https://api.example.com';
        const authType = data.authType || 'bearer';

        this._generateManifest(outputDir, data, baseUrl);
        this._generatePackageJson(outputDir, data, apiType);
        this._generateMainFile(outputDir, data, apiType, baseUrl, authType);
        this._generateConfigFiles(outputDir, data, apiType, baseUrl, authType);
        this._generateReadme(outputDir, data, apiType, baseUrl, authType);
        this.writeFile(outputDir, '.gitignore', this._generateGitignore());
    }

    _generateManifest(outputDir, data, baseUrl) {
        const url = new URL(baseUrl);
        const manifest = {
            id: data.id,
            name: data.name,
            version: data.version,
            description: data.description,
            author: data.author,
            main: 'index.js',
            capabilities: {
                network: {
                    allowlist: [url.origin],
                    rateLimit: {
                        cir: 60,
                        bc: 100
                    }
                }
            },
            commands: ['api']
        };

        this.writeFile(outputDir, 'manifest.json', JSON.stringify(manifest, null, 2));
    }

    _generatePackageJson(outputDir, data, apiType) {
        const dependencies = apiType === 'graphql' 
            ? { 'graphql-request': '^6.0.0' }
            : { 'axios': '^1.6.0' };

        const packageJson = {
            name: data.id,
            version: data.version,
            description: data.description,
            main: 'index.js',
            scripts: {
                test: 'jest',
                'test:watch': 'jest --watch'
            },
            dependencies,
            devDependencies: {
                jest: '^29.0.0',
                'dotenv': '^16.0.0'
            }
        };

        this.writeFile(outputDir, 'package.json', JSON.stringify(packageJson, null, 2));
    }

    _generateMainFile(outputDir, data, apiType, baseUrl, authType) {
        const className = this._toPascalCase(data.id);
        
        const content = `const { ExtensionSDK } = require('@ghost/extension-sdk');
${apiType === 'graphql' ? "const { GraphQLClient } = require('graphql-request');" : "const axios = require('axios');"}

class ${className} {
    constructor() {
        this.sdk = new ExtensionSDK('${data.id}');
        this.baseUrl = process.env.API_BASE_URL || '${baseUrl}';
        ${authType !== 'none' ? "this.authToken = process.env.API_TOKEN || '';" : ''}
        ${apiType === 'graphql' ? 'this.client = null;' : 'this.axiosInstance = null;'}
    }

    async init(context) {
        console.log('${data.name} initialized');
        this.context = context;
        
        ${apiType === 'graphql' ? this._generateGraphQLInit(authType) : this._generateRestInit(authType)}
    }

    async api(params) {
        const { args, flags } = params;
        const operation = args[0]; // get, post, put, delete, graphql
        
        if (!operation) {
            return {
                success: false,
                error: 'Usage: ghost api <operation> [options]'
            };
        }

        try {
            ${apiType === 'graphql' ? this._generateGraphQLHandler() : this._generateRestHandler()}
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    ${this._generateAuthMethod(authType)}

    async cleanup() {
        console.log('${data.name} cleanup');
    }
}

module.exports = ${className};
`;

        this.writeFile(outputDir, 'index.js', content);
    }

    _generateGraphQLInit(authType) {
        if (authType === 'none') {
            return `this.client = new GraphQLClient(this.baseUrl);`;
        }
        return `const headers = this.getAuthHeaders();
        this.client = new GraphQLClient(this.baseUrl, { headers });`;
    }

    _generateRestInit(authType) {
        if (authType === 'none') {
            return `this.axiosInstance = axios.create({
            baseURL: this.baseUrl,
            headers: { 'Content-Type': 'application/json' }
        });`;
        }
        return `this.axiosInstance = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
                ...this.getAuthHeaders()
            }
        });`;
    }

    _generateGraphQLHandler() {
        return `if (operation === 'graphql') {
                const query = flags.query || args[1];
                const variables = flags.variables ? JSON.parse(flags.variables) : {};
                
                const data = await this.client.request(query, variables);
                
                return {
                    success: true,
                    output: JSON.stringify(data, null, 2)
                };
            } else {
                return {
                    success: false,
                    error: 'Only graphql operation is supported in GraphQL mode'
                };
            }`;
    }

    _generateRestHandler() {
        return `const endpoint = args[1];
            let response;
            
            switch (operation.toLowerCase()) {
                case 'get':
                    response = await this.axiosInstance.get(endpoint);
                    break;
                    
                case 'post':
                    const postData = flags.data ? JSON.parse(flags.data) : {};
                    response = await this.axiosInstance.post(endpoint, postData);
                    break;
                    
                case 'put':
                    const putData = flags.data ? JSON.parse(flags.data) : {};
                    response = await this.axiosInstance.put(endpoint, putData);
                    break;
                    
                case 'delete':
                    response = await this.axiosInstance.delete(endpoint);
                    break;
                    
                default:
                    return {
                        success: false,
                        error: \`Unknown operation: \${operation}\`
                    };
            }
            
            return {
                success: true,
                output: JSON.stringify(response.data, null, 2)
            };`;
    }

    _generateAuthMethod(authType) {
        switch (authType) {
            case 'bearer':
                return `getAuthHeaders() {
        return {
            'Authorization': \`Bearer \${this.authToken}\`
        };
    }`;
            case 'apikey':
                return `getAuthHeaders() {
        return {
            'X-API-Key': this.authToken
        };
    }`;
            case 'oauth':
                return `getAuthHeaders() {
        // TODO: Implement OAuth token refresh logic
        return {
            'Authorization': \`Bearer \${this.authToken}\`
        };
    }`;
            default:
                return `getAuthHeaders() {
        return {};
    }`;
        }
    }

    _generateConfigFiles(outputDir, data, apiType, baseUrl, authType) {
        const envExample = authType !== 'none'
            ? `API_BASE_URL=${baseUrl}
API_TOKEN=your_token_here
`
            : `API_BASE_URL=${baseUrl}
`;

        this.writeFile(outputDir, '.env.example', envExample);

        const jestConfig = {
            testEnvironment: 'node',
            coverageDirectory: 'coverage',
            collectCoverageFrom: ['index.js'],
            testMatch: ['**/test/**/*.test.js']
        };

        this.writeFile(outputDir, 'jest.config.json', JSON.stringify(jestConfig, null, 2));
    }

    _generateReadme(outputDir, data, apiType, baseUrl, authType) {
        const readme = `# ${data.name}

${data.description}

## Features

- ${apiType === 'graphql' ? 'GraphQL' : 'REST'} API integration
- ${authType !== 'none' ? `${authType.toUpperCase()} authentication` : 'No authentication required'}
- Rate limiting support
- Error handling

## Installation

\`\`\`bash
npm install
cp .env.example .env
# Edit .env with your API credentials
ghost extension install .
\`\`\`

## Configuration

Edit \`.env\` file:

\`\`\`
API_BASE_URL=${baseUrl}
${authType !== 'none' ? 'API_TOKEN=your_token_here' : ''}
\`\`\`

## Usage

${apiType === 'graphql' ? `### GraphQL Queries

\`\`\`bash
ghost api graphql --query '{ users { id name email } }'
ghost api graphql --query 'mutation { createUser(name: "John") { id } }'
\`\`\`
` : `### REST API Calls

\`\`\`bash
# GET request
ghost api get /users

# POST request
ghost api post /users --data '{"name":"John","email":"john@example.com"}'

# PUT request
ghost api put /users/1 --data '{"name":"Jane"}'

# DELETE request
ghost api delete /users/1
\`\`\`
`}

## Testing

\`\`\`bash
npm test
npm run test:watch
\`\`\`

## License

MIT
`;

        this.writeFile(outputDir, 'README.md', readme);
    }
}

module.exports = ApiIntegrationTemplate;
