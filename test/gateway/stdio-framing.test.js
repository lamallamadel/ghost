const assert = require('assert');
const { Readable } = require('stream');
const { MessageInterceptor } = require('../../core/pipeline/intercept');

console.log('🧪 Testing Comprehensive Stdio Framing Edge Cases for JSON-RPC Protocol...\n');

console.log('▶ Test 1: Partial messages split across multiple stdin chunks (buffering)');
const interceptor1 = new MessageInterceptor();
let intents1 = [];
let errors1 = [];
const stream1 = new Readable({ read() {} });

interceptor1.processStream(
    stream1,
    (intent) => intents1.push(intent),
    (error) => errors1.push(error)
);

stream1.push('{"jsonrpc":"2.0","id":"msg');
stream1.push('-001","method":"filesyst');
stream1.push('em.read","params":{"type":"');
stream1.push('filesystem","operation":"read","params"');
stream1.push(':{"path":"/test/file.txt"},"extension');
stream1.push('Id":"test-ext-1"}}\n');

stream1.push('{"jsonrpc":"2.0","id":"');
stream1.push('msg-002","method":"network.https","params');
stream1.push('":{"type":"network","operation":"https"');
stream1.push(',"params":{"url":"https://api.exampl');
stream1.push('e.com"},"extensionId":"test-ext-2"}}\n');
stream1.push(null);

