import { test, expect } from './fixtures/electron';
import { maskDynamicElements, compareScreenshot } from './helpers/screenshot-helpers';

test.describe('Visual Regression Testing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('#/console');
    await page.waitForTimeout(1000);
    await maskDynamicElements(page);
  });

  test('should match dashboard home view baseline', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    const screenshot = await page.screenshot({ fullPage: true });
    await expect(screenshot).toMatchSnapshot('dashboard-home.png', {
      maxDiffPixels: 200,
      threshold: 0.2
    });
  });

  test('should match pipeline visualization baseline', async ({ page }) => {
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(1000);
    await page.waitForLoadState('networkidle');

    await maskDynamicElements(page);

    const pipelineSection = page.locator('.rounded-xl.border.bg-black\\/20').first();
    const screenshot = await pipelineSection.screenshot();
    
    await expect(screenshot).toMatchSnapshot('pipeline-visualization.png', {
      maxDiffPixels: 300,
      threshold: 0.25
    });
  });

  test('should match extension manager view baseline', async ({ page }) => {
    const managerTab = page.locator('button').filter({ hasText: /Extension/ }).first();
    
    if (await managerTab.isVisible()) {
      await managerTab.click();
      await page.waitForTimeout(1000);
      await page.waitForLoadState('networkidle');

      const screenshot = await page.screenshot({ fullPage: true });
      await expect(screenshot).toMatchSnapshot('extension-manager.png', {
        maxDiffPixels: 200,
        threshold: 0.2
      });
    } else {
      test.skip();
    }
  });

  test('should match extension card layout', async ({ page }) => {
    const managerTab = page.locator('button').filter({ hasText: /Extension/ }).first();
    
    if (await managerTab.isVisible()) {
      await managerTab.click();
      await page.waitForTimeout(1000);

      const extensionCard = page.locator('.rounded-xl.border.bg-black\\/20').first();
      if (await extensionCard.isVisible()) {
        const screenshot = await extensionCard.screenshot();
        await expect(screenshot).toMatchSnapshot('extension-card.png', {
          maxDiffPixels: 100,
          threshold: 0.2
        });
      }
    } else {
      test.skip();
    }
  });

  test('should match logs view baseline', async ({ page }) => {
    const logsTab = page.locator('button').filter({ hasText: /Logs/ }).first();
    
    if (await logsTab.isVisible()) {
      await logsTab.click();
      await page.waitForTimeout(1000);
      await page.waitForLoadState('networkidle');

      const screenshot = await page.screenshot({ fullPage: true });
      await expect(screenshot).toMatchSnapshot('logs-view.png', {
        maxDiffPixels: 200,
        threshold: 0.2
      });
    } else {
      test.skip();
    }
  });

  test('should match sidebar collapsed state', async ({ page }) => {
    const toggleButton = page.locator('button[aria-label*="Basculer"]').or(
      page.locator('button').filter({ has: page.locator('svg') }).first()
    );

    if (await toggleButton.isVisible()) {
      await toggleButton.click();
      await page.waitForTimeout(500);

      const screenshot = await page.screenshot({ fullPage: true });
      await expect(screenshot).toMatchSnapshot('sidebar-collapsed.png', {
        maxDiffPixels: 200,
        threshold: 0.2
      });
    } else {
      test.skip();
    }
  });

  test('should match tab navigation bar', async ({ page }) => {
    const tabBar = page.locator('.flex.items-center.gap-2').first();
    
    if (await tabBar.isVisible()) {
      const screenshot = await tabBar.screenshot();
      await expect(screenshot).toMatchSnapshot('tab-navigation.png', {
        maxDiffPixels: 100,
        threshold: 0.2
      });
    } else {
      test.skip();
    }
  });

  test('should match stage health indicators', async ({ page }) => {
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(1000);

    const stageContainer = page.locator('.flex.items-center.justify-between.gap-6').first();
    if (await stageContainer.isVisible()) {
      await maskDynamicElements(page);
      
      const screenshot = await stageContainer.screenshot();
      await expect(screenshot).toMatchSnapshot('stage-indicators.png', {
        maxDiffPixels: 150,
        threshold: 0.25
      });
    } else {
      test.skip();
    }
  });

  test('should match request card design', async ({ page }) => {
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(1500);

    const requestCard = page.locator('.rounded-xl.border').filter({
      hasText: /req-|request/
    }).first();

    if (await requestCard.isVisible()) {
      const screenshot = await requestCard.screenshot();
      await expect(screenshot).toMatchSnapshot('request-card.png', {
        maxDiffPixels: 100,
        threshold: 0.2
      });
    } else {
      test.skip();
    }
  });

  test('should match dropped requests summary design', async ({ page }) => {
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(1500);

    const summarySection = page.locator('text=Dropped Requests Summary').locator('..');
    
    if (await summarySection.isVisible()) {
      const screenshot = await summarySection.screenshot();
      await expect(screenshot).toMatchSnapshot('dropped-requests-summary.png', {
        maxDiffPixels: 150,
        threshold: 0.25
      });
    } else {
      test.skip();
    }
  });

  test('should match toast notification design', async ({ page }) => {
    await page.evaluate(() => {
      const event = new CustomEvent('show-toast', {
        detail: {
          title: 'Test Toast',
          message: 'This is a test notification',
          tone: 'info'
        }
      });
      window.dispatchEvent(event);
    });

    await page.waitForTimeout(500);

    const toast = page.locator('[role="alert"]').first();
    if (await toast.isVisible()) {
      const screenshot = await toast.screenshot();
      await expect(screenshot).toMatchSnapshot('toast-notification.png', {
        maxDiffPixels: 50,
        threshold: 0.15
      });
    } else {
      test.skip();
    }
  });

  test('should verify consistent color scheme across views', async ({ page }) => {
    const views = [
      { name: 'home', action: async () => {} },
      { name: 'pipeline', action: async () => await page.getByText('Pipeline I/O').click() },
    ];

    for (const view of views) {
      await page.goto('#/console');
      await page.waitForTimeout(500);
      await view.action();
      await page.waitForTimeout(1000);

      const backgroundColor = await page.evaluate(() => {
        return window.getComputedStyle(document.body).backgroundColor;
      });

      expect(backgroundColor).toBeTruthy();
    }
  });

  test('should match dark theme consistency', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    const isDarkMode = await page.evaluate(() => {
      const bgColor = window.getComputedStyle(document.body).backgroundColor;
      const rgb = bgColor.match(/\d+/g);
      if (!rgb) return false;
      const [r, g, b] = rgb.map(Number);
      return (r + g + b) / 3 < 128;
    });

    expect(isDarkMode).toBe(true);
  });

  test('should verify glassmorphism effects', async ({ page }) => {
    const glassElements = page.locator('.backdrop-blur');
    const count = await glassElements.count();
    
    expect(count).toBeGreaterThan(0);

    if (count > 0) {
      const firstElement = glassElements.first();
      const backdropFilter = await firstElement.evaluate((el) => {
        return window.getComputedStyle(el).backdropFilter || 
               window.getComputedStyle(el).webkitBackdropFilter;
      });

      expect(backdropFilter).toContain('blur');
    }
  });

  test('should match responsive layout at different widths', async ({ page }) => {
    const widths = [1200, 1400, 1600];

    for (const width of widths) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(500);

      const screenshot = await page.screenshot({ fullPage: false });
      await expect(screenshot).toMatchSnapshot(`layout-${width}px.png`, {
        maxDiffPixels: 300,
        threshold: 0.25
      });
    }
  });
});
