# Git Workflow Template

Automate Git workflows with commit hooks, branch validation, and conventional commits enforcement.

## Features

- **Git Hooks Management**: Install and manage pre-commit, commit-msg, pre-push hooks
- **Branch Name Validation**: Enforce branch naming conventions
- **Conventional Commits**: Validate commit message format
- **Protected Branches**: Prevent direct commits to main/develop
- **Pre-commit Checks**: Run linters and tests automatically
- **Customizable Rules**: Configure validation rules per project

## Installation

```bash
ghost extension install .
```

## Quick Start

```bash
# Install all hooks
ghost install-hooks --all

# Install specific hooks
ghost install-hooks --hooks pre-commit,commit-msg

# Validate current branch
ghost validate-branch

# Validate commit message
ghost validate-commit --message "feat: add new feature"

# Enable conventional commits enforcement
ghost enforce-conventional --enable --strict
```

## Commands

### Install Hooks

```bash
# Install default hooks (pre-commit, commit-msg)
ghost install-hooks

# Install all supported hooks
ghost install-hooks --all

# Install specific hooks
ghost install-hooks --hooks pre-commit,pre-push

# Force overwrite existing hooks
ghost install-hooks --all --force

# Use custom hook template
ghost install-hooks --hooks pre-commit --template ./my-hook.sh
```

### Validate Branch Names

```bash
# Validate current branch
ghost validate-branch

# Validate specific branch
ghost validate-branch --branch feature/new-feature

# Validate against specific pattern
ghost validate-branch --branch my-branch --pattern feature

# Use custom regex pattern
ghost validate-branch --branch PROJ-123 --custom-pattern "^PROJ-[0-9]+$"
```

### Validate Commit Messages

```bash
# Validate message directly
ghost validate-commit --message "feat: add authentication"

# Validate from file
ghost validate-commit --file .git/COMMIT_EDITMSG

# Strict validation
ghost validate-commit --message "Fix bug" --strict
```

### Enforce Conventional Commits

```bash
# Enable enforcement
ghost enforce-conventional --enable

# Enable with strict mode
ghost enforce-conventional --enable --strict

# Disable enforcement
ghost enforce-conventional --disable

# Use custom config
ghost enforce-conventional --config ./.commitlint.json
```

## Branch Naming Conventions

Supported patterns:

- `feature/*` - New features
- `bugfix/*` - Bug fixes
- `hotfix/*` - Emergency fixes
- `release/*` - Release branches
- `develop` - Development branch
- `main` / `master` - Main branches

Examples:
```
feature/user-authentication
bugfix/login-error
hotfix/security-patch
release/1.2.0
```

## Conventional Commit Format

Format: `<type>(<scope>): <subject>`

### Types

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style changes (formatting, etc.)
- `refactor` - Code refactoring
- `perf` - Performance improvements
- `test` - Adding or updating tests
- `build` - Build system changes
- `ci` - CI configuration changes
- `chore` - Other changes (maintenance, etc.)
- `revert` - Revert previous commit

### Examples

```
feat(auth): add OAuth2 login
fix: resolve memory leak in parser
docs: update installation guide
style(ui): format button component
refactor(api): simplify error handling
perf: optimize database queries
test: add unit tests for validator
build: upgrade webpack to v5
ci: add GitHub Actions workflow
chore: update dependencies
```

### Breaking Changes

```
feat(api)!: change response format

BREAKING CHANGE: API now returns data in different structure
```

## Git Hooks

### Pre-commit Hook

Runs before commit is created:
- Checks for protected branches
- Runs linter (if configured)
- Warns about console.log statements

### Commit-msg Hook

Validates commit message format:
- Enforces conventional commit format
- Validates types and structure

### Pre-push Hook

Runs before push:
- Runs test suite (if configured)
- Additional validation

## Configuration

Create `.conventionalcommits.json`:

```json
{
  "enabled": true,
  "strict": true,
  "types": ["feat", "fix", "docs", "style", "refactor", "test"],
  "requireScope": false,
  "requireBody": false
}
```

## Examples

### Example 1: Team Workflow Setup

```bash
# Install hooks for the team
ghost install-hooks --all

# Configure strict conventional commits
ghost enforce-conventional --enable --strict

# Validate branch before creating PR
ghost validate-branch
```

### Example 2: CI Integration

```bash
# In CI pipeline
ghost validate-branch --branch $CI_BRANCH
ghost validate-commit --file .git/COMMIT_EDITMSG
```

### Example 3: Custom Validation

```bash
# Custom branch pattern for Jira integration
ghost validate-branch --custom-pattern "^(PROJ|TASK)-[0-9]+"

# Validate with strict rules
ghost validate-commit --message "feat: new feature" --strict
```

## Testing

```bash
npm test
```

## License

MIT
