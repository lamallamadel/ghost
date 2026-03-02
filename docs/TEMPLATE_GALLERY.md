# Ghost CLI Extension Template Gallery

Complete guide to the extension template gallery system.

## Overview

The Ghost CLI Extension Template Gallery provides pre-built, production-ready templates for common extension patterns. Each template includes:

- ✅ Fully-implemented, commented code
- ✅ Comprehensive README with examples
- ✅ Complete test suite
- ✅ Best practices baked in
- ✅ Ready to customize

## Quick Start

### Interactive Mode (Recommended)

```bash
ghost extension init
```

Features:
- Browse all templates with descriptions
- Preview template capabilities and code
- Interactive prompts for extension details
- Automatic project scaffolding

### Direct Template Selection

```bash
ghost extension init my-extension --template <template-name>
```

Available template names:
- `api-integration`
- `file-processor`
- `git-workflow`
- `testing`
- `basic`
- `typescript`
- `advanced`

## Template Catalog

### 1. API Integration Template

**ID:** `api-integration`

**Purpose:** Building REST/GraphQL API clients and integrations

**Features:**
- Multiple authentication methods (Bearer, API Key, Basic)
- Automatic retry with exponential backoff
- Rate limit detection and handling
- Response caching with configurable TTL
- GraphQL query support
- Request/response sanitization
- Error recovery

**Included Commands:**
- `api-call` - Make HTTP requests
- `api-config` - Configure authentication and settings

**Example Usage:**
```bash
ghost extension init github-api --template api-integration
cd github-api
npm install
ghost api-config --set-token YOUR_TOKEN
ghost api-call --url https://api.github.com/user
```

**Best For:**
- Third-party API integrations
- Webhook consumers
- External service connectors
- API client libraries

**Test Coverage:** 100%
**LOC:** ~500

---

### 2. File Processor Template

**ID:** `file-processor`

**Purpose:** Batch file operations and transformations

**Features:**
- Concurrent batch processing
- Real-time progress events
- Streaming for large files (>100MB)
- Glob pattern matching
- Recursive directory traversal
- Error recovery per file
- Multiple transform operations

**Included Commands:**
- `process-files` - Batch process files
- `batch-transform` - Transform and copy files
- `stream-large-file` - Stream process large files

**Example Usage:**
```bash
ghost extension init build-tool --template file-processor
cd build-tool
npm install
ghost process-files --pattern "src/**/*.js" --operation minify
ghost batch-transform --input "src/**/*.ts" --output dist/
```

**Best For:**
- Build tools
- Code generators
- File format converters
- Log processors
- Image/media tools

**Test Coverage:** 95%
**LOC:** ~600

---

### 3. Git Workflow Template

**ID:** `git-workflow`

**Purpose:** Git automation and workflow enforcement

**Features:**
- Git hooks installation/management
- Branch naming validation
- Conventional commit enforcement
- Protected branch prevention
- Pre-commit/pre-push checks
- Custom hook templates

**Included Commands:**
- `install-hooks` - Install Git hooks
- `validate-branch` - Validate branch names
- `validate-commit` - Validate commit messages
- `enforce-conventional` - Configure conventional commits

**Example Usage:**
```bash
ghost extension init team-standards --template git-workflow
cd team-standards
npm install
ghost install-hooks --all
ghost enforce-conventional --enable --strict
```

**Best For:**
- Team workflow standardization
- Quality gates
- Release automation
- Code review helpers
- CI/CD integration

**Test Coverage:** 90%
**LOC:** ~500

---

### 4. Testing Template

**ID:** `testing`

**Purpose:** Extension testing infrastructure

**Features:**
- Vitest test runner integration
- Mock RPC client for pipeline testing
- Coverage reporting (HTML, JSON, LCOV)
- Integration test examples
- Test scenarios (success, error, timeout)
- CI/CD examples

**Included Commands:**
- `run-tests` - Execute test suite
- `generate-coverage` - Generate coverage reports
- `mock-test` - Run mock scenarios

**Example Usage:**
```bash
ghost extension init my-tests --template testing
cd my-tests
npm install
ghost run-tests --coverage
ghost generate-coverage --threshold 80
```

