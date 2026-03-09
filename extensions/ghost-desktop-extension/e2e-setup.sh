#!/bin/bash
# E2E Test Setup Script

echo "Setting up E2E test environment..."

# Install dependencies
echo "Installing dependencies..."
npm install

# Install Playwright browsers
echo "Installing Playwright browsers..."
npx playwright install --with-deps

# Build the application
echo "Building application..."
npm run build

# Create necessary directories
mkdir -p e2e/screenshots/baseline
mkdir -p test-results
mkdir -p playwright-report

echo "E2E test environment setup complete!"
echo ""
echo "Run tests with:"
echo "  npm run test:e2e           # Run all tests"
echo "  npm run test:e2e:ui        # Run with UI"
echo "  npm run test:e2e:headed    # Run in headed mode"
echo "  npm run test:e2e:debug     # Debug tests"
