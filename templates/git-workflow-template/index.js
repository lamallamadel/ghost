const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Git Workflow Extension Template
 * 
 * Features:
 * - Git commit hooks installation and management
 * - Branch name validation rules
 * - Conventional commits enforcement
 * - Pre-commit validation (linting, tests)
 * - Commit message validation
 * - Protected branch enforcement
 * 
 * Usage:
 *   ghost install-hooks
 *   ghost validate-branch --branch feature/new-feature
 *   ghost validate-commit --message "feat: add new feature"
 *   ghost enforce-conventional --strict
 */
class GitWorkflowExtension {
    constructor() {
        this.hookTypes = [
            'pre-commit',
            'commit-msg',
            'pre-push',
            'post-commit',
            'pre-rebase'
        ];
        
        this.conventionalTypes = [
            'feat', 'fix', 'docs', 'style', 'refactor',
            'perf', 'test', 'build', 'ci', 'chore', 'revert'
        ];
        
        this.branchPatterns = {
            feature: /^feature\/.+/,
            bugfix: /^bugfix\/.+/,
            hotfix: /^hotfix\/.+/,
            release: /^release\/.+/,
            develop: /^develop$/,
            main: /^(main|master)$/
        };

        this.protectedBranches = ['main', 'master', 'develop'];
    }

    async init(context) {
        this.context = context;
        this.gitRoot = this.findGitRoot();
        console.log('Git Workflow Extension initialized');
    }

    /**
     * Install Git hooks
     * 
     * Flags:
     *   --hooks <types>            Comma-separated hook types to install
     *   --all                      Install all supported hooks
     *   --force                    Overwrite existing hooks
     *   --template <path>          Use custom hook template
     */
    async 'install-hooks'(params) {
        const { flags } = params;
        
        if (!this.gitRoot) {
            return {
                success: false,
                error: 'Not a git repository'
            };
        }

        const hooksDir = path.join(this.gitRoot, '.git', 'hooks');
        if (!fs.existsSync(hooksDir)) {
            fs.mkdirSync(hooksDir, { recursive: true });
        }

        const hooksToInstall = flags.all 
            ? this.hookTypes
            : (flags.hooks ? flags.hooks.split(',') : ['pre-commit', 'commit-msg']);

        const installed = [];
        const skipped = [];

        for (const hookType of hooksToInstall) {
            const hookPath = path.join(hooksDir, hookType);
            
            if (fs.existsSync(hookPath) && !flags.force) {
                skipped.push(hookType);
                continue;
            }

            const hookContent = this.generateHook(hookType, flags.template);
            fs.writeFileSync(hookPath, hookContent, { mode: 0o755 });
            installed.push(hookType);
        }

        console.log(`✅ Installed ${installed.length} hook(s): ${installed.join(', ')}`);
        
        if (skipped.length > 0) {
            console.log(`⏭️  Skipped ${skipped.length} existing hook(s): ${skipped.join(', ')}`);
            console.log('   Use --force to overwrite existing hooks');
        }

        return {
            success: true,
            installed,
            skipped
        };
    }

    /**
     * Validate branch name
     * 
     * Flags:
     *   --branch <name>            Branch name to validate (default: current branch)
     *   --pattern <type>           Pattern type (feature, bugfix, hotfix, release)
     *   --custom-pattern <regex>   Custom regex pattern
     */
    async 'validate-branch'(params) {
        const { flags } = params;
        
        const branchName = flags.branch || this.getCurrentBranch();
        
        if (!branchName) {
            return {
                success: false,
                error: 'Could not determine branch name'
            };
        }

        let isValid = false;
        let matchedPattern = null;

        if (flags['custom-pattern']) {
            const pattern = new RegExp(flags['custom-pattern']);
            isValid = pattern.test(branchName);
            matchedPattern = 'custom';
        } else if (flags.pattern) {
            const pattern = this.branchPatterns[flags.pattern];
            if (pattern) {
                isValid = pattern.test(branchName);
                matchedPattern = flags.pattern;
            }
        } else {
            // Check against all patterns
            for (const [type, pattern] of Object.entries(this.branchPatterns)) {
                if (pattern.test(branchName)) {
                    isValid = true;
                    matchedPattern = type;
                    break;
                }
            }
        }

        if (isValid) {
            console.log(`✅ Branch name '${branchName}' is valid (${matchedPattern})`);
        } else {
            console.log(`❌ Branch name '${branchName}' does not match any pattern`);
            console.log('\nExpected patterns:');
            console.log('  feature/description');
            console.log('  bugfix/description');
            console.log('  hotfix/description');
            console.log('  release/version');
        }

        return {
            success: isValid,
            branch: branchName,
            pattern: matchedPattern
        };
    }

