#!/bin/bash
# Generate Flamegraph from Node.js CPU profile
# 
# Prerequisites:
#   - Install 0x: npm install -g 0x
#   - Or use: git clone https://github.com/brendangregg/FlameGraph.git
#
# Usage:
#   bash scripts/generate-flamegraph.sh

set -e

echo "🔥 Ghost CLI Flamegraph Generator"
echo "=================================="

# Check if 0x is installed
if command -v 0x &> /dev/null; then
    echo "✅ 0x tool found"
    echo ""
    echo "▶ Running load test with 0x profiler..."
    echo "   This will generate an interactive flamegraph"
    echo ""
    
    0x test/gateway/pipeline-load.test.js
    
    echo ""
    echo "✅ Flamegraph generated!"
    echo "   Open the HTML file shown above in your browser"
    
elif [ -d "FlameGraph" ]; then
    echo "✅ FlameGraph scripts found"
    echo ""
    echo "▶ Running load test with --prof..."
    
    node --prof --no-logfile-per-isolate test/gateway/pipeline-load.test.js
    
    echo ""
    echo "▶ Converting to flamegraph format..."
    
    ISOLATE_LOG=$(ls -t isolate-*.log | head -1)
    node --prof-process --preprocess -j "$ISOLATE_LOG" > profile.json
    
    echo ""
    echo "▶ Generating flamegraph SVG..."
    
    node -e "
        const fs = require('fs');
        const data = JSON.parse(fs.readFileSync('profile.json'));
        const stacks = [];
        
        function processNode(node, stack = []) {
            if (node.functionName) {
                const name = node.functionName || 'anonymous';
                const newStack = [...stack, name];
                if (node.selfTime > 0) {
                    stacks.push(newStack.join(';') + ' ' + node.selfTime);
                }
                if (node.children) {
                    node.children.forEach(child => processNode(child, newStack));
                }
            }
        }
        
        data.head.forEach(node => processNode(node));
        fs.writeFileSync('stacks.txt', stacks.join('\n'));
    "
    
    FlameGraph/flamegraph.pl stacks.txt > flamegraph.svg
    
    echo ""
    echo "✅ Flamegraph generated: flamegraph.svg"
    echo "   Open in browser: open flamegraph.svg (macOS) or xdg-open flamegraph.svg (Linux)"
    
    # Cleanup
    rm -f profile.json stacks.txt "$ISOLATE_LOG"
    
else
    echo "❌ No flamegraph tool found!"
    echo ""
    echo "Install one of:"
    echo "  1. 0x tool (recommended): npm install -g 0x"
    echo "  2. FlameGraph scripts: git clone https://github.com/brendangregg/FlameGraph.git"
    echo ""
    exit 1
fi

echo ""
echo "=================================="
echo "🎉 Done!"
