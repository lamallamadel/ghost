# Template Gallery Quick Reference

## Getting Started
```bash
ghost extension init
```

## Templates

### API Integration
- **Use**: REST/GraphQL API clients
- **Auth**: Bearer, API Key, OAuth
- **Commands**: `ghost api get|post|put|delete|graphql`

### File Processor  
- **Use**: Batch file operations
- **Features**: Pattern matching, transformations, progress
- **Commands**: `ghost process`, `ghost analyze`

### Git Workflow
- **Use**: Commit hooks & validation
- **Hooks**: pre-commit, commit-msg
- **Commands**: `ghost git-check`, `ghost git-lint`

### Testing
- **Use**: Complete test setup
- **Frameworks**: Vitest or Jest
- **Features**: Mocking, coverage, E2E

## Template Features Comparison

| Feature | API | Files | Git | Test |
|---------|-----|-------|-----|------|
| Network | ✓ | - | - | - |
| Files | - | ✓ | ✓ | ✓ |
| Git | - | - | ✓ | - |
| Hooks | - | - | ✓ | - |
| Tests | Basic | Basic | Basic | ✓ |