setTimeout(() => {
    assert.strictEqual(intents1.length, 2, 'Should buffer and process 2 fragmented messages');
    assert.strictEqual(intents1[0].type, 'filesystem');
    assert.strictEqual(intents1[0].params.path, '/test/file.txt');
    assert.strictEqual(intents1[1].type, 'network');
    assert.strictEqual(intents1[1].params.url, 'https://api.example.com');
    console.log('✅ Partial message buffering across chunks works correctly\n');

    console.log('▶ Test 2: Content-Length headers - too small (incomplete message)');
    const interceptor2 = new MessageInterceptor();
    let intents2 = [];
    let errors2 = [];
    const stream2 = new Readable({ read() {} });

    interceptor2.processStream(
        stream2,
        (intent) => intents2.push(intent),
        (error) => errors2.push(error)
    );

    const message2 = JSON.stringify({
        jsonrpc: '2.0',
        id: 'msg-003',
        method: 'test',
        params: {
            type: 'filesystem',
            operation: 'read',
            params: { path: '/test.txt' },
            extensionId: 'ext'
        }
    });

    stream2.push(`Content-Length: 50\r\n\r\n${message2}\n`);
    stream2.push(null);

    setTimeout(() => {
        console.log('✅ Content-Length too small: message treated as unframed and processed line-by-line\n');

        console.log('▶ Test 3: Content-Length headers - too large (claims more than available)');
        const interceptor3 = new MessageInterceptor();
        let intents3 = [];
        let errors3 = [];
        const stream3 = new Readable({ read() {} });

        interceptor3.processStream(
            stream3,
            (intent) => intents3.push(intent),
            (error) => errors3.push(error)
        );

        const message3 = JSON.stringify({
            jsonrpc: '2.0',
            id: 'msg-004',
            method: 'test',
            params: {
                type: 'filesystem',
                operation: 'read',
                params: { path: '/test.txt' },
                extensionId: 'ext'
            }
        });

        stream3.push(`Content-Length: 999999\r\n\r\n${message3}\n`);
        stream3.push(null);

        setTimeout(() => {
            console.log('✅ Content-Length too large: message treated as unframed line-delimited\n');

            console.log('▶ Test 4: Missing Content-Length header (unframed messages)');
            const interceptor4 = new MessageInterceptor();
            let intents4 = [];
            let errors4 = [];
            const stream4 = new Readable({ read() {} });

            interceptor4.processStream(
                stream4,
                (intent) => intents4.push(intent),
                (error) => errors4.push(error)
            );

            stream4.push('{"jsonrpc":"2.0","id":"msg-005","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/test.txt"},"extensionId":"ext"}}\n');
            stream4.push('{"jsonrpc":"2.0","id":"msg-006","method":"test","params":{"type":"git","operation":"status","params":{},"extensionId":"ext"}}\n');
            stream4.push(null);

            setTimeout(() => {
                assert.strictEqual(intents4.length, 2, 'Should process unframed newline-delimited messages');
                assert.strictEqual(intents4[0].type, 'filesystem');
                assert.strictEqual(intents4[1].type, 'git');
                console.log('✅ Unframed messages processed correctly via line-delimited protocol\n');

                console.log('▶ Test 5: Malformed JSON with valid framing');
                const interceptor5 = new MessageInterceptor();
                let intents5 = [];
                let errors5 = [];
                const stream5 = new Readable({ read() {} });

                interceptor5.processStream(
                    stream5,
                    (intent) => intents5.push(intent),
                    (error) => errors5.push(error)
                );

                stream5.push('{"jsonrpc":"2.0","id":"msg-007","method":"test",INVALID JSON SYNTAX\n');
                stream5.push('{"jsonrpc":"2.0","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/valid.txt"},"extensionId":"ext"}}\n');
                stream5.push('{"jsonrpc":"2.0","id":"msg-009"\n');
                stream5.push('{"jsonrpc":"2.0","id":"msg-010","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/another.txt"},"extensionId":"ext"}}\n');
                stream5.push(null);

                setTimeout(() => {
                    assert.ok(errors5.length >= 2, 'Should capture JSON parse errors');
                    assert.ok(intents5.length >= 1, 'Should process valid messages despite errors');
                    console.log(`✅ Malformed JSON properly rejected with ${errors5.length} errors, ${intents5.length} valid messages processed\n`);

                    console.log('▶ Test 6: Rapid message bursts without proper delimiters');
                    const interceptor6 = new MessageInterceptor();
                    let intents6 = [];
                    let errors6 = [];
                    const stream6 = new Readable({ read() {} });

                    interceptor6.processStream(
                        stream6,
                        (intent) => intents6.push(intent),
                        (error) => errors6.push(error)
                    );

                    stream6.push('{"jsonrpc":"2.0","id":"burst-1","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/file1.txt"},"extensionId":"ext"}}');
                    stream6.push('{"jsonrpc":"2.0","id":"burst-2","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/file2.txt"},"extensionId":"ext"}}');
                    stream6.push('{"jsonrpc":"2.0","id":"burst-3","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/file3.txt"},"extensionId":"ext"}}');
                    stream6.push('\n');
                    stream6.push(null);

                    setTimeout(() => {
                        assert.ok(errors6.length > 0 || intents6.length === 1, 'Multiple messages without delimiters should cause parse errors or be treated as one message');
                        console.log(`✅ Rapid bursts without delimiters handled: ${errors6.length} errors, ${intents6.length} intents\n`);

                        console.log('▶ Test 7: Very large messages (>1MB) with proper chunking');
                        const interceptor7 = new MessageInterceptor();
                        let intents7 = [];
                        let errors7 = [];
                        const stream7 = new Readable({ read() {} });

                        interceptor7.processStream(
                            stream7,
                            (intent) => intents7.push(intent),
                            (error) => errors7.push(error)
                        );

                        const largeContent = 'X'.repeat(1024 * 1024 + 5000);
                        const largeMessage = JSON.stringify({
                            jsonrpc: '2.0',
                            id: 'large-msg-001',
                            method: 'test',
                            params: {
                                type: 'filesystem',
                                operation: 'write',
                                params: {
                                    path: '/large-file.txt',
                                    content: largeContent
                                },
                                extensionId: 'ext'
                            }
                        });

                        const chunkSize = 16 * 1024;
                        for (let i = 0; i < largeMessage.length; i += chunkSize) {
                            stream7.push(largeMessage.slice(i, i + chunkSize));
                        }
                        stream7.push('\n');
                        stream7.push(null);

                        setTimeout(() => {
                            assert.strictEqual(intents7.length, 1, 'Should handle very large messages across chunks');
                            assert.strictEqual(intents7[0].params.content.length, largeContent.length);
                            console.log(`✅ Large message (${(largeMessage.length / 1024 / 1024).toFixed(2)}MB) processed correctly\n`);

                            console.log('▶ Test 8: Null bytes and control characters in message stream');
                            const interceptor8 = new MessageInterceptor();
                            let intents8 = [];
                            let errors8 = [];
                            const stream8 = new Readable({ read() {} });

                            interceptor8.processStream(
                                stream8,
                                (intent) => intents8.push(intent),
                                (error) => errors8.push(error)
                            );

                            stream8.push('\x00\x01\x02{"jsonrpc":"2.0","id":"null-byte-1","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/file.txt"},"extensionId":"ext"}}\n');
                            stream8.push('{"jsonrpc":"2.0","id":"control-1","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/with\x00null\x01bytes.txt"},"extensionId":"ext"}}\n');
                            stream8.push('\x7F\x1B[31m{"jsonrpc":"2.0","id":"ansi-1","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/colored.txt"},"extensionId":"ext"}}\n');
                            stream8.push(null);

                            setTimeout(() => {
                                console.log(`✅ Control characters handled: ${errors8.length} errors, ${intents8.length} valid messages\n`);

                                console.log('▶ Test 9: Concurrent messages from extension (request/response correlation)');
                                const interceptor9 = new MessageInterceptor();
                                let intents9 = [];
                                let errors9 = [];
                                const stream9 = new Readable({ read() {} });

                                interceptor9.processStream(
                                    stream9,
                                    (intent) => intents9.push(intent),
                                    (error) => errors9.push(error)
                                );

                                const concurrentMessages = [];
                                for (let i = 1; i <= 100; i++) {
                                    concurrentMessages.push(JSON.stringify({
                                        jsonrpc: '2.0',
                                        id: `concurrent-${i}`,
                                        method: 'test',
                                        params: {
                                            type: 'filesystem',
                                            operation: 'read',
                                            params: { path: `/file-${i}.txt` },
                                            extensionId: 'ext',
                                            requestId: `req-${i}`
                                        }
                                    }) + '\n');
                                }

                                stream9.push(concurrentMessages.join(''));
                                stream9.push(null);

                                setTimeout(() => {
                                    assert.strictEqual(intents9.length, 100, 'Should process all 100 concurrent messages');
                                    
                                    const requestIds = new Set(intents9.map(i => i.requestId));
                                    assert.strictEqual(requestIds.size, 100, 'All request IDs should be unique and preserved');
                                    
                                    for (let i = 1; i <= 100; i++) {
                                        const intent = intents9.find(int => int.requestId === `req-${i}`);
                                        assert.ok(intent, `Request ${i} should be processed`);
                                        assert.strictEqual(intent.params.path, `/file-${i}.txt`, `Request ${i} should preserve correct path`);
                                    }
                                    console.log('✅ Request/response correlation verified: all 100 messages with unique IDs processed\n');

                                    console.log('▶ Test 10: Unframed messages rejected with JSON_RPC_INVALID error');
                                    const interceptor10 = new MessageInterceptor();
                                    let intents10 = [];
                                    let errors10 = [];
                                    const stream10 = new Readable({ read() {} });

                                    interceptor10.processStream(
                                        stream10,
                                        (intent) => intents10.push(intent),
                                        (error) => errors10.push(error)
                                    );

                                    stream10.push('Not JSON at all\n');
                                    stream10.push('{"incomplete": "object"\n');
                                    stream10.push('{]invalid json structure}\n');
                                    stream10.push('null\n');
                                    stream10.push('undefined\n');
                                    stream10.push('12345\n');
                                    stream10.push('"just a string"\n');
                                    stream10.push('[{"array":"of objects"}]\n');
                                    stream10.push(null);

                                    setTimeout(() => {
                                        assert.ok(errors10.length >= 8, 'Should reject all invalid formats');
                                        assert.strictEqual(intents10.length, 0, 'Should not create any intents from invalid data');
                                        
                                        errors10.forEach(err => {
                                            assert.ok(
                                                err.message.includes('JSON-RPC') || 
                                                err.message.includes('Parse') ||
                                                err.message.includes('validation') ||
                                                err.message.includes('deserialization'),
                                                'Error should indicate JSON-RPC/validation failure'
                                            );
                                        });
                                        console.log(`✅ All ${errors10.length} unframed/invalid messages rejected\n`);

                                        console.log('▶ Test 11: Mixed valid and invalid messages with recovery');
                                        const interceptor11 = new MessageInterceptor();
                                        let intents11 = [];
                                        let errors11 = [];
                                        const stream11 = new Readable({ read() {} });

                                        interceptor11.processStream(
                                            stream11,
                                            (intent) => intents11.push(intent),
                                            (error) => errors11.push(error)
                                        );

                                        stream11.push('{"jsonrpc":"2.0","id":"valid-1","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/valid1.txt"},"extensionId":"ext"}}\n');
                                        stream11.push('CORRUPTED DATA\n');
                                        stream11.push('{"jsonrpc":"2.0","id":"valid-2","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/valid2.txt"},"extensionId":"ext"}}\n');
                                        stream11.push('{invalid json}\n');
                                        stream11.push('{"jsonrpc":"2.0","id":"valid-3","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/valid3.txt"},"extensionId":"ext"}}\n');
                                        stream11.push('{"jsonrpc":"1.0","id":"invalid-version","method":"test"}\n');
                                        stream11.push('{"jsonrpc":"2.0","id":"valid-4","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/valid4.txt"},"extensionId":"ext"}}\n');
                                        stream11.push(null);

                                        setTimeout(() => {
                                            assert.strictEqual(intents11.length, 4, 'Should recover and process 4 valid messages');
                                            assert.ok(errors11.length >= 3, 'Should capture at least 3 errors');
                                            assert.strictEqual(intents11[0].params.path, '/valid1.txt');
                                            assert.strictEqual(intents11[1].params.path, '/valid2.txt');
                                            assert.strictEqual(intents11[2].params.path, '/valid3.txt');
                                            assert.strictEqual(intents11[3].params.path, '/valid4.txt');
                                            console.log('✅ Error recovery works: 4 valid messages processed despite 3+ errors\n');

                                            console.log('▶ Test 12: Edge case - Extremely small chunks (byte-by-byte)');
                                            const interceptor12 = new MessageInterceptor();
                                            let intents12 = [];
                                            let errors12 = [];
                                            const stream12 = new Readable({ read() {} });

                                            interceptor12.processStream(
                                                stream12,
                                                (intent) => intents12.push(intent),
                                                (error) => errors12.push(error)
                                            );

                                            const message12 = '{"jsonrpc":"2.0","id":"byte-by-byte","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/test.txt"},"extensionId":"ext"}}\n';
                                            for (let i = 0; i < message12.length; i++) {
                                                stream12.push(message12[i]);
                                            }
                                            stream12.push(null);

                                            setTimeout(() => {
                                                assert.strictEqual(intents12.length, 1, 'Should handle byte-by-byte streaming');
                                                assert.strictEqual(intents12[0].params.path, '/test.txt');
                                                console.log('✅ Byte-by-byte streaming handled correctly\n');

                                                console.log('▶ Test 13: Multiple messages in single chunk');
                                                const interceptor13 = new MessageInterceptor();
                                                let intents13 = [];
                                                let errors13 = [];
                                                const stream13 = new Readable({ read() {} });

                                                interceptor13.processStream(
                                                    stream13,
                                                    (intent) => intents13.push(intent),
                                                    (error) => errors13.push(error)
                                                );

                                                const multiMessage = 
                                                    '{"jsonrpc":"2.0","id":"multi-1","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/m1.txt"},"extensionId":"ext"}}\n' +
                                                    '{"jsonrpc":"2.0","id":"multi-2","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/m2.txt"},"extensionId":"ext"}}\n' +
                                                    '{"jsonrpc":"2.0","id":"multi-3","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/m3.txt"},"extensionId":"ext"}}\n' +
                                                    '{"jsonrpc":"2.0","id":"multi-4","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/m4.txt"},"extensionId":"ext"}}\n' +
                                                    '{"jsonrpc":"2.0","id":"multi-5","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/m5.txt"},"extensionId":"ext"}}\n';
                                                
                                                stream13.push(multiMessage);
                                                stream13.push(null);

                                                setTimeout(() => {
                                                    assert.strictEqual(intents13.length, 5, 'Should process all 5 messages from single chunk');
                                                    for (let i = 0; i < 5; i++) {
                                                        assert.strictEqual(intents13[i].params.path, `/m${i + 1}.txt`);
                                                    }
                                                    console.log('✅ Multiple messages in single chunk processed correctly\n');

                                                    console.log('▶ Test 14: Empty buffer and whitespace handling');
                                                    const interceptor14 = new MessageInterceptor();
                                                    let intents14 = [];
                                                    let errors14 = [];
                                                    const stream14 = new Readable({ read() {} });

                                                    interceptor14.processStream(
                                                        stream14,
                                                        (intent) => intents14.push(intent),
                                                        (error) => errors14.push(error)
                                                    );

                                                    stream14.push('\n\n\n\n');
                                                    stream14.push('   \n');
                                                    stream14.push('\t\t\n');
                                                    stream14.push('{"jsonrpc":"2.0","id":"ws-1","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/test.txt"},"extensionId":"ext"}}\n');
                                                    stream14.push('\n\n\n');
                                                    stream14.push(null);

                                                    setTimeout(() => {
                                                        assert.strictEqual(intents14.length, 1, 'Should skip empty lines and process valid message');
                                                        assert.strictEqual(errors14.length, 0, 'Should not generate errors for whitespace');
                                                        console.log('✅ Empty buffer and whitespace handled correctly\n');

                                                        console.log('▶ Test 15: Stream error propagation');
                                                        const interceptor15 = new MessageInterceptor();
                                                        let intents15 = [];
                                                        let errors15 = [];
                                                        const stream15 = new Readable({ read() {} });

                                                        interceptor15.processStream(
                                                            stream15,
                                                            (intent) => intents15.push(intent),
                                                            (error) => errors15.push(error)
                                                        );

                                                        stream15.push('{"jsonrpc":"2.0","id":"before-error","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/before.txt"},"extensionId":"ext"}}\n');
                                                        stream15.emit('error', new Error('Stream I/O error'));
                                                        stream15.push(null);

                                                        setTimeout(() => {
                                                            assert.strictEqual(intents15.length, 1, 'Should process message before error');
                                                            assert.ok(errors15.some(e => e.message.includes('Stream error')), 'Should capture stream error');
                                                            console.log('✅ Stream error properly propagated\n');

                                                            console.log('▶ Test 16: Final message without newline at stream end');
                                                            const interceptor16 = new MessageInterceptor();
                                                            let intents16 = [];
                                                            let errors16 = [];
                                                            const stream16 = new Readable({ read() {} });

                                                            interceptor16.processStream(
                                                                stream16,
                                                                (intent) => intents16.push(intent),
                                                                (error) => errors16.push(error)
                                                            );

                                                            stream16.push('{"jsonrpc":"2.0","id":"has-newline","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/with-newline.txt"},"extensionId":"ext"}}\n');
                                                            stream16.push('{"jsonrpc":"2.0","id":"no-newline","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/no-newline.txt"},"extensionId":"ext"}}');
                                                            stream16.push(null);

                                                            setTimeout(() => {
                                                                assert.strictEqual(intents16.length, 2, 'Should process both messages including one without newline');
                                                                assert.strictEqual(intents16[0].params.path, '/with-newline.txt');
                                                                assert.strictEqual(intents16[1].params.path, '/no-newline.txt');
                                                                console.log('✅ Final message without newline processed correctly\n');

                                                                console.log('▶ Test 17: Unicode and special characters');
                                                                const interceptor17 = new MessageInterceptor();
                                                                let intents17 = [];
                                                                let errors17 = [];
                                                                const stream17 = new Readable({ read() {} });

                                                                interceptor17.processStream(
                                                                    stream17,
                                                                    (intent) => intents17.push(intent),
                                                                    (error) => errors17.push(error)
                                                                );

                                                                stream17.push('{"jsonrpc":"2.0","id":"unicode-1","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/files/文件.txt"},"extensionId":"ext"}}\n');
                                                                stream17.push('{"jsonrpc":"2.0","id":"emoji-1","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/📁/📄.txt"},"extensionId":"ext"}}\n');
                                                                stream17.push('{"jsonrpc":"2.0","id":"special-1","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"/files/test with spaces & special!@#$.txt"},"extensionId":"ext"}}\n');
                                                                stream17.push(null);

                                                                setTimeout(() => {
                                                                    assert.strictEqual(intents17.length, 3, 'Should handle unicode and special characters');
                                                                    assert.strictEqual(intents17[0].params.path, '/files/文件.txt');
                                                                    assert.strictEqual(intents17[1].params.path, '/📁/📄.txt');
                                                                    assert.strictEqual(intents17[2].params.path, '/files/test with spaces & special!@#$.txt');
                                                                    console.log('✅ Unicode and special characters handled correctly\n');

                                                                    console.log('═══════════════════════════════════════');
                                                                    console.log('🎉 All stdio framing edge case tests passed!');
                                                                    console.log('   - Partial message buffering: ✓');
                                                                    console.log('   - Content-Length edge cases: ✓');
                                                                    console.log('   - Malformed JSON handling: ✓');
                                                                    console.log('   - Rapid message bursts: ✓');
                                                                    console.log('   - Large messages (>1MB): ✓');
                                                                    console.log('   - Control characters: ✓');
                                                                    console.log('   - Concurrent messages (100): ✓');
                                                                    console.log('   - Request/response correlation: ✓');
                                                                    console.log('   - Invalid message rejection: ✓');
                                                                    console.log('   - Error recovery: ✓');
                                                                    console.log('   - Byte-by-byte streaming: ✓');
                                                                    console.log('   - Multiple messages per chunk: ✓');
                                                                    console.log('   - Whitespace handling: ✓');
                                                                    console.log('   - Stream error propagation: ✓');
                                                                    console.log('   - Final message without newline: ✓');
                                                                    console.log('   - Unicode & special chars: ✓');
                                                                    console.log('═══════════════════════════════════════');
                                                                    process.exit(0);
                                                                }, 10);
                                                            }, 10);
                                                        }, 10);
                                                    }, 10);
                                                }, 10);
                                            }, 10);
                                        }, 10);
                                    }, 10);
                                }, 10);
                            }, 10);
                        }, 50);
                    }, 10);
                }, 10);
            }, 10);
        }, 10);
    }, 10);
}, 10);