    /**
     * Validate commit message
     * 
     * Flags:
     *   --message <msg>            Commit message to validate
     *   --file <path>              Read message from file
     *   --strict                   Enable strict validation
     *   --allow-breaking           Allow breaking changes
     */
    async 'validate-commit'(params) {
        const { flags } = params;
        
        let message;
        if (flags.file) {
            message = fs.readFileSync(flags.file, 'utf8').trim();
        } else if (flags.message) {
            message = flags.message;
        } else {
            return {
                success: false,
                error: 'Message or file required'
            };
        }

        const validation = this.validateCommitMessage(message, flags.strict);

        if (validation.valid) {
            console.log(`✅ Commit message is valid`);
            console.log(`   Type: ${validation.type}`);
            console.log(`   Scope: ${validation.scope || 'none'}`);
            console.log(`   Breaking: ${validation.breaking ? 'yes' : 'no'}`);
        } else {
            console.log(`❌ Invalid commit message`);
            console.log(`   Errors: ${validation.errors.join(', ')}`);
            console.log('\nExpected format:');
            console.log('  <type>(<scope>): <subject>');
            console.log('  [optional body]');
            console.log('  [optional footer]');
        }

        return validation;
    }

    /**
     * Enforce conventional commits
     * 
     * Flags:
     *   --enable                   Enable enforcement
     *   --disable                  Disable enforcement
     *   --strict                   Enable strict mode
     *   --config <path>            Path to config file
     */
    async 'enforce-conventional'(params) {
        const { flags } = params;
        
        const configPath = flags.config || path.join(this.gitRoot, '.conventionalcommits.json');
        
        let config = {
            enabled: true,
            strict: false,
            types: this.conventionalTypes,
            requireScope: false,
            requireBody: false
        };

        if (fs.existsSync(configPath)) {
            const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            config = { ...config, ...fileConfig };
        }

        if (flags.enable !== undefined) {
            config.enabled = flags.enable;
        }
        
        if (flags.disable !== undefined) {
            config.enabled = !flags.disable;
        }

        if (flags.strict !== undefined) {
            config.strict = flags.strict;
        }

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        console.log(`✅ Conventional commits configuration updated`);
        console.log(`   Enabled: ${config.enabled}`);
        console.log(`   Strict mode: ${config.strict}`);

        return {
            success: true,
            config
        };
    }

    /**
     * Generate hook script content
     */
    generateHook(hookType, templatePath) {
        if (templatePath && fs.existsSync(templatePath)) {
            return fs.readFileSync(templatePath, 'utf8');
        }

        switch (hookType) {
            case 'pre-commit':
                return this.generatePreCommitHook();
            case 'commit-msg':
                return this.generateCommitMsgHook();
            case 'pre-push':
                return this.generatePrePushHook();
            case 'post-commit':
                return this.generatePostCommitHook();
            default:
                return this.generateGenericHook(hookType);
        }
    }

    /**
     * Generate pre-commit hook
     */
    generatePreCommitHook() {
        return `#!/bin/bash
# Ghost CLI Git Workflow - Pre-commit Hook
# Generated automatically - do not edit manually

echo "Running pre-commit checks..."

# Check for protected branch
BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null)
PROTECTED_BRANCHES="main master develop"

for protected in $PROTECTED_BRANCHES; do
    if [ "$BRANCH" = "$protected" ]; then
        echo "❌ Direct commits to protected branch '$BRANCH' are not allowed"
        exit 1
    fi
done

# Run linter if available
if command -v npm &> /dev/null && [ -f package.json ]; then
    if grep -q '"lint"' package.json; then
        echo "Running linter..."
        npm run lint --silent || exit 1
    fi
fi

# Check for console.log statements
if git diff --cached --name-only | grep -E '\\.(js|ts)$' > /dev/null; then
    if git diff --cached | grep -E '^\\+.*console\\.log'; then
        echo "⚠️  Warning: console.log statements found in staged files"
        echo "   Remove them or use --no-verify to skip this check"
        # Uncomment to make this blocking:
        # exit 1
    fi
fi

echo "✅ Pre-commit checks passed"
exit 0
`;
    }

