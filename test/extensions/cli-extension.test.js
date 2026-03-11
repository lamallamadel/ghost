const assert = require('assert');
const path = require('path');

// ─── Mock SDK ─────────────────────────────────────────────────────────────────
class MockSDK {
    constructor() {
        this.intents = [];
        this.files   = new Map();
        this.branch  = 'main';
    }

    async requestFileExists(p)        { return this.files.has(p); }
    async requestFileRead({ path: p}) { return this.files.get(p) || ''; }
    async requestFileReadJSON(p)      { return JSON.parse(this.files.get(p) || 'null'); }
    async requestFileWrite({ path: p, content }) { this.files.set(p, content); return true; }
    async requestFileWriteJSON(p, obj) { this.files.set(p, JSON.stringify(obj)); return true; }
    async requestGitCurrentBranch()   { return this.branch; }

    async emitIntent(intent) {
        this.intents.push(intent);
        if (intent.type === 'system' && intent.operation === 'registry') {
            return [
                { id: 'ghost-git-extension',      version: '1.0.0', description: 'Git ops' },
                { id: 'ghost-security-extension',  version: '1.0.0', description: 'Security' },
                { id: 'ghost-policy-extension',    version: '1.0.0', description: 'Policy' },
            ];
        }
        if (intent.type === 'extension' && intent.operation === 'call') {
            return { success: true, output: `Mock result for ${intent.params.method}` };
        }
        return { success: true };
    }

    setCoreHandler() {}
    lastIntent(type, op) {
        return [...this.intents].reverse().find(i => i.type === type && i.operation === op);
    }
}

// ─── Pull internals from the extension ───────────────────────────────────────
const ExtensionWrapper = require('../../extensions/ghost-cli-extension/index.js');
const { HistoryManager, CommandPalette, parseArgs, CATALOG, HISTORY_PATH } = ExtensionWrapper._internals;

console.log('🧪 Testing ghost-cli-extension (Beautiful Monster)...\n');

