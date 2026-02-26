import { Page, expect } from '@playwright/test';
import path from 'path';

export interface VisualRegressionOptions {
  maxDiffPixels?: number;
  maxDiffPixelRatio?: number;
  threshold?: number;
}

export async function takeBaselineScreenshot(
  page: Page,
  name: string,
  options?: VisualRegressionOptions
) {
  await page.screenshot({
    path: path.join('e2e', 'screenshots', 'baseline', `${name}.png`),
    fullPage: true,
  });
}

export async function compareScreenshot(
  page: Page,
  name: string,
  options: VisualRegressionOptions = {}
) {
  const screenshot = await page.screenshot({ fullPage: true });
  
  await expect(screenshot).toMatchSnapshot(`${name}.png`, {
    maxDiffPixels: options.maxDiffPixels || 100,
    threshold: options.threshold || 0.2,
  });
}

export async function maskDynamicElements(page: Page) {
  await page.addStyleTag({
    content: `
      [data-test-dynamic="true"],
      .animate-pulse,
      .animate-spin {
        animation: none !important;
      }
    `
  });
}