    /**
     * Generate commit-msg hook
     */
    generateCommitMsgHook() {
        return `#!/bin/bash
# Ghost CLI Git Workflow - Commit Message Hook
# Generated automatically - do not edit manually

COMMIT_MSG_FILE=$1
COMMIT_MSG=$(cat "$COMMIT_MSG_FILE")

# Check conventional commit format
PATTERN="^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\\(.+\\))?: .+"

if ! echo "$COMMIT_MSG" | grep -qE "$PATTERN"; then
    echo "❌ Invalid commit message format"
    echo ""
    echo "Expected format: <type>(<scope>): <subject>"
    echo ""
    echo "Valid types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert"
    echo ""
    echo "Examples:"
    echo "  feat(auth): add login functionality"
    echo "  fix: resolve navigation bug"
    echo "  docs: update README"
    echo ""
    exit 1
fi

echo "✅ Commit message format valid"
exit 0
`;
    }

    /**
     * Generate pre-push hook
     */
    generatePrePushHook() {
        return `#!/bin/bash
# Ghost CLI Git Workflow - Pre-push Hook
# Generated automatically - do not edit manually

echo "Running pre-push checks..."

# Run tests if available
if command -v npm &> /dev/null && [ -f package.json ]; then
    if grep -q '"test"' package.json; then
        echo "Running tests..."
        npm test || exit 1
    fi
fi

echo "✅ Pre-push checks passed"
exit 0
`;
    }

    /**
     * Generate post-commit hook
     */
    generatePostCommitHook() {
        return `#!/bin/bash
# Ghost CLI Git Workflow - Post-commit Hook
# Generated automatically - do not edit manually

COMMIT_HASH=$(git rev-parse HEAD)
COMMIT_MSG=$(git log -1 --pretty=%B)

echo "✅ Commit successful: $COMMIT_HASH"
echo "   Message: $COMMIT_MSG"

exit 0
`;
    }

    /**
     * Generate generic hook
     */
    generateGenericHook(hookType) {
        return `#!/bin/bash
# Ghost CLI Git Workflow - ${hookType} Hook
# Generated automatically - do not edit manually

echo "Running ${hookType} hook..."
echo "✅ ${hookType} completed"
exit 0
`;
    }

    /**
     * Validate commit message format
     */
    validateCommitMessage(message, strict = false) {
        const lines = message.split('\n');
        const firstLine = lines[0];
        const errors = [];

        // Parse conventional commit format
        const pattern = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(([^\)]+)\))?(!)?:\s(.+)$/;
        const match = firstLine.match(pattern);

        if (!match) {
            errors.push('Does not match conventional commit format');
            return { valid: false, errors };
        }

        const [, type, , scope, breaking, subject] = match;

        // Validate subject
        if (subject.length < 1) {
            errors.push('Subject is too short');
        }

        if (subject.length > 100) {
            errors.push('Subject is too long (max 100 characters)');
        }

        if (subject[0] === subject[0].toUpperCase() && strict) {
            errors.push('Subject should start with lowercase letter');
        }

        if (subject.endsWith('.')) {
            errors.push('Subject should not end with period');
        }

        // Validate body (if present)
        if (lines.length > 1 && strict) {
            if (lines[1] !== '') {
                errors.push('Second line must be blank');
            }
        }

        return {
            valid: errors.length === 0,
            type,
            scope,
            breaking: !!breaking,
            subject,
            errors
        };
    }

    /**
     * Find git root directory
     */
    findGitRoot() {
        try {
            const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
            return root;
        } catch (error) {
            return null;
        }
    }

    /**
     * Get current branch name
     */
    getCurrentBranch() {
        try {
            const branch = execSync('git symbolic-ref --short HEAD', { encoding: 'utf8' }).trim();
            return branch;
        } catch (error) {
            return null;
        }
    }

    async cleanup() {
        console.log('Git Workflow Extension cleanup complete');
    }
}

module.exports = GitWorkflowExtension;