**Best For:**
- Extension test suites
- TDD workflows
- CI/CD pipelines
- Quality assurance
- Coverage tracking

**Test Coverage:** 100% (meta!)
**LOC:** ~400

---

### 5. Basic Template

**ID:** `basic`

**Purpose:** Simple, minimal extension structure

**Features:**
- Single file structure
- Minimal boilerplate
- Easy to understand
- Quick to scaffold
- No dependencies

**Example Usage:**
```bash
ghost extension init simple-tool --template basic
cd simple-tool
ghost extension validate
ghost extension install .
```

**Best For:**
- Learning Ghost CLI
- Quick prototypes
- Simple utilities
- Personal tools
- Experimentation

**Test Coverage:** N/A
**LOC:** ~50

---

### 6. TypeScript Template

**ID:** `typescript`

**Purpose:** Type-safe extension development

**Features:**
- TypeScript configuration
- Build pipeline setup
- Type definitions
- Modern ES features
- Source maps

**Example Usage:**
```bash
ghost extension init type-safe --template typescript
cd type-safe
npm install
npm run build
ghost extension install .
```

**Best For:**
- Type-safe development
- Large projects
- Team collaboration
- Refactoring support
- IDE integration

**Test Coverage:** N/A
**LOC:** ~100

---

### 7. Advanced Template

**ID:** `advanced`

**Purpose:** Production-ready extensions

**Features:**
- Full test suite
- Comprehensive docs
- CI configuration
- Best practices
- Error handling

**Example Usage:**
```bash
ghost extension init production-ext --template advanced
cd production-ext
npm install
npm test
ghost extension install .
```

**Best For:**
- Production extensions
- Open source releases
- Enterprise deployment
- Public distribution
- Professional use

**Test Coverage:** 85%
**LOC:** ~200

---

## Template Comparison Matrix

| Feature | api | file | git | test | basic | ts | adv |
|---------|-----|------|-----|------|-------|----|----|
| **Setup Time** | 2m | 2m | 2m | 2m | 1m | 3m | 3m |
| **Dependencies** | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| **Test Suite** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Documentation** | Extensive | Extensive | Extensive | Extensive | Basic | Basic | Full |
| **Type Safety** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **CI Ready** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Auth Support** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Retry Logic** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Caching** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Streaming** | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Git Hooks** | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Mock Client** | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |

## Interactive Wizard Features

### Template Gallery View

```
📚 Available Templates:

1. API Integration
   REST/GraphQL client with auth, rate limiting, retry logic, and caching
   Use cases: API clients, Third-party integrations, Webhook consumers

2. File Processor
   Batch file operations with progress tracking, streaming, and glob patterns
   Use cases: Build tools, Code generators, File transformers

[...]
```

### Template Preview Mode

Press 'p' in template selection to see detailed previews:

```
╔════════════════════════════════════════════════════════════╗
║  API Integration Template                                  ║
╚════════════════════════════════════════════════════════════╝

REST/GraphQL client with authentication, rate limiting, and caching

Capabilities:
  • Network access
  • Authentication
  • Rate limiting
  • Caching

Features:
  • Multiple auth types (Bearer, API Key, Basic)
  • Automatic retry with exponential backoff
  • Rate limit detection and handling
  • Response caching with TTL
  • GraphQL support
  
Commands: api-call, api-config
```

### Smart Defaults

The wizard provides intelligent defaults:
- Extension ID from name (auto-kebab-case)
- Default description
- Current year for copyright
- Git username detection

### Validation

- Template existence validation
- Directory conflict detection
- Name sanitization
- Required field enforcement

## Customization Guide

### After Generation

