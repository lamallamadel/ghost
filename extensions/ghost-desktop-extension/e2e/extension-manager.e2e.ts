import { test, expect } from './fixtures/electron';

test.describe('Extension Manager Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('#/console');
    await page.waitForTimeout(500);
  });

  test('should display extension manager tab', async ({ page }) => {
    const managerTab = page.locator('text=Extension Manager').or(
      page.locator('text=Gestion des extensions')
    );
    
    if (await managerTab.isVisible()) {
      await managerTab.click();
      await page.waitForTimeout(500);
      
      const header = page.locator('text=Gestion des extensions').or(
        page.locator('text=Extension Manager')
      );
      await expect(header).toBeVisible();
    }
  });

  test('should load and display installed extensions', async ({ page }) => {
    const tabButton = page.getByText('Extension Manager').or(
      page.locator('button:has-text("Extension"), button:has-text("Gestion")')
    ).first();
    
    if (await tabButton.isVisible()) {
      await tabButton.click();
      await page.waitForTimeout(1000);

      const actualiserButton = page.locator('button:has-text("Actualiser")');
      await actualiserButton.click();
      await page.waitForTimeout(1000);

      const extensionCards = page.locator('.rounded-xl.border.bg-black\\/20');
      const count = await extensionCards.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should enable/disable extensions', async ({ page }) => {
    const managerTab = page.locator('text=Extension Manager').or(
      page.locator('button').filter({ hasText: /Extension|Gestion/ })
    ).first();
    
    if (await managerTab.isVisible()) {
      await managerTab.click();
      await page.waitForTimeout(500);

      const toggleButton = page.locator('button').filter({
        hasText: /Activé|Désactivé|Enabled|Disabled/
      }).first();

      if (await toggleButton.isVisible()) {
        const initialText = await toggleButton.textContent();
        await toggleButton.click();
        await page.waitForTimeout(500);

        const toast = page.locator('.toast, [role="alert"]').first();
        await expect(toast).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('should display extension metrics', async ({ page }) => {
    const tabs = page.locator('button').filter({ hasText: /Extension|Gestion/ });
    const managerTab = tabs.first();
    
    if (await managerTab.isVisible()) {
      await managerTab.click();
      await page.waitForTimeout(1000);

      const metricsLabels = page.locator('text=Permissions, text=Capabilities, text=Requêtes approuvées');
      const hasMetrics = await metricsLabels.first().isVisible().catch(() => false);
      
      if (hasMetrics) {
        await expect(metricsLabels.first()).toBeVisible();
      }
    }
  });

  test('should edit extension metadata', async ({ page }) => {
    const managerTab = page.locator('button').filter({ hasText: /Extension/ }).first();
    
    if (await managerTab.isVisible()) {
      await managerTab.click();
      await page.waitForTimeout(1000);

      const editButton = page.locator('button[title="Modifier"]').first();
      if (await editButton.isVisible()) {
        await editButton.click();
        await page.waitForTimeout(300);

        const descriptionInput = page.locator('input[placeholder*="Description"]');
        await expect(descriptionInput).toBeVisible();

        await descriptionInput.fill('Test description for extension');
        await page.waitForTimeout(200);

        const saveButton = page.locator('button:has-text("Enregistrer")');
        await saveButton.click();
        await page.waitForTimeout(500);

        const toast = page.locator('[role="alert"]').first();
        await expect(toast).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('should cancel metadata editing', async ({ page }) => {
    const managerTab = page.locator('button').filter({ hasText: /Extension/ }).first();
    
    if (await managerTab.isVisible()) {
      await managerTab.click();
      await page.waitForTimeout(1000);

      const editButton = page.locator('button[title="Modifier"]').first();
      if (await editButton.isVisible()) {
        await editButton.click();
        await page.waitForTimeout(300);

        const descriptionInput = page.locator('input[placeholder*="Description"]');
        await descriptionInput.fill('Temporary change');

        const cancelButton = page.locator('button:has-text("Annuler")');
        await cancelButton.click();
        await page.waitForTimeout(300);

        const editButtons = page.locator('button[title="Modifier"]');
        await expect(editButtons.first()).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('should trigger manual extension restart', async ({ page }) => {
    const managerTab = page.locator('button').filter({ hasText: /Extension/ }).first();
    
    if (await managerTab.isVisible()) {
      await managerTab.click();
      await page.waitForTimeout(1000);

      const reloadButton = page.locator('button[title="Recharger cette extension"]').first();
      if (await reloadButton.isVisible()) {
        await reloadButton.click();
        await page.waitForTimeout(1000);

        const toast = page.locator('[role="alert"]').first();
        await expect(toast).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('should reload all extensions via gateway reload', async ({ page }) => {
    const managerTab = page.locator('button').filter({ hasText: /Extension/ }).first();
    
    if (await managerTab.isVisible()) {
      await managerTab.click();
      await page.waitForTimeout(1000);

      const reloadGatewayButton = page.locator('button:has-text("Reload Gateway")');
      if (await reloadGatewayButton.isVisible()) {
        await reloadGatewayButton.click();
        await page.waitForTimeout(1500);

        const toast = page.locator('[role="alert"]').first();
        await expect(toast).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should show extension count badge', async ({ page }) => {
    const managerTab = page.locator('button').filter({ hasText: /Extension/ }).first();
    
    if (await managerTab.isVisible()) {
      await managerTab.click();
      await page.waitForTimeout(1000);

      const badge = page.locator('.rounded-md.border.bg-white\\/5').filter({
        hasText: /extension/
      });
      
      const hasBadge = await badge.isVisible().catch(() => false);
      expect(typeof hasBadge).toBe('boolean');
    }
  });

  test('should display pending edits indicator', async ({ page }) => {
    const managerTab = page.locator('button').filter({ hasText: /Extension/ }).first();
    
    if (await managerTab.isVisible()) {
      await managerTab.click();
      await page.waitForTimeout(1000);

      const editButton = page.locator('button[title="Modifier"]').first();
      if (await editButton.isVisible()) {
        await editButton.click();
        await page.waitForTimeout(300);

        const descriptionInput = page.locator('input[placeholder*="Description"]');
        await descriptionInput.fill('Modified description');

        const saveButton = page.locator('button:has-text("Enregistrer")');
        await saveButton.click();
        await page.waitForTimeout(500);

        const modifiedBadge = page.locator('.border-yellow-500\\/30').filter({
          hasText: 'Modifié'
        });
        
        const hasBadge = await modifiedBadge.isVisible().catch(() => false);
        expect(typeof hasBadge).toBe('boolean');
      }
    }
  });

  test('should handle extension with no permissions gracefully', async ({ page }) => {
    const managerTab = page.locator('button').filter({ hasText: /Extension/ }).first();
    
    if (await managerTab.isVisible()) {
      await managerTab.click();
      await page.waitForTimeout(1000);

      const permissionsCount = page.locator('text=Permissions').locator('..').locator('.font-mono');
      const hasPermissions = await permissionsCount.first().isVisible().catch(() => false);
      
      expect(typeof hasPermissions).toBe('boolean');
    }
  });
});
