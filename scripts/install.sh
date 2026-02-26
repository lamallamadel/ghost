#!/usr/bin/env bash
#
# Ghost CLI Installation Script (macOS/Linux)
# 
# This script:
# - Verifies Node.js >= 14 is installed
# - Installs Ghost CLI globally via npm
# - Bootstraps ~/.ghost directory structure
# - Creates necessary directories for extensions, telemetry, and config
# - Verifies installation health

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Banner
echo -e "${CYAN}${BOLD}"
echo "╔════════════════════════════════════════════╗"
echo "║         Ghost CLI Installer v0.4.0         ║"
echo "║   Extensible Gateway-based Git Assistant   ║"
echo "╚════════════════════════════════════════════╝"
echo -e "${NC}"

# Check Node.js version
echo -e "${BLUE}[1/5]${NC} Checking Node.js version..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js is not installed${NC}"
    echo -e "${YELLOW}Please install Node.js >= 14.0.0 from https://nodejs.org/${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2)
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1)

if [ "$NODE_MAJOR" -lt 14 ]; then
    echo -e "${RED}✗ Node.js version $NODE_VERSION is not supported${NC}"
    echo -e "${YELLOW}Ghost CLI requires Node.js >= 14.0.0${NC}"
    echo -e "${YELLOW}Please upgrade Node.js from https://nodejs.org/${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Node.js $NODE_VERSION detected"

# Check npm
echo -e "${BLUE}[2/5]${NC} Checking npm..."
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm is not installed${NC}"
    exit 1
fi

NPM_VERSION=$(npm -v)
echo -e "${GREEN}✓${NC} npm $NPM_VERSION detected"

# Install Ghost CLI globally
echo -e "${BLUE}[3/5]${NC} Installing Ghost CLI globally..."

# Detect if we're installing from a local directory or npm registry
if [ -f "package.json" ] && grep -q '"name": "atlasia-ghost"' package.json 2>/dev/null; then
    echo -e "${DIM}Installing from local directory...${NC}"
    npm install -g . --silent
else
    echo -e "${DIM}Installing from npm registry...${NC}"
    npm install -g atlasia-ghost --silent
fi

echo -e "${GREEN}✓${NC} Ghost CLI installed"

# Bootstrap ~/.ghost directory structure
echo -e "${BLUE}[4/5]${NC} Bootstrapping Ghost directory structure..."

GHOST_HOME="$HOME/.ghost"
EXTENSIONS_DIR="$GHOST_HOME/extensions"
TELEMETRY_DIR="$GHOST_HOME/telemetry"
CONFIG_DIR="$GHOST_HOME/config"

# Create directories
mkdir -p "$EXTENSIONS_DIR"
mkdir -p "$TELEMETRY_DIR"
mkdir -p "$CONFIG_DIR"

echo -e "${GREEN}✓${NC} Created $EXTENSIONS_DIR"
echo -e "${GREEN}✓${NC} Created $TELEMETRY_DIR"
echo -e "${GREEN}✓${NC} Created $CONFIG_DIR"

# Create default config if it doesn't exist
CONFIG_FILE="$CONFIG_DIR/config.json"
if [ ! -f "$CONFIG_FILE" ]; then
    cat > "$CONFIG_FILE" << 'EOF'
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
EOF
    echo -e "${GREEN}✓${NC} Created default config.json"
fi

# Create .gitignore for telemetry directory
TELEMETRY_GITIGNORE="$TELEMETRY_DIR/.gitignore"
if [ ! -f "$TELEMETRY_GITIGNORE" ]; then
    cat > "$TELEMETRY_GITIGNORE" << 'EOF'
# Ignore all telemetry data
*.log
*.json
metrics/
spans/
EOF
    echo -e "${GREEN}✓${NC} Created telemetry .gitignore"
fi

# Verify installation
echo -e "${BLUE}[5/5]${NC} Verifying installation..."

if ! command -v ghost &> /dev/null; then
    echo -e "${RED}✗ Ghost CLI binary not found in PATH${NC}"
    echo -e "${YELLOW}Try running: export PATH=\"\$PATH:$(npm bin -g)\"${NC}"
    exit 1
fi

# Run ghost doctor to check health
DOCTOR_OUTPUT=$(ghost doctor --quiet 2>&1 || true)

if echo "$DOCTOR_OUTPUT" | grep -q "Ghost CLI is healthy"; then
    echo -e "${GREEN}✓${NC} Installation verified"
else
    echo -e "${YELLOW}⚠${NC} Installation completed with warnings"
    echo -e "${DIM}Run 'ghost doctor' for details${NC}"
fi

# Success message
echo ""
echo -e "${GREEN}${BOLD}✓ Installation Complete!${NC}"
echo ""
echo -e "${BOLD}Quick Start:${NC}"
echo -e "  ${DIM}$${NC} ghost --help              ${DIM}# View available commands${NC}"
echo -e "  ${DIM}$${NC} ghost doctor              ${DIM}# Check installation health${NC}"
echo -e "  ${DIM}$${NC} ghost extension list      ${DIM}# List installed extensions${NC}"
echo ""
echo -e "${BOLD}Documentation:${NC}"
echo -e "  ${CYAN}https://github.com/lamallamadel/ghost${NC}"
echo ""
