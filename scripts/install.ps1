# Ghost CLI Installation Script (Windows PowerShell)
#
# This script:
# - Verifies Node.js >= 14 is installed
# - Installs Ghost CLI globally via npm
# - Bootstraps ~/.ghost directory structure
# - Creates necessary directories for extensions, telemetry, and config
# - Verifies installation health

$ErrorActionPreference = "Stop"

# Colors for output
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

# Banner
Write-ColorOutput Cyan @"

╔════════════════════════════════════════════╗
║         Ghost CLI Installer v1.0.0         ║
║   Extensible Gateway-based Git Assistant   ║
╚════════════════════════════════════════════╝

"@

# Check Node.js version
Write-Output "[1/5] Checking Node.js version..."
try {
    $nodeVersion = node -v 2>$null
    if (-not $nodeVersion) {
        throw "Node.js not found"
    }
    
    $versionNumber = $nodeVersion -replace 'v', ''
    $majorVersion = [int]($versionNumber -split '\.')[0]
    
    if ($majorVersion -lt 14) {
        Write-ColorOutput Red "✗ Node.js version $nodeVersion is not supported"
        Write-ColorOutput Yellow "Ghost CLI requires Node.js >= 14.0.0"
        Write-ColorOutput Yellow "Please upgrade Node.js from https://nodejs.org/"
        exit 1
    }
    
    Write-ColorOutput Green "✓ Node.js $nodeVersion detected"
} catch {
    Write-ColorOutput Red "✗ Node.js is not installed"
    Write-ColorOutput Yellow "Please install Node.js >= 14.0.0 from https://nodejs.org/"
    exit 1
}

# Check npm
Write-Output "[2/5] Checking npm..."
try {
    $npmVersion = npm -v 2>$null
    if (-not $npmVersion) {
        throw "npm not found"
    }
    Write-ColorOutput Green "✓ npm $npmVersion detected"
} catch {
    Write-ColorOutput Red "✗ npm is not installed"
    exit 1
}

# Install Ghost CLI globally
Write-Output "[3/5] Installing Ghost CLI globally..."

# Detect if we're installing from a local directory or npm registry
$isLocalInstall = $false
if (Test-Path "package.json") {
    $packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
    if ($packageJson.name -eq "atlasia-ghost") {
        $isLocalInstall = $true
    }
}

try {
    if ($isLocalInstall) {
        Write-Host "Installing from local directory..." -ForegroundColor Gray
        npm install -g . --silent 2>&1 | Out-Null
    } else {
        Write-Host "Installing from npm registry..." -ForegroundColor Gray
        npm install -g atlasia-ghost --silent 2>&1 | Out-Null
    }
    Write-ColorOutput Green "✓ Ghost CLI installed"
} catch {
    Write-ColorOutput Red "✗ Failed to install Ghost CLI"
    Write-Output $_.Exception.Message
    exit 1
}

# Bootstrap ~/.ghost directory structure
Write-Output "[4/5] Bootstrapping Ghost directory structure..."

$ghostHome = Join-Path $env:USERPROFILE ".ghost"
$extensionsDir = Join-Path $ghostHome "extensions"
$telemetryDir = Join-Path $ghostHome "telemetry"
$configDir = Join-Path $ghostHome "config"

# Create directories
New-Item -ItemType Directory -Force -Path $extensionsDir | Out-Null
New-Item -ItemType Directory -Force -Path $telemetryDir | Out-Null
New-Item -ItemType Directory -Force -Path $configDir | Out-Null

Write-ColorOutput Green "✓ Created $extensionsDir"
Write-ColorOutput Green "✓ Created $telemetryDir"
Write-ColorOutput Green "✓ Created $configDir"

# Create default config if it doesn't exist
$configFile = Join-Path $configDir "config.json"
if (-not (Test-Path $configFile)) {
    $defaultConfig = @{
        telemetry = @{
            enabled = $false
            retention = "7d"
        }
        extensions = @{
            autoUpdate = $false
        }
        audit = @{
            enabled = $true
            logPath = "~/.ghost/audit.log"
        }
    } | ConvertTo-Json -Depth 10
    
    $defaultConfig | Out-File -FilePath $configFile -Encoding UTF8
    Write-ColorOutput Green "✓ Created default config.json"
}

# Create .gitignore for telemetry directory
$telemetryGitignore = Join-Path $telemetryDir ".gitignore"
if (-not (Test-Path $telemetryGitignore)) {
    $gitignoreContent = @"
# Ignore all telemetry data
*.log
*.json
metrics/
spans/
"@
    $gitignoreContent | Out-File -FilePath $telemetryGitignore -Encoding UTF8
    Write-ColorOutput Green "✓ Created telemetry .gitignore"
}

# Verify installation
Write-Output "[5/5] Verifying installation..."

try {
    $ghostCmd = Get-Command ghost -ErrorAction SilentlyContinue
    if (-not $ghostCmd) {
        Write-ColorOutput Red "✗ Ghost CLI binary not found in PATH"
        Write-ColorOutput Yellow "Try restarting your terminal or running: refreshenv"
        exit 1
    }
    
    # Run ghost doctor to check health
    $doctorOutput = ghost doctor --quiet 2>&1
    
    if ($doctorOutput -match "Ghost CLI is healthy") {
        Write-ColorOutput Green "✓ Installation verified"
    } else {
        Write-ColorOutput Yellow "⚠ Installation completed with warnings"
        Write-Host "Run 'ghost doctor' for details" -ForegroundColor Gray
    }
} catch {
    Write-ColorOutput Yellow "⚠ Could not verify installation automatically"
    Write-Host "Run 'ghost doctor' to check installation health" -ForegroundColor Gray
}

# Success message
Write-Output ""
Write-ColorOutput Green "✓ Installation Complete!"
Write-Output ""
Write-Output "Quick Start:"
Write-Host "  PS> ghost --help              " -NoNewline; Write-Host "# View available commands" -ForegroundColor Gray
Write-Host "  PS> ghost doctor              " -NoNewline; Write-Host "# Check installation health" -ForegroundColor Gray
Write-Host "  PS> ghost extension list      " -NoNewline; Write-Host "# List installed extensions" -ForegroundColor Gray
Write-Output ""
Write-Output "Documentation:"
Write-ColorOutput Cyan "  https://github.com/lamallamadel/ghost"
Write-Output ""