(async () => {
    // ─── Test 1: No direct fs or child_process ────────────────────────────────
    console.log('▶ Test 1: Extension must not import fs or child_process');
    const src = require('fs').readFileSync(
        path.join(__dirname, '../../extensions/ghost-cli-extension/index.js'), 'utf8'
    );
    assert.ok(!src.includes("require('fs')"),         "Must not require('fs')");
    assert.ok(!src.includes('require("fs")'),         'Must not require("fs")');
    assert.ok(!src.includes("require('child_process')"), "Must not require('child_process')");
    console.log('  ✓ No direct fs or child_process imports');
    console.log('✅ Source-level boundary check passed\n');

    // ─── Test 2: HistoryManager direct init (MockSDK injected) ──────────────
    console.log('▶ Test 2: HistoryManager + ContextProvider can init with MockSDK');
    const mockSdk2 = new MockSDK();
    const hm2init  = new HistoryManager(mockSdk2);
    await hm2init.load();
    assert.strictEqual(hm2init.loaded, true, 'HistoryManager should be marked loaded after init');
    assert.deepStrictEqual(hm2init.entries, [], 'No entries on fresh load');
    console.log('✅ HistoryManager init with MockSDK succeeds\n');

    // ─── Test 3: HistoryManager — load empty when file absent ────────────────
    console.log('▶ Test 3: HistoryManager loads empty when history file absent');
    const mockSdk3 = new MockSDK();
    const hm = new HistoryManager(mockSdk3);
    await hm.load();
    assert.deepStrictEqual(hm.entries, [], 'Should have empty entries when no file');
    assert.strictEqual(hm.loaded, true, 'Should be marked as loaded');
    console.log('  ✓ Empty entries returned for absent history file');
    console.log('✅ HistoryManager.load() handles missing file\n');

    // ─── Test 4: HistoryManager — load from SDK ───────────────────────────────
    console.log('▶ Test 4: HistoryManager reads history via SDK');
    const mockSdk4 = new MockSDK();
    const hm4 = new HistoryManager(mockSdk4);
    const histData = { version: 1, entries: ['/git commit', '/security scan', '/help'] };
    mockSdk4.files.set(HISTORY_PATH, JSON.stringify(histData));

    await hm4.load();
    assert.deepStrictEqual(hm4.entries, histData.entries, 'Should load entries from SDK');
    console.log('  ✓ History loaded from SDK filesystem');
    console.log('✅ HistoryManager.load() reads via SDK\n');

    // ─── Test 5: HistoryManager — push saves via SDK ──────────────────────────
    console.log('▶ Test 5: HistoryManager.push() saves via SDK');
    const mockSdk5 = new MockSDK();
    const hm5 = new HistoryManager(mockSdk5);
    hm5.loaded = true;

    await hm5.push('/git commit');
    await hm5.push('/security scan');
    await hm5.push('/help');

    assert.strictEqual(hm5.entries.length, 3, 'Should have 3 entries');
    assert.ok(mockSdk5.files.has(HISTORY_PATH), 'Should have written to history path via SDK');
    const saved = JSON.parse(mockSdk5.files.get(HISTORY_PATH));
    assert.deepStrictEqual(saved.entries, hm5.entries, 'Saved entries should match in-memory');
    console.log('  ✓ History entries persisted via SDK');
    console.log('✅ HistoryManager.push() saves via SDK\n');

    // ─── Test 6: HistoryManager — no duplicate consecutive entries ────────────
    console.log('▶ Test 6: HistoryManager deduplicates consecutive identical entries');
    const hm6 = new HistoryManager(new MockSDK());
    hm6.loaded = true;
    await hm6.push('/git commit');
    await hm6.push('/git commit'); // duplicate — should not add
    await hm6.push('/git commit'); // duplicate — should not add
    assert.strictEqual(hm6.entries.length, 1, 'Consecutive duplicates should be deduplicated');
    console.log('  ✓ Consecutive duplicates not added');
    console.log('✅ HistoryManager deduplication works\n');

    // ─── Test 7: HistoryManager — respects MAX_HISTORY cap ───────────────────
    console.log('▶ Test 7: HistoryManager caps at MAX_HISTORY');
    const hm7 = new HistoryManager(new MockSDK());
    hm7.loaded = true;
    for (let i = 0; i < 210; i++) await hm7.push(`/cmd-${i}`);
    assert.ok(hm7.entries.length <= 200, `Should not exceed 200 entries, got ${hm7.entries.length}`);
    console.log(`  ✓ Entries capped at ${hm7.entries.length} (≤ 200)`);
    console.log('✅ HistoryManager MAX_HISTORY cap enforced\n');

    // ─── Test 8: parseArgs flag parsing ──────────────────────────────────────
    console.log('▶ Test 8: parseArgs() correctly parses flags and positional args');

    const r1 = parseArgs(['commit', '--provider', 'groq', '--skip-audit']);
    assert.deepStrictEqual(r1.args, ['commit'], 'positional args should exclude flags');
    assert.strictEqual(r1.flags.provider, 'groq', 'should parse value flags');
    assert.strictEqual(r1.flags['skip-audit'], true, 'should parse boolean flags');

    const r2 = parseArgs(['scan', '/src', '--ai', '--provider', 'anthropic']);
    assert.deepStrictEqual(r2.args, ['scan', '/src'], 'should collect positional args');
    assert.strictEqual(r2.flags.provider, 'anthropic', 'should parse flags after positional args');

    const r3 = parseArgs([]);
    assert.deepStrictEqual(r3.args, [], 'empty input returns empty args');
    assert.deepStrictEqual(r3.flags, {}, 'empty input returns empty flags');

    console.log('  ✓ Value flags parsed correctly');
    console.log('  ✓ Boolean flags parsed correctly');
    console.log('  ✓ Mixed positional and flags parsed correctly');
    console.log('✅ parseArgs() is correct\n');

    // ─── Test 9: CommandPalette fuzzy matching ────────────────────────────────
    console.log('▶ Test 9: CommandPalette fuzzy match');
    const palette = new CommandPalette();

    palette.update('git');
    assert.ok(palette.filtered.length > 0, 'Should match git commands');
    assert.ok(palette.filtered.some(f => f.slash === 'git'), 'Should include top-level git command');

    palette.update('sec');
    assert.ok(palette.filtered.some(f => f.slash === 'security'), 'Should fuzzy match "sec" → "security"');

    palette.update('hel');
    assert.ok(palette.filtered.some(f => f.slash === 'help'), 'Should match help command');

    palette.update('xyz_no_match_999');
    assert.strictEqual(palette.filtered.length, 0, 'No match should return empty array');

    console.log('  ✓ Exact match works');
    console.log('  ✓ Fuzzy prefix match works');
    console.log('  ✓ No match returns empty');
    console.log('✅ CommandPalette fuzzy matching is correct\n');

    // ─── Test 10: CommandPalette subcommand expansion ─────────────────────────
    console.log('▶ Test 10: CommandPalette shows subcommands after space');
    const palette10 = new CommandPalette();
    palette10.update('git ');
    assert.ok(palette10.filtered.length > 0, 'Should show git subcommands when space typed');
    assert.ok(palette10.filtered.some(f => f.slash.startsWith('git ')), 'Subcommands should have parent prefix');
    console.log(`  ✓ ${palette10.filtered.length} subcommands shown after "git "`);
    console.log('✅ CommandPalette subcommand expansion works\n');

    // ─── Test 11: CommandPalette navigate and complete ────────────────────────
    console.log('▶ Test 11: CommandPalette keyboard navigation and completion');
    const palette11 = new CommandPalette();
    palette11.update('');
    const initialSelected = palette11.selected;

    palette11.moveDown();
    assert.ok(palette11.selected >= 0, 'moveDown should keep index valid');

    palette11.moveUp();
    assert.ok(palette11.selected >= 0, 'moveUp should keep index valid');

    const completion = palette11.complete();
    assert.ok(typeof completion === 'string', 'complete() should return a string');
    assert.ok(completion.startsWith('/'), 'completion should start with /');
    assert.ok(completion.endsWith(' '), 'completion should end with space');
    console.log(`  ✓ completion: "${completion.trim()}"`);
    console.log('✅ CommandPalette navigation and completion work\n');

    // ─── Test 12: ExtensionWrapper.handleRPCRequest ───────────────────────────
    console.log('▶ Test 12: handleRPCRequest returns error for unknown method');
    const wrapper12 = new ExtensionWrapper();
    wrapper12.sdk = new MockSDK();

    const res = await wrapper12.handleRPCRequest({ method: 'ghost.unknown', params: {} });
    assert.ok(res.error, 'Should return error for unknown method');
    assert.ok(res.error.code === -32601, 'Should use JSON-RPC method-not-found code');
    console.log('  ✓ Unknown method returns -32601');
    console.log('✅ handleRPCRequest error handling is correct\n');

    // ─── Test 13: CATALOG completeness ────────────────────────────────────────
    console.log('▶ Test 13: CATALOG covers all expected extensions');
    const expectedCommands = ['git', 'security', 'policy', 'process', 'sys', 'docs', 'agent', 'ai', 'desktop'];
    for (const cmd of expectedCommands) {
        assert.ok(CATALOG[cmd], `CATALOG should include ${cmd}`);
        assert.ok(Object.keys(CATALOG[cmd].sub).length > 0, `${cmd} should have subcommands`);
        assert.ok(CATALOG[cmd].extId, `${cmd} should have extId`);
    }
    console.log(`  ✓ All ${expectedCommands.length} expected extensions in CATALOG`);
    console.log('✅ CATALOG is complete\n');

    console.log('🎉 All ghost-cli-extension (Beautiful Monster) tests passed!');
    process.exit(0);
})().catch(err => {
    console.error('❌ Test failed:', err.message);
    if (err.stack) console.error(err.stack.split('\n').slice(1, 5).join('\n'));
    process.exit(1);
});
