# Template Gallery Quick Index

## 🎯 Find the Right Template

### By Use Case

**Building API Clients?** → Use `api-integration` template
```bash
ghost extension init my-api --template api-integration
```

**Processing Files?** → Use `file-processor` template
```bash
ghost extension init file-tool --template file-processor
```

**Git Automation?** → Use `git-workflow` template
```bash
ghost extension init git-helper --template git-workflow
```

**Testing Extensions?** → Use `testing` template
```bash
ghost extension init my-tests --template testing
```

**Learning Ghost CLI?** → Use `basic` template
```bash
ghost extension init my-first --template basic
```

**Type Safety?** → Use `typescript` template
```bash
ghost extension init type-safe --template typescript
```

**Production Ready?** → Use `advanced` template
```bash
ghost extension init production-ext --template advanced
```

---

## 📊 Template Comparison

| Aspect | api-integration | file-processor | git-workflow | testing | basic | typescript | advanced |
|--------|----------------|----------------|--------------|---------|-------|------------|----------|
| **Setup Time** | 2 min | 2 min | 2 min | 2 min | 1 min | 3 min | 3 min |
| **Dependencies** | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| **Tests** | Full | Full | Full | Full | None | None | Full |
| **Documentation** | Extensive | Extensive | Extensive | Extensive | Basic | Basic | Full |
| **Examples** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **LOC** | ~500 | ~600 | ~500 | ~400 | ~50 | ~100 | ~200 |

---

## 🏆 Template Ratings

### Ease of Use
1. Basic ⭐⭐⭐⭐⭐
2. TypeScript ⭐⭐⭐⭐
3. Testing ⭐⭐⭐⭐
4. Git Workflow ⭐⭐⭐
5. API Integration ⭐⭐⭐
6. File Processor ⭐⭐⭐
7. Advanced ⭐⭐⭐

### Features
1. Testing ⭐⭐⭐⭐⭐
2. API Integration ⭐⭐⭐⭐⭐
3. File Processor ⭐⭐⭐⭐⭐
4. Git Workflow ⭐⭐⭐⭐
5. Advanced ⭐⭐⭐⭐
6. TypeScript ⭐⭐⭐
7. Basic ⭐⭐

### Production Ready
1. Advanced ⭐⭐⭐⭐⭐
2. Testing ⭐⭐⭐⭐⭐
3. TypeScript ⭐⭐⭐⭐
4. API Integration ⭐⭐⭐⭐
5. File Processor ⭐⭐⭐⭐
6. Git Workflow ⭐⭐⭐⭐
7. Basic ⭐⭐

---

## 💡 Template Selection Guide

### "I want to..."

**...integrate with a REST API**
→ `api-integration` - Has auth, retry, caching built-in

**...process lots of files**
→ `file-processor` - Batch processing with progress

**...enforce git standards**
→ `git-workflow` - Hooks and validation ready

**...write tests for my extension**
→ `testing` - Full test infrastructure

**...learn extension development**
→ `basic` - Minimal, easy to understand

**...use TypeScript**
→ `typescript` - Configured and ready

**...build something production-ready**
→ `advanced` - Tests, docs, CI included

---

## 🚦 Quick Start Commands

### Interactive (Recommended)
```bash
ghost extension init
# Follow the wizard prompts
```

### With Template Flag
```bash
# Specify template directly
ghost extension init my-extension --template api-integration

# Or shorter names work too
ghost extension init github-tool --template api-integration
```

### With Name Only
```bash
# Interactive template selection
ghost extension init my-awesome-tool
```

---

## 📚 Template Contents

Each template includes:

### Common Files
- ✅ `manifest.json` - Extension metadata
- ✅ `index.js` - Main implementation
- ✅ `README.md` - Usage documentation
- ✅ `.gitignore` - Git ignore patterns

### Template-Specific Files

**API Integration:**
- `test/index.test.js` - Full test suite
- `package.json` - Mocha test runner

**File Processor:**
- `test/index.test.js` - Full test suite
- `package.json` - Mocha test runner

**Git Workflow:**
- `test/index.test.js` - Full test suite
- `package.json` - Mocha test runner

**Testing:**
- `test/index.test.js` - Meta tests!
- `package.json` - Mocha + c8 coverage

**TypeScript:**
- `src/index.ts` - TypeScript source
- `tsconfig.json` - TS configuration
- `package.json` - Build scripts

**Advanced:**
- `test/index.test.js` - Test suite
- `package.json` - Test runner

---

## 🎓 Learning Path

1. **Start with:** `basic` template
   - Learn extension structure
   - Understand manifest.json
   - Write simple commands

2. **Progress to:** `api-integration` or `file-processor`
   - Real-world patterns
   - Error handling
   - Best practices

3. **Master with:** `testing` and `advanced`
   - Test-driven development
   - Production patterns
   - CI/CD integration

4. **Specialize with:** `git-workflow` or custom
   - Domain-specific features
   - Advanced capabilities
   - Custom templates

---

## 🔧 Customization Tips

### After Generating

1. **Update manifest.json**
   - Add/remove commands
   - Adjust capabilities
   - Update metadata

2. **Customize implementation**
   - Modify methods
   - Add new features
   - Remove unused code

3. **Enhance documentation**
   - Add examples
   - Document API
   - Include screenshots

4. **Add dependencies**
   - `npm install` packages
   - Update package.json
   - Lock versions

---

## 📖 Full Documentation

- [Complete Template Guide](./README.md)
- [API Integration Details](./api-integration-template/README.md)
- [File Processor Details](./file-processor-template/README.md)
- [Git Workflow Details](./git-workflow-template/README.md)
- [Testing Details](./testing-template/README.md)

---

## 🤝 Need Help?

**Can't decide?** Use the interactive wizard:
```bash
ghost extension init
# Press 'p' to preview all templates
```

**Want to see code?** Check template directories:
```bash
ls templates/api-integration-template/
ls templates/file-processor-template/
# etc.
```

**Need inspiration?** Browse examples:
```bash
cat templates/api-integration-template/index.js
```

---

**Happy building! 🚀**
