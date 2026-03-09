import { Page } from '@playwright/test';

export interface PerformanceMetrics {
  renderTime: number;
  memoryUsage: number;
  fps: number;
  domNodeCount: number;
}

export async function measureRenderTime(page: Page, action: () => Promise<void>): Promise<number> {
  const startTime = Date.now();
  await action();
  await page.waitForLoadState('domcontentloaded');
  return Date.now() - startTime;
}

export async function getMemoryUsage(page: Page): Promise<number> {
  return await page.evaluate(() => {
    if ((performance as any).memory) {
      return (performance as any).memory.usedJSHeapSize / 1024 / 1024;
    }
    return 0;
  });
}

export async function measureFPS(page: Page, durationMs: number = 1000): Promise<number> {
  return await page.evaluate((duration) => {
    return new Promise<number>((resolve) => {
      let frameCount = 0;
      const startTime = performance.now();
      
      function countFrame() {
        frameCount++;
        const elapsed = performance.now() - startTime;
        
        if (elapsed < duration) {
          requestAnimationFrame(countFrame);
        } else {
          const fps = (frameCount / elapsed) * 1000;
          resolve(Math.round(fps));
        }
      }
      
      requestAnimationFrame(countFrame);
    });
  }, durationMs);
}

export async function getDOMNodeCount(page: Page): Promise<number> {
  return await page.evaluate(() => {
    return document.querySelectorAll('*').length;
  });
}

export async function collectPerformanceMetrics(page: Page): Promise<PerformanceMetrics> {
  const [memoryUsage, fps, domNodeCount] = await Promise.all([
    getMemoryUsage(page),
    measureFPS(page, 1000),
    getDOMNodeCount(page)
  ]);

  return {
    renderTime: 0,
    memoryUsage,
    fps,
    domNodeCount
  };
}

export async function waitForStableFramerate(page: Page, targetFPS: number = 30, timeout: number = 5000): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const fps = await measureFPS(page, 500);
    if (fps >= targetFPS) {
      return true;
    }
    await page.waitForTimeout(100);
  }
  
  return false;
}

export async function measureTabSwitchTime(page: Page, tabName: string): Promise<number> {
  const startTime = Date.now();
  const tabButton = page.locator(`text=${tabName}`).first();
  await tabButton.click();
  await page.waitForLoadState('domcontentloaded');
  return Date.now() - startTime;
}

export async function profileOperation(page: Page, operationName: string, operation: () => Promise<void>) {
  const startMetrics = await collectPerformanceMetrics(page);
  const startTime = Date.now();
  
  await operation();
  
  const endTime = Date.now();
  const endMetrics = await collectPerformanceMetrics(page);
  
  return {
    operationName,
    duration: endTime - startTime,
    memoryDelta: endMetrics.memoryUsage - startMetrics.memoryUsage,
    domNodeDelta: endMetrics.domNodeCount - startMetrics.domNodeCount,
    fps: endMetrics.fps
  };
}

export function generatePerformanceReport(profiles: any[]): string {
  let report = '=== Performance Report ===\n\n';
  
  for (const profile of profiles) {
    report += `Operation: ${profile.operationName}\n`;
    report += `  Duration: ${profile.duration}ms\n`;
    report += `  Memory Delta: ${profile.memoryDelta.toFixed(2)}MB\n`;
    report += `  DOM Node Delta: ${profile.domNodeDelta}\n`;
    report += `  FPS: ${profile.fps}\n\n`;
  }
  
  return report;
}
