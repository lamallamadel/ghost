# Ghost CLI Installation Guide

Complete installation instructions for all platforms.

## Table of Contents

- [Requirements](#requirements)
- [Quick Install](#quick-install)
  - [macOS / Linux](#macos--linux)
  - [Windows](#windows)
- [Manual Installation](#manual-installation)
- [Post-Installation](#post-installation)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)
- [Uninstall](#uninstall)

## Requirements

- **Node.js**: >= 14.0.0
- **npm**: >= 6.0.0 (usually bundled with Node.js)
- **Git**: >= 2.0.0 (for Git-related features)

Check your versions:

```bash
node -v
npm -v
git --version
```

## Quick Install

### macOS / Linux

**One-liner install:**

```bash
curl -fsSL https://raw.githubusercontent.com/lamallamadel/ghost/main/scripts/install.sh | bash
```

Or download and run manually:

```bash
curl -fsSL https://raw.githubusercontent.com/lamallamadel/ghost/main/scripts/install.sh -o install.sh
chmod +x install.sh
./install.sh
```

**What it does:**
1. Verifies Node.js >= 14 is installed
2. Installs Ghost CLI globally via npm
3. Creates `~/.ghost/` directory structure:
   - `~/.ghost/extensions/` - User-installed extensions
   - `~/.ghost/telemetry/` - Telemetry logs and metrics
   - `~/.ghost/config/` - Configuration files
4. Creates default `config.json`
5. Verifies installation with `ghost doctor`

### Windows

**PowerShell install (Run as Administrator recommended):**

```powershell
irm https://raw.githubusercontent.com/lamallamadel/ghost/main/scripts/install.ps1 | iex
```

Or download and run manually:

```powershell
Invoke-WebRequest -Uri https://raw.githubusercontent.com/lamallamadel/ghost/main/scripts/install.ps1 -OutFile install.ps1
Set-ExecutionPolicy Bypass -Scope Process -Force
.\install.ps1
```

**What it does:**
1. Verifies Node.js >= 14 is installed
2. Installs Ghost CLI globally via npm
3. Creates `%USERPROFILE%\.ghost\` directory structure:
   - `.ghost\extensions\` - User-installed extensions
   - `.ghost\telemetry\` - Telemetry logs and metrics
   - `.ghost\config\` - Configuration files
4. Creates default `config.json`
5. Verifies installation with `ghost doctor`

## Manual Installation

If you prefer to install manually or the quick install fails:

### 1. Install from npm Registry

```bash
npm install -g atlasia-ghost
```

### 2. Install from Source

Clone the repository and install locally:

```bash
git clone https://github.com/lamallamadel/ghost.git
cd ghost
npm install -g .
```

### 3. Bootstrap Directory Structure

Create the Ghost home directory and subdirectories:

**macOS / Linux:**
```bash
mkdir -p ~/.ghost/{extensions,telemetry,config}
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.ghost\extensions"
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.ghost\telemetry"
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.ghost\config"
```

### 4. Create Default Configuration

Create `~/.ghost/config/config.json` (or `%USERPROFILE%\.ghost\config\config.json` on Windows):

```json
{
  "telemetry": {
    "enabled": false,
    "retention": "7d"
  },
  "extensions": {
    "autoUpdate": false
  },
  "audit": {
    "enabled": true,
    "logPath": "~/.ghost/audit.log"
  }
}
```

## Post-Installation

After installation, verify everything is working:

### 1. Check Installation Health

```bash
ghost doctor
```

This command checks:
- ✓ Node.js version (>= 14.0.0)
- ✓ Ghost directory structure (`~/.ghost/`)
- ✓ Directory permissions (read/write)
- ✓ Gateway initialization
- ✓ Bundled extensions
- ✓ Configuration file

### 2. View Available Commands

```bash
ghost --help
```

### 3. List Installed Extensions

```bash
ghost extension list
```

By default, Ghost includes the `ghost-git-extension` for AI-powered Git operations.

### 4. Test Basic Functionality

Try the AI-powered commit feature:

```bash
cd /path/to/your/git/repo
ghost commit --dry-run
```

## Verification

Verify the installation manually:

### Check Binary Location

```bash
which ghost          # macOS / Linux
where.exe ghost      # Windows
```

### Check Version

```bash
ghost --help | head -n 1
```

Should display: `GHOST CLI v1.0.0 - Gateway Launcher`

### Check Directory Structure

**macOS / Linux:**
```bash
ls -la ~/.ghost/
```

**Windows:**
```powershell
Get-ChildItem $env:USERPROFILE\.ghost -Force
```

Expected structure:
```
.ghost/
├── extensions/        # User extensions
├── telemetry/         # Telemetry data
│   └── .gitignore
├── config/            # Configuration
│   └── config.json
└── audit.log          # Audit log (created on first use)
```

## Troubleshooting

### Command Not Found: `ghost`

**Issue**: Terminal doesn't recognize `ghost` command after installation.

**Solution (macOS / Linux):**
```bash
# Add npm global bin to PATH
export PATH="$PATH:$(npm bin -g)"

# Make permanent (add to ~/.bashrc, ~/.zshrc, etc.)
echo 'export PATH="$PATH:$(npm bin -g)"' >> ~/.bashrc
source ~/.bashrc
```

**Solution (Windows):**
```powershell
# Restart terminal or refresh environment
refreshenv   # If using Chocolatey
# Or simply restart PowerShell/Command Prompt
```

### Permission Denied Errors

**Issue**: EACCES errors during npm install.

**Solution (macOS / Linux):**
```bash
# Option 1: Use a Node version manager (recommended)
# Install nvm: https://github.com/nvm-sh/nvm

# Option 2: Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH="$PATH:$HOME/.npm-global/bin"
```

**Solution (Windows):**
Run PowerShell or Command Prompt as Administrator.

### Node.js Version Too Old

**Issue**: Ghost requires Node.js >= 14.0.0.

**Solution**: Upgrade Node.js from https://nodejs.org/ or use a version manager:

**macOS / Linux:**
```bash
# Using nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

**Windows:**
```powershell
# Using nvm-windows
# Download from: https://github.com/coreybutler/nvm-windows/releases
nvm install 18
nvm use 18
```

### Directory Permissions Issues

**Issue**: `ghost doctor` reports permission errors on directories.

**Solution (macOS / Linux):**
```bash
# Fix permissions
chmod 755 ~/.ghost
chmod -R 755 ~/.ghost/{extensions,telemetry,config}
```

**Solution (Windows):**
Check folder permissions in Properties → Security tab. Ensure your user has Full Control.

### Gateway Initialization Failed

**Issue**: `ghost doctor` reports gateway initialization failure.

**Solution**:
1. Check if bundled extensions exist:
   ```bash
   ls $(npm root -g)/atlasia-ghost/extensions/
   ```
2. Reinstall Ghost CLI:
   ```bash
   npm uninstall -g atlasia-ghost
   npm install -g atlasia-ghost
   ```

## Uninstall

### Complete Uninstall

**1. Remove Ghost CLI:**
```bash
npm uninstall -g atlasia-ghost
```

**2. Remove configuration and data (optional):**

**macOS / Linux:**
```bash
rm -rf ~/.ghost
```

**Windows (PowerShell):**
```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.ghost"
```

### Keep Configuration (Reinstall Later)

If you want to keep your extensions and configuration:

```bash
# Only uninstall the CLI
npm uninstall -g atlasia-ghost

# Configuration remains in ~/.ghost/ for future reinstall
```

## Additional Resources

- **Documentation**: https://github.com/lamallamadel/ghost
- **Extension Development**: See `docs/extension-api.md`
- **Issues**: https://github.com/lamallamadel/ghost/issues
- **Changelog**: https://github.com/lamallamadel/ghost/releases

## Next Steps

After successful installation:

1. **Read the documentation**: `ghost --help`
2. **Check installation health**: `ghost doctor`
3. **Explore extensions**: `ghost extension list`
4. **Try AI commit**: `cd your-repo && ghost commit --dry-run`
5. **Build an extension**: `ghost extension init my-extension`

Enjoy using Ghost CLI! 🎉
