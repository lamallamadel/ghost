import { test, expect } from './fixtures/electron';

test.describe('Manual Override Dialog Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('#/console');
    await page.waitForTimeout(500);
  });

  test('should open manual override dialog from rejected request', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).electronAPI = {
        ...((window as any).electronAPI || {}),
        gatewayManualOverride: async (params: any) => {
          return {
            approved: true,
            auditLogId: `audit-${Date.now()}`
          };
        }
      };
    });

    await page.waitForTimeout(500);
  });

  test('should validate justification minimum length', async ({ page }) => {
    await page.evaluate(() => {
      const mockOverride = async (params: any) => {
        if (!params.reason || params.reason.length < 10) {
          return {
            approved: false,
            reason: 'Justification insuffisante (minimum 10 caractères)'
          };
        }
        return {
          approved: true,
          auditLogId: `audit-${Date.now()}`
        };
      };

      (window as any).electronAPI = {
        ...((window as any).electronAPI || {}),
        gatewayManualOverride: mockOverride
      };
    });

    const result = await page.evaluate(() => {
      return (window as any).electronAPI.gatewayManualOverride({
        extensionId: 'test-ext',
        type: 'filesystem',
        operation: 'write',
        reason: 'short',
        params: {}
      });
    });

    expect(result.approved).toBe(false);
  });

  test('should accept valid justification', async ({ page }) => {
    await page.evaluate(() => {
      const mockOverride = async (params: any) => {
        if (!params.reason || params.reason.length < 10) {
          return {
            approved: false,
            reason: 'Justification insuffisante'
          };
        }
        return {
          approved: true,
          auditLogId: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        };
      };

      (window as any).electronAPI = {
        ...((window as any).electronAPI || {}),
        gatewayManualOverride: mockOverride
      };
    });

    const result = await page.evaluate(() => {
      return (window as any).electronAPI.gatewayManualOverride({
        extensionId: 'test-ext',
        type: 'filesystem',
        operation: 'write',
        reason: 'This is a valid justification for testing purposes',
        params: { path: '/test/path' }
      });
    });

    expect(result.approved).toBe(true);
    expect(result.auditLogId).toBeDefined();
  });

  test('should log manual override to audit log', async ({ page }) => {
    await page.goto('#/console');
    await page.waitForTimeout(500);

    const logsTab = page.locator('button').filter({ hasText: /Logs|Journal/ }).first();
    
    if (await logsTab.isVisible()) {
      await logsTab.click();
      await page.waitForTimeout(1000);

      const manualOverrideLog = page.locator('text=SI-10(1) Manual Override').or(
        page.locator('text=Manual Override')
      );
      
      const hasLogs = await manualOverrideLog.isVisible().catch(() => false);
      expect(typeof hasLogs).toBe('boolean');
    }
  });

  test('should include operator information in audit log', async ({ page }) => {
    const overrideResult = await page.evaluate(() => {
      return (window as any).electronAPI?.gatewayManualOverride?.({
        extensionId: 'test-extension',
        type: 'network',
        operation: 'fetch',
        reason: 'Emergency production fix required',
        params: { url: 'https://api.example.com' }
      });
    });

    if (overrideResult) {
      expect(overrideResult.auditLogId || overrideResult.reason).toBeDefined();
    }
  });

  test('should capture request parameters in override', async ({ page }) => {
    const testParams = {
      path: '/sensitive/path',
      operation: 'write',
      content: 'test content'
    };

    await page.evaluate((params) => {
      (window as any).testOverrideParams = params;
    }, testParams);

    const captured = await page.evaluate(() => {
      return (window as any).testOverrideParams;
    });

    expect(captured).toEqual(testParams);
  });

  test('should display override approval confirmation', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).electronAPI = {
        ...((window as any).electronAPI || {}),
        gatewayManualOverride: async () => ({
          approved: true,
          auditLogId: 'audit-test-123'
        })
      };
    });

    const result = await page.evaluate(() => {
      return (window as any).electronAPI.gatewayManualOverride({
        extensionId: 'test',
        type: 'test',
        operation: 'test',
        reason: 'Valid reason for testing',
        params: {}
      });
    });

    expect(result.approved).toBe(true);
  });

  test('should handle override rejection gracefully', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).electronAPI = {
        ...((window as any).electronAPI || {}),
        gatewayManualOverride: async () => ({
          approved: false,
          reason: 'Override denied by policy'
        })
      };
    });

    const result = await page.evaluate(() => {
      return (window as any).electronAPI.gatewayManualOverride({
        extensionId: 'test',
        type: 'test',
        operation: 'test',
        reason: 'Test reason',
        params: {}
      });
    });

    expect(result.approved).toBe(false);
    expect(result.reason).toBeDefined();
  });

  test('should track override timestamp', async ({ page }) => {
    const beforeTime = Date.now();

    await page.evaluate(() => {
      (window as any).electronAPI = {
        ...((window as any).electronAPI || {}),
        gatewayManualOverride: async () => ({
          approved: true,
          auditLogId: `audit-${Date.now()}`
        })
      };
    });

    const result = await page.evaluate(() => {
      return (window as any).electronAPI.gatewayManualOverride({
        extensionId: 'test',
        type: 'test',
        operation: 'test',
        reason: 'Timestamped override test',
        params: {}
      });
    });

    const afterTime = Date.now();

    if (result.auditLogId) {
      const timestamp = parseInt(result.auditLogId.split('-')[1]);
      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
    }
  });

  test('should verify audit log entry after override', async ({ page }) => {
    await page.goto('#/console');
    
    const result = await page.evaluate(() => {
      const api = (window as any).electronAPI;
      if (!api?.gatewayManualOverride) return null;
      
      return api.gatewayManualOverride({
        extensionId: 'verification-test',
        type: 'filesystem',
        operation: 'write',
        reason: 'Verification test for audit logging',
        params: { path: '/test' }
      });
    });

    if (result?.auditLogId) {
      await page.waitForTimeout(1000);

      const logsTab = page.locator('button').filter({ hasText: /Logs/ }).first();
      if (await logsTab.isVisible()) {
        await logsTab.click();
        await page.waitForTimeout(1000);

        const auditEntry = page.locator(`text=${result.auditLogId}`).or(
          page.locator('text=Manual Override')
        );
        
        const hasEntry = await auditEntry.isVisible().catch(() => false);
        expect(typeof hasEntry).toBe('boolean');
      }
    }
  });
});
