const assert = require('assert');

const {
  semverParse,
  semverString,
  semverCompare,
  semverBump,
  semverDiffType,
  conventionalRequiredBumpFromMessage
} = require('../ghost.js');

assert.deepStrictEqual(semverParse('1.2.3'), { major: 1, minor: 2, patch: 3 });
assert.deepStrictEqual(semverParse('v1.2.3'), { major: 1, minor: 2, patch: 3 });
assert.strictEqual(semverParse('1.2'), null);

assert.strictEqual(semverString({ major: 0, minor: 0, patch: 1 }), '0.0.1');
assert.strictEqual(semverCompare({ major: 1, minor: 0, patch: 0 }, { major: 0, minor: 9, patch: 9 }), 1);
assert.strictEqual(semverCompare({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 }), 0);
assert.strictEqual(semverCompare({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 1 }), -1);

assert.deepStrictEqual(semverBump({ major: 1, minor: 2, patch: 3 }, 'patch'), { major: 1, minor: 2, patch: 4 });
assert.deepStrictEqual(semverBump({ major: 1, minor: 2, patch: 3 }, 'minor'), { major: 1, minor: 3, patch: 0 });
assert.deepStrictEqual(semverBump({ major: 1, minor: 2, patch: 3 }, 'major'), { major: 2, minor: 0, patch: 0 });

assert.strictEqual(semverDiffType({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 1 }), 'patch');
assert.strictEqual(semverDiffType({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 1, patch: 0 }), 'minor');
assert.strictEqual(semverDiffType({ major: 1, minor: 0, patch: 0 }, { major: 2, minor: 0, patch: 0 }), 'major');

assert.strictEqual(conventionalRequiredBumpFromMessage('fix: bug'), 'patch');
assert.strictEqual(conventionalRequiredBumpFromMessage('perf: speed'), 'patch');
assert.strictEqual(conventionalRequiredBumpFromMessage('feat: add'), 'minor');
assert.strictEqual(conventionalRequiredBumpFromMessage('feat!: breaking'), 'major');
assert.strictEqual(conventionalRequiredBumpFromMessage('chore: update'), null);
assert.strictEqual(conventionalRequiredBumpFromMessage('docs: update'), null);

console.log('✅ version.unit.test.js passed');
