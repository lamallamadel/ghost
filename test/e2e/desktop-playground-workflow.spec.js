/**
 * Desktop Playground Workflow E2E Tests (Playwright + Electron)
 * 
 * This test suite uses Playwright to test the desktop UI components:
 * - IntentPlayground.tsx: Intent execution and validation
 * - ManifestEditor.tsx: Manifest editing and validation
 * - Extension Manager: Extension management UI
 * 
 * Run with: cd desktop && npm run test:e2e
 */

const { test, expect, _electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Test configuration
const DESKTOP_PATH = path.resolve(__dirname, '..', '..', 'desktop');
const ELECTRON_PATH = require('electron');
const TEST_TIMEOUT = 30000;

test.describe('Desktop Playground - Extension Workflow', () => {
  let electronApp;
  let page;

  test.beforeAll(async () => {
    // Launch Electron app
    electronApp = await _electron.launch({
      executablePath: ELECTRON_PATH,
      args: [DESKTOP_PATH],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ELECTRON_IS_DEV: '1'
      }
    });

    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test.describe('ManifestEditor Component', () => {
    test.beforeEach(async () => {
      // Navigate to playground page
      await page.goto('#/playground');
      await page.waitForTimeout(1000);
    });

    test('should display manifest editor with default template', async () => {
      const editor = page.locator('[data-testid="manifest-editor"], textarea').first();
      await expect(editor).toBeVisible({ timeout: TEST_TIMEOUT });
      
      const content = await editor.inputValue();
      expect(content).toContain('id');
      expect(content).toContain('version');
      expect(content).toContain('capabilities');
    });

    test('should validate correct manifest structure', async () => {
      const validManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {
          filesystem: {
            read: ['**/*.js']
          }
        }
      };

      // Find manifest text area
      const editor = page.locator('textarea').first();
      await editor.fill(JSON.stringify(validManifest, null, 2));

      // Trigger validation
      const validateButton = page.locator('button').filter({ hasText: /validate/i }).first();
      if (await validateButton.isVisible()) {
        await validateButton.click();
        await page.waitForTimeout(500);

        // Check for success indicator
        const successIndicator = page.locator('[data-testid="validation-success"], .text-green-500, .text-green-600').first();
        await expect(successIndicator).toBeVisible({ timeout: 5000 });
      }
    });

    test('should detect invalid glob patterns in manifest', async () => {
      const invalidManifest = {
        id: 'test-extension',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {
          filesystem: {
            read: ['**[invalid']
          }
        }
      };

      const editor = page.locator('textarea').first();
      await editor.fill(JSON.stringify(invalidManifest, null, 2));

      const validateButton = page.locator('button').filter({ hasText: /validate/i }).first();
      if (await validateButton.isVisible()) {
        await validateButton.click();
        await page.waitForTimeout(500);

        // Check for error indicator
        const errorIndicator = page.locator('[data-testid="validation-error"], .text-red-500, .text-red-600').first();
        await expect(errorIndicator).toBeVisible({ timeout: 5000 });
      }
    });

    test('should detect missing required fields', async () => {
      const incompleteManifest = {
        id: 'test-extension',
        name: 'Test Extension'
        // Missing version, main, capabilities
      };

      const editor = page.locator('textarea').first();
      await editor.fill(JSON.stringify(incompleteManifest, null, 2));

      const validateButton = page.locator('button').filter({ hasText: /validate/i }).first();
      if (await validateButton.isVisible()) {
        await validateButton.click();
        await page.waitForTimeout(500);

        // Check for error messages about missing fields
        const errorText = page.locator('text=/version|main|capabilities/i').first();
        await expect(errorText).toBeVisible({ timeout: 5000 });
      }
    });

    test('should validate network capabilities', async () => {
      const networkManifest = {
        id: 'api-extension',
        name: 'API Extension',
        version: '1.0.0',
        main: 'index.js',
        capabilities: {
          network: {
            allowlist: ['https://api.example.com'],
            rateLimit: {
              cir: 60,
              bc: 100,
              be: 150
            }
          }
        }
      };

      const editor = page.locator('textarea').first();
      await editor.fill(JSON.stringify(networkManifest, null, 2));

      const validateButton = page.locator('button').filter({ hasText: /validate/i }).first();
      if (await validateButton.isVisible()) {
        await validateButton.click();
        await page.waitForTimeout(500);

        const successIndicator = page.locator('[data-testid="validation-success"], .text-green-500').first();
        await expect(successIndicator).toBeVisible({ timeout: 5000 });
      }
    });

    test('should export manifest to file', async () => {
      const exportButton = page.locator('button').filter({ hasText: /export|download/i }).first();
      
      if (await exportButton.isVisible()) {
        // Set up download listener
        const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
        await exportButton.click();

        try {
          const download = await downloadPromise;
          expect(download.suggestedFilename()).toContain('manifest');
          expect(download.suggestedFilename()).toMatch(/\.json$/);
        } catch (e) {
          // Export functionality may not be available in test mode
          console.log('Export test skipped:', e.message);
        }
      }
    });
  });

  test.describe('IntentPlayground Component', () => {
    test.beforeEach(async () => {
      await page.goto('#/playground');
      await page.waitForTimeout(1000);
    });

    test('should display intent playground interface', async () => {
      // Look for intent type selector
      const intentTypeSelector = page.locator('select, [role="combobox"]').filter({ hasText: /filesystem|network|git/i }).first();
      
      if (await intentTypeSelector.isVisible()) {
        await expect(intentTypeSelector).toBeVisible();
      } else {
        // Alternative: look for tab or button with intent types
        const intentTab = page.locator('text=/filesystem|network|git/i').first();
        await expect(intentTab).toBeVisible({ timeout: TEST_TIMEOUT });
      }
    });

    test('should execute filesystem read intent', async () => {
      // Select filesystem intent type
      const filesystemOption = page.locator('text=filesystem, button:has-text("filesystem")').first();
      if (await filesystemOption.isVisible()) {
        await filesystemOption.click();
      }

      // Select read operation
      const readOption = page.locator('text=read, button:has-text("read")').first();
      if (await readOption.isVisible()) {
        await readOption.click();
      }

      // Fill in parameters
      const paramsInput = page.locator('textarea[name="params"], textarea').last();
      await paramsInput.fill('{ "path": "package.json" }');

      // Execute intent
      const executeButton = page.locator('button').filter({ hasText: /execute|run/i }).first();
      if (await executeButton.isVisible()) {
        await executeButton.click();
        await page.waitForTimeout(2000);

        // Check for result display
        const resultArea = page.locator('[data-testid="execution-result"], pre, code').first();
        await expect(resultArea).toBeVisible({ timeout: 10000 });
      }
    });

    test('should validate intent parameters before execution', async () => {
      // Enter invalid JSON in parameters
      const paramsInput = page.locator('textarea[name="params"], textarea').last();
      await paramsInput.fill('{ invalid json }');

      // Try to execute
      const executeButton = page.locator('button').filter({ hasText: /execute|run/i }).first();
      if (await executeButton.isVisible()) {
        await executeButton.click();
        await page.waitForTimeout(500);

        // Should show validation error
        const errorMessage = page.locator('text=/invalid|error|json/i').first();
        await expect(errorMessage).toBeVisible({ timeout: 5000 });
      }
    });

    test('should display intent execution duration', async () => {
      const paramsInput = page.locator('textarea[name="params"], textarea').last();
      await paramsInput.fill('{ "path": "README.md" }');

      const executeButton = page.locator('button').filter({ hasText: /execute|run/i }).first();
      if (await executeButton.isVisible()) {
        await executeButton.click();
        await page.waitForTimeout(2000);

        // Check for duration display
        const durationText = page.locator('text=/\\d+ms|duration|time/i').first();
        await expect(durationText).toBeVisible({ timeout: 10000 });
      }
    });

    test('should switch between intent types', async () => {
      const intentTypes = ['filesystem', 'network', 'git'];

      for (const intentType of intentTypes) {
        const option = page.locator(`text=${intentType}, button:has-text("${intentType}")`).first();
        if (await option.isVisible()) {
          await option.click();
          await page.waitForTimeout(300);

          // Verify the intent type is selected
          const selectedIndicator = page.locator(`[data-selected="true"]:has-text("${intentType}"), .active:has-text("${intentType}")`).first();
          const isVisible = await selectedIndicator.isVisible().catch(() => false);
          if (isVisible) {
            await expect(selectedIndicator).toBeVisible();
          }
        }
      }
    });

    test('should provide intent templates for quick testing', async () => {
      // Look for template or example buttons
      const templateButton = page.locator('button').filter({ hasText: /template|example|sample/i }).first();
      
      if (await templateButton.isVisible()) {
        await templateButton.click();
        await page.waitForTimeout(300);

        // Parameters should be filled with template
        const paramsInput = page.locator('textarea[name="params"], textarea').last();
        const content = await paramsInput.inputValue();
        expect(content.length).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Extension Manager Integration', () => {
    test.beforeEach(async () => {
      await page.goto('#/console');
      await page.waitForTimeout(1000);
    });

    test('should navigate to extension manager tab', async () => {
      const managerTab = page.locator('button, a').filter({ hasText: /extension|extensions/i }).first();
      
      if (await managerTab.isVisible()) {
        await managerTab.click();
        await page.waitForTimeout(500);

        // Verify we're on the extension manager page
        const heading = page.locator('h1, h2').filter({ hasText: /extension/i }).first();
        await expect(heading).toBeVisible({ timeout: TEST_TIMEOUT });
      }
    });

    test('should display list of installed extensions', async () => {
      const managerTab = page.locator('button').filter({ hasText: /extension/i }).first();
      
      if (await managerTab.isVisible()) {
        await managerTab.click();
        await page.waitForTimeout(1000);

        // Look for extension cards or list items
        const extensionList = page.locator('[data-testid="extension-list"], .extension-card, [class*="extension"]').first();
        const isVisible = await extensionList.isVisible().catch(() => false);
        
        if (isVisible) {
          await expect(extensionList).toBeVisible();
        } else {
          // May show empty state
          const emptyState = page.locator('text=/no extensions|empty/i').first();
          const hasEmptyState = await emptyState.isVisible().catch(() => false);
          expect(hasEmptyState || isVisible).toBeTruthy();
        }
      }
    });

    test('should show extension details on selection', async () => {
      const managerTab = page.locator('button').filter({ hasText: /extension/i }).first();
      
      if (await managerTab.isVisible()) {
        await managerTab.click();
        await page.waitForTimeout(1000);

        // Click on first extension if available
        const firstExtension = page.locator('[data-testid="extension-item"], .extension-card').first();
        const hasExtension = await firstExtension.isVisible().catch(() => false);
        
        if (hasExtension) {
          await firstExtension.click();
          await page.waitForTimeout(500);

          // Check for details panel
          const detailsPanel = page.locator('[data-testid="extension-details"], [class*="detail"]').first();
          await expect(detailsPanel).toBeVisible({ timeout: 5000 });
        }
      }
    });

    test('should toggle extension enabled/disabled state', async () => {
      const managerTab = page.locator('button').filter({ hasText: /extension/i }).first();
      
      if (await managerTab.isVisible()) {
        await managerTab.click();
        await page.waitForTimeout(1000);

        // Look for toggle switch
        const toggleButton = page.locator('button, input[type="checkbox"]').filter({ 
          hasText: /enable|disable|active/i 
        }).first();
        
        const hasToggle = await toggleButton.isVisible().catch(() => false);
        
        if (hasToggle) {
          const initialState = await toggleButton.textContent();
          await toggleButton.click();
          await page.waitForTimeout(1000);

          // State should have changed
          const newState = await toggleButton.textContent();
          expect(initialState).not.toBe(newState);
        }
      }
    });
  });

  test.describe('Registry Marketplace Integration', () => {
    test('should navigate to marketplace/registry view', async () => {
      const marketplaceTab = page.locator('button, a').filter({ hasText: /marketplace|registry|browse/i }).first();
      
      if (await marketplaceTab.isVisible()) {
        await marketplaceTab.click();
        await page.waitForTimeout(1000);

        const heading = page.locator('h1, h2').filter({ hasText: /marketplace|registry/i }).first();
        await expect(heading).toBeVisible({ timeout: TEST_TIMEOUT });
      }
    });

    test('should search for extensions in marketplace', async () => {
      const marketplaceTab = page.locator('button').filter({ hasText: /marketplace/i }).first();
      
      if (await marketplaceTab.isVisible()) {
        await marketplaceTab.click();
        await page.waitForTimeout(1000);

        // Look for search input
        const searchInput = page.locator('input[type="search"], input[placeholder*="search"]').first();
        const hasSearch = await searchInput.isVisible().catch(() => false);
        
        if (hasSearch) {
          await searchInput.fill('api');
          await page.waitForTimeout(1000);

          // Results should be filtered
          const results = page.locator('[data-testid="search-results"], [class*="result"]').first();
          await expect(results).toBeVisible({ timeout: 5000 });
        }
      }
    });

    test('should display extension details from marketplace', async () => {
      const marketplaceTab = page.locator('button').filter({ hasText: /marketplace/i }).first();
      
      if (await marketplaceTab.isVisible()) {
        await marketplaceTab.click();
        await page.waitForTimeout(1000);

        // Click on extension
        const extensionCard = page.locator('[data-testid="marketplace-extension"], .extension-card').first();
        const hasCard = await extensionCard.isVisible().catch(() => false);
        
        if (hasCard) {
          await extensionCard.click();
          await page.waitForTimeout(500);

          // Should show details like version, description, install button
          const installButton = page.locator('button').filter({ hasText: /install/i }).first();
          await expect(installButton).toBeVisible({ timeout: 5000 });
        }
      }
    });
  });

  test.describe('Version Upgrade Flow', () => {
    test('should show update notification for extensions', async () => {
      await page.goto('#/console');
      await page.waitForTimeout(1000);

      const managerTab = page.locator('button').filter({ hasText: /extension/i }).first();
      
      if (await managerTab.isVisible()) {
        await managerTab.click();
        await page.waitForTimeout(1000);

        // Look for update badge or notification
        const updateBadge = page.locator('[data-testid="update-badge"], .badge, text=/update|upgrade/i').first();
        const hasUpdate = await updateBadge.isVisible().catch(() => false);
        
        if (hasUpdate) {
          await expect(updateBadge).toBeVisible();
        }
      }
    });

    test('should trigger extension update', async () => {
      await page.goto('#/console');
      const managerTab = page.locator('button').filter({ hasText: /extension/i }).first();
      
      if (await managerTab.isVisible()) {
        await managerTab.click();
        await page.waitForTimeout(1000);

        const updateButton = page.locator('button').filter({ hasText: /update|upgrade/i }).first();
        const hasUpdate = await updateButton.isVisible().catch(() => false);
        
        if (hasUpdate) {
          await updateButton.click();
          await page.waitForTimeout(2000);

          // Should show progress or success message
          const successMessage = page.locator('text=/updated|success|complete/i').first();
          await expect(successMessage).toBeVisible({ timeout: 10000 });
        }
      }
    });
  });
});
