const assert = require('assert');
const GitWorkflowExtension = require('../index');

describe('Git Workflow Extension', () => {
    let extension;

    beforeEach(async () => {
        extension = new GitWorkflowExtension();
        await extension.init({});
    });

    describe('Branch Validation', () => {
        it('should validate feature branch names', () => {
            assert.strictEqual(
                extension.branchPatterns.feature.test('feature/new-feature'),
                true
            );
            assert.strictEqual(
                extension.branchPatterns.feature.test('bugfix/issue-123'),
                false
            );
        });

        it('should validate bugfix branch names', () => {
            assert.strictEqual(
                extension.branchPatterns.bugfix.test('bugfix/fix-login'),
                true
            );
        });

        it('should validate main branch names', () => {
            assert.strictEqual(
                extension.branchPatterns.main.test('main'),
                true
            );
            assert.strictEqual(
                extension.branchPatterns.main.test('master'),
                true
            );
        });
    });

    describe('Commit Message Validation', () => {
        it('should validate correct conventional commit', () => {
            const result = extension.validateCommitMessage('feat: add new feature');
            assert.strictEqual(result.valid, true);
            assert.strictEqual(result.type, 'feat');
        });

        it('should validate commit with scope', () => {
            const result = extension.validateCommitMessage('fix(auth): resolve login issue');
            assert.strictEqual(result.valid, true);
            assert.strictEqual(result.type, 'fix');
            assert.strictEqual(result.scope, 'auth');
        });

        it('should validate breaking change', () => {
            const result = extension.validateCommitMessage('feat(api)!: change response format');
            assert.strictEqual(result.valid, true);
            assert.strictEqual(result.breaking, true);
        });

        it('should reject invalid format', () => {
            const result = extension.validateCommitMessage('invalid commit message');
            assert.strictEqual(result.valid, false);
            assert(result.errors.length > 0);
        });

        it('should reject subject with period', () => {
            const result = extension.validateCommitMessage('feat: add feature.');
            assert.strictEqual(result.valid, false);
            assert(result.errors.some(e => e.includes('period')));
        });

        it('should reject too short subject', () => {
            const result = extension.validateCommitMessage('feat:');
            assert.strictEqual(result.valid, false);
        });

        it('should reject too long subject', () => {
            const longSubject = 'a'.repeat(150);
            const result = extension.validateCommitMessage(`feat: ${longSubject}`);
            assert.strictEqual(result.valid, false);
            assert(result.errors.some(e => e.includes('too long')));
        });
    });

    describe('Hook Generation', () => {
        it('should generate pre-commit hook', () => {
            const hook = extension.generatePreCommitHook();
            assert(hook.includes('#!/bin/bash'));
            assert(hook.includes('Pre-commit Hook'));
            assert(hook.includes('PROTECTED_BRANCHES'));
        });

        it('should generate commit-msg hook', () => {
            const hook = extension.generateCommitMsgHook();
            assert(hook.includes('#!/bin/bash'));
            assert(hook.includes('Commit Message Hook'));
            assert(hook.includes('conventional commit'));
        });

        it('should generate pre-push hook', () => {
            const hook = extension.generatePrePushHook();
            assert(hook.includes('#!/bin/bash'));
            assert(hook.includes('Pre-push Hook'));
        });

        it('should generate post-commit hook', () => {
            const hook = extension.generatePostCommitHook();
            assert(hook.includes('#!/bin/bash'));
            assert(hook.includes('Post-commit Hook'));
        });
    });

    describe('Conventional Types', () => {
        it('should include all standard types', () => {
            const expectedTypes = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];
            expectedTypes.forEach(type => {
                assert(extension.conventionalTypes.includes(type));
            });
        });
    });

    describe('Protected Branches', () => {
        it('should include standard protected branches', () => {
            assert(extension.protectedBranches.includes('main'));
            assert(extension.protectedBranches.includes('master'));
            assert(extension.protectedBranches.includes('develop'));
        });
    });
});
