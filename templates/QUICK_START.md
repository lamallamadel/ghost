# Template Gallery Quick Start

## 🚀 One-Liners

### Interactive (Recommended)
```bash
ghost extension init
```

### Direct Template Selection
```bash
ghost extension init <name> --template <template-id>
```

## 📋 Template IDs

| ID | Description | Setup Time |
|----|-------------|------------|
| `api-integration` | REST/GraphQL API client | 2 min |
| `file-processor` | Batch file operations | 2 min |
| `git-workflow` | Git hooks & validation | 2 min |
| `testing` | Test infrastructure | 2 min |
| `basic` | Minimal structure | 1 min |
| `typescript` | Type-safe development | 3 min |
| `advanced` | Production-ready | 3 min |

## 🎯 Use Case → Template

```bash
# API Client
ghost extension init github-api --template api-integration

# File Tool
ghost extension init minifier --template file-processor

# Git Helper
ghost extension init team-standards --template git-workflow

# Tests
ghost extension init my-tests --template testing

# Learning
ghost extension init first-ext --template basic

# Type Safety
ghost extension init type-safe --template typescript

# Production
ghost extension init prod-ext --template advanced
```

## 📦 Post-Generation

```bash
cd <your-extension>
npm install          # If has package.json
npm test             # If has tests
npm run build        # If TypeScript
ghost extension validate
ghost extension install .
```

## 🔍 Preview Before Choosing

In the wizard, type `p` to see all template previews with:
- Features list
- Capabilities
- Example commands
- Use cases

## 💡 Tips

- **First time?** Use interactive mode
- **Know what you want?** Use `--template` flag
- **Not sure?** Preview all templates
- **Production?** Use `advanced` or add tests to any template

## 📚 Full Docs

- [Complete Guide](../docs/TEMPLATE_GALLERY.md)
- [Template Comparison](./GALLERY_INDEX.md)
- [Gallery README](./README.md)

---

**Quick help: `ghost extension help`**