1. **Review Files**
   ```bash
   cd your-extension
   ls -la
   cat README.md
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Run Tests**
   ```bash
   npm test
   ```

4. **Customize manifest.json**
   - Add/remove commands
   - Adjust capabilities
   - Update metadata

5. **Modify Implementation**
   - Add features
   - Remove unused code
   - Implement TODOs

6. **Update Documentation**
   - Add examples
   - Document changes
   - Include usage

### Extending Templates

Add new methods:
```javascript
async 'my-command'(params) {
    // Your implementation
}
```

Modify manifest:
```json
{
  "commands": ["my-command"]
}
```

### Creating Custom Templates

1. Create template directory:
   ```bash
   mkdir templates/my-template/
   ```

2. Add required files:
   - `manifest.json`
   - `index.js`
   - `README.md`
   - `test/index.test.js`
   - `package.json`

3. Register in `core/template-wizard.js`:
   ```javascript
   'my-template': {
       name: 'My Template',
       description: 'Description here',
       path: path.join(__dirname, '..', 'templates', 'my-template'),
       capabilities: ['List', 'Of', 'Features'],
       useCases: ['Use', 'Case', 'List'],
       preview: `Preview text here`
   }
   ```

## Best Practices

### Choosing a Template

1. **Start Simple:** Use `basic` for learning
2. **Match Purpose:** Choose template matching your use case
3. **Consider Complexity:** Don't over-engineer
4. **Think Future:** Consider testing and maintenance

### After Generation

1. **Read README:** Understand included features
2. **Run Tests:** Ensure everything works
3. **Customize:** Adapt to your needs
4. **Document:** Keep docs updated
5. **Version:** Use git from start

### Production Deployment

1. **Use `advanced` or `testing` template**
2. **Write comprehensive tests**
3. **Document thoroughly**
4. **Set up CI/CD**
5. **Version appropriately**

## Common Workflows

### API Integration Workflow

```bash
# 1. Generate from template
ghost extension init slack-bot --template api-integration

# 2. Configure API
cd slack-bot
npm install
ghost api-config --set-token xoxb-your-token
ghost api-config --set-base-url https://slack.com/api

# 3. Test connection
ghost api-call --url /auth.test

# 4. Implement features
# Edit index.js to add Slack-specific commands

# 5. Install and use
ghost extension install .
```

### Build Tool Workflow

```bash
# 1. Generate from template
ghost extension init minifier --template file-processor

# 2. Customize operations
cd minifier
npm install
# Edit applyOperation() in index.js

# 3. Test on sample files
ghost process-files --pattern "test/**/*.js" --operation minify --dry-run

# 4. Deploy
ghost extension install .
ghost process-files --pattern "src/**/*.js" --operation minify --output dist/
```

### Git Standards Workflow

```bash
# 1. Generate from template
ghost extension init git-standards --template git-workflow

# 2. Configure team rules
cd git-standards
npm install
# Edit branchPatterns and conventionalTypes

# 3. Install hooks
ghost install-hooks --all

# 4. Enable enforcement
ghost enforce-conventional --enable --strict

# 5. Share with team
git add .
git commit -m "feat: add git standards enforcement"
git push
```

## Troubleshooting

### Template Not Found

```bash
ghost extension init test --template nonexistent
# Error: Unknown template 'nonexistent'
```

**Solution:** Check available templates with `ghost extension init`

### Directory Already Exists

```bash
ghost extension init test --template basic
# Error: Directory test already exists
```

**Solution:** Choose different name or remove existing directory

### Dependencies Not Installing

```bash
cd my-extension
npm install
# Errors...
```

**Solution:** Check Node.js version (>= 14), try `npm cache clean --force`

## FAQ

**Q: Can I modify templates after generation?**  
A: Yes! Generated code is yours to modify freely.

**Q: Are templates updated?**  
A: Yes, templates are maintained with Ghost CLI updates.

**Q: Can I create my own templates?**  
A: Yes! See "Creating Custom Templates" section.

**Q: Which template for production?**  
A: Use `advanced` or match your use case + add tests.

**Q: Can I combine templates?**  
A: Manually yes, by copying features between generated projects.

**Q: Do templates include examples?**  
A: Yes, all templates except `basic` include working examples.

## Resources

- [Template Gallery README](../templates/README.md)
- [Gallery Quick Index](../templates/GALLERY_INDEX.md)
- [Extension API Reference](./extension-api.md)
- [Extension Examples](./extension-examples.md)
- [Developer Toolkit](./DEVELOPER_TOOLKIT.md)

## Contributing

Want to contribute a template?

1. Create template in `templates/`
2. Include all required files
3. Write comprehensive README
4. Add full test suite
5. Update template-wizard.js
6. Submit pull request

## License

Templates are MIT licensed - use freely in your projects.

---

**Need help? Run `ghost extension init` and press 'p' to preview all templates!**
