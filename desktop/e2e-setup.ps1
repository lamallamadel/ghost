# E2E Test Setup Script for Windows

Write-Host "Setting up E2E test environment..." -ForegroundColor Cyan

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install

# Install Playwright browsers
Write-Host "Installing Playwright browsers..." -ForegroundColor Yellow
npx playwright install --with-deps

# Build the application
Write-Host "Building application..." -ForegroundColor Yellow
npm run build

# Create necessary directories
Write-Host "Creating directories..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "e2e\screenshots\baseline" | Out-Null
New-Item -ItemType Directory -Force -Path "test-results" | Out-Null
New-Item -ItemType Directory -Force -Path "playwright-report" | Out-Null

Write-Host "`nE2E test environment setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Run tests with:" -ForegroundColor Cyan
Write-Host "  npm run test:e2e           # Run all tests"
Write-Host "  npm run test:e2e:ui        # Run with UI"
Write-Host "  npm run test:e2e:headed    # Run in headed mode"
Write-Host "  npm run test:e2e:debug     # Debug tests"
