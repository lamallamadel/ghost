import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ElectronFixtures {
  electronApp: ElectronApplication;
  page: Page;
}

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    const electronPath = require('electron');
    const appPath = path.join(__dirname, '..', '..');
    
    process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173';
    process.env.NODE_ENV = 'test';
    
    const app = await electron.launch({
      executablePath: electronPath as string,
      args: [appPath],
      env: {
        ...process.env,
        ELECTRON_IS_DEV: '1',
        VITE_DEV_SERVER_URL: 'http://localhost:5173',
      },
    });

    await use(app);
    await app.close();
  },

  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await use(page);
  },
});

export { expect } from '@playwright/test';
