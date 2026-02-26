# Generate Flamegraph from Node.js CPU profile (PowerShell version)
# 
# Prerequisites:
#   - Install 0x: npm install -g 0x
#
# Usage:
#   .\scripts\generate-flamegraph.ps1

$ErrorActionPreference = "Stop"

Write-Host "🔥 Ghost CLI Flamegraph Generator" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check if 0x is installed
$oxInstalled = $null -ne (Get-Command 0x -ErrorAction SilentlyContinue)

if ($oxInstalled) {
    Write-Host "✅ 0x tool found" -ForegroundColor Green
    Write-Host ""
    Write-Host "▶ Running load test with 0x profiler..." -ForegroundColor Yellow
    Write-Host "   This will generate an interactive flamegraph" -ForegroundColor Gray
    Write-Host ""
    
    & 0x test\gateway\pipeline-load.test.js
    
    Write-Host ""
    Write-Host "✅ Flamegraph generated!" -ForegroundColor Green
    Write-Host "   Open the HTML file shown above in your browser" -ForegroundColor Gray
    
} else {
    Write-Host "❌ 0x tool not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Install with: npm install -g 0x" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Alternative: Use Linux/macOS with FlameGraph scripts" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "🎉 Done!" -ForegroundColor Green
