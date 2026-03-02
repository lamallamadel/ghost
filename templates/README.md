# Ghost CLI Extension Template Gallery

A curated collection of pre-built extension templates for common patterns and use cases.

## 🎨 Available Templates

### 1. API Integration Template

**Perfect for:** Building REST/GraphQL API clients, third-party integrations, webhook consumers

**Features:**
- Multiple authentication types (Bearer, API Key, Basic)
- Automatic retry with exponential backoff
- Rate limit detection and automatic waiting
- Response caching with TTL
- GraphQL query support
- Request/response logging

**Commands:** `api-call`, `api-config`

**Use Cases:**
- GitHub API integration
- Stripe payment processing
- Slack bot integration
- Weather API client
- Custom API wrappers

---

### 2. File Processor Template

**Perfect for:** Build tools, code generators, file transformers, batch processors

**Features:**
- Batch file processing with concurrency control
- Real-time progress tracking and events
- Streaming support for large files
- Glob pattern matching
- Recursive directory traversal
- Error recovery and retry logic

**Commands:** `process-files`, `batch-transform`, `stream-large-file`

**Use Cases:**
- Build tool automation
- Code generation
- File format conversion
- Image optimization
- Log file processing

---

### 3. Git Workflow Template

**Perfect for:** Workflow automation, quality gates, team standards enforcement

**Features:**
- Git hooks installation and management
- Branch name validation rules
- Conventional commits enforcement
- Protected branch prevention
- Pre-commit/pre-push checks
- Custom hook templates

**Commands:** `install-hooks`, `validate-branch`, `validate-commit`, `enforce-conventional`

**Use Cases:**
- Team workflow standardization
- Quality gate automation
- Conventional commit enforcement
- Release automation
- Code review helpers

---

### 4. Testing Template

**Perfect for:** Extension testing, TDD workflows, CI/CD integration

**Features:**
- Vitest test runner integration
- Mock RPC client for pipeline testing
- Coverage reporting (HTML, JSON, LCOV, text)
- Integration test examples
- Test scenarios (success, error, timeout)
- CI/CD pipeline examples

**Commands:** `run-tests`, `generate-coverage`, `mock-test`

**Use Cases:**
- Extension test suites
- TDD development
- CI/CD pipelines
- Coverage tracking
- Quality assurance

---

### 5. Basic Template

**Perfect for:** Quick prototypes, learning, simple utilities

**Features:**
- Minimal boilerplate
- Single file structure
- Easy to understand
- Fast scaffolding

**Use Cases:**
- Learning Ghost CLI
- Quick prototypes
- Simple utilities
- Personal tools

---

### 6. TypeScript Template

**Perfect for:** Type-safe extensions, large projects, team development

**Features:**
- TypeScript configuration
- Build pipeline setup
- Type definitions included
- Modern ES features support

**Use Cases:**
- Type-safe development
- Large-scale extensions
- Team collaboration
- Enterprise projects

---

### 7. Advanced Template

**Perfect for:** Production extensions, open source projects, enterprise use

**Features:**
- Full test suite
- Comprehensive documentation
- CI configuration examples
- Best practices implementation

**Use Cases:**
- Production-ready extensions
- Open source releases
- Enterprise deployments
- Public distribution

---

## 🚀 Quick Start

### Interactive Template Wizard

```bash
ghost extension init
```

The wizard will:
1. Show all available templates with descriptions
2. Let you preview each template's features
3. Collect extension details
4. Generate your extension from the selected template

### Using Specific Template

```bash
# Will open interactive wizard
ghost extension init my-extension
```

---

## 📖 Template Structure

Each template includes:

- **manifest.json** - Extension metadata and capabilities
- **index.js** - Fully-commented implementation
- **README.md** - Comprehensive usage guide with examples
- **test/** - Complete test suite
- **package.json** - Dependencies and scripts (where applicable)

---

## 🎯 Choosing the Right Template

| Template | Best For | Complexity | Testing | TypeScript |
|----------|----------|------------|---------|------------|
| **API Integration** | External APIs | ⭐⭐⭐ | ✅ Full | ❌ |
| **File Processor** | File operations | ⭐⭐⭐ | ✅ Full | ❌ |
| **Git Workflow** | Git automation | ⭐⭐ | ✅ Full | ❌ |
| **Testing** | Test infrastructure | ⭐⭐ | ✅ Full | ❌ |
| **Basic** | Simple tools | ⭐ | ❌ | ❌ |
| **TypeScript** | Type-safe code | ⭐⭐ | ❌ | ✅ |
| **Advanced** | Production use | ⭐⭐⭐ | ✅ Full | ❌ |

---

## 💡 Template Features Matrix

| Feature | API | File | Git | Test | Basic | TS | Adv |
|---------|-----|------|-----|------|-------|----|----|
| Authentication | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Retry Logic | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Caching | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Progress Events | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Streaming | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Glob Patterns | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Git Hooks | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Validation | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Mock Client | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Coverage | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Test Suite | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Type Safety | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |

---

## 📚 Examples

### Example 1: Building a GitHub Integration

```bash
# Use API Integration template
ghost extension init github-helper

# Select "API Integration" template
# Configure for GitHub API
ghost api-config --set-base-url https://api.github.com
ghost api-config --set-token YOUR_GITHUB_TOKEN

# Use it
ghost api-call --url /user/repos --method GET
```

### Example 2: Creating a Build Tool

```bash
# Use File Processor template
ghost extension init build-tool

# Select "File Processor" template
# Process files
ghost process-files --pattern "src/**/*.js" --operation minify --output dist/
```

### Example 3: Enforcing Git Standards

```bash
# Use Git Workflow template
ghost extension init git-standards

# Select "Git Workflow" template
# Install hooks
ghost install-hooks --all
ghost enforce-conventional --enable --strict
```

### Example 4: Setting Up Testing

```bash
# Use Testing template
ghost extension init my-extension-tests

# Select "Testing" template
# Run tests
ghost run-tests --coverage
ghost generate-coverage --threshold 80
```

---

## 🛠️ Customization

All templates are fully customizable:

1. **Modify Commands**: Add/remove commands in manifest.json
2. **Extend Features**: Add new methods to the class
3. **Change Behavior**: Customize implementation logic
4. **Add Dependencies**: Install npm packages as needed

---

## 📦 Installation

Templates are included with Ghost CLI. To use:

```bash
# Interactive wizard
ghost extension init

# Or with flags (coming soon)
ghost extension init my-ext --template api-integration
```

---

## 🤝 Contributing

To add a new template:

1. Create directory in `templates/`
2. Include: manifest.json, index.js, README.md, test/, package.json
3. Add entry to template-wizard.js templateGallery
4. Document in this README

---

## 📄 License

MIT - Use these templates freely in your projects

---

## 🔗 Resources

- [Extension Development Guide](../docs/extension-api.md)
- [Extension Examples](../docs/extension-examples.md)
- [Developer Toolkit](../docs/DEVELOPER_TOOLKIT.md)
- [Quick Reference](../docs/QUICK_REFERENCE.md)

---

## ⭐ Template Highlights

**Most Popular:** API Integration (for external service integrations)

**Best for Beginners:** Basic Template

**Most Comprehensive:** Testing Template

**Enterprise Ready:** Advanced Template

**Type Safety:** TypeScript Template

---

## 📝 Next Steps

After generating from a template:

1. Review the generated README.md
2. Install dependencies: `npm install`
3. Run tests: `npm test`
4. Validate: `ghost extension validate`
5. Install locally: `ghost extension install .`
6. Start building!

---

**Happy coding! 🚀**
