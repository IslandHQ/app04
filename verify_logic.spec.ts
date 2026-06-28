import { test, expect } from '@playwright/test';

test('verify weakness analysis and review button', async ({ page }) => {
  // Mock API requests
  await page.route('**/api/auth/me', async route => {
    const json = {
      user: {
        id: '1',
        email: 'test@example.com',
        name: 'テストユーザー',
        role: 'user',
        grade: '中2',
        level: 1,
        exp: 0,
        streak: 0,
        detailedStats: {
          '数学:連立方程式': { total: 5, correct: 1 },
          '数学:一次関数': { total: 10, correct: 9 }
        }
      }
    };
    await route.fulfill({ json });
  });

  await page.route('**/api/settings', async route => {
    const json = { endpoint: '', apiKey: 'dummy', model: 'gpt-4o', duplicatePreventionMode: 'seed' };
    await route.fulfill({ json });
  });

  await page.route('**/api/custom_drills', async route => {
    await route.fulfill({ json: [] });
  });

  await page.route('**/api/daily_records', async route => {
    await route.fulfill({ json: [] });
  });

  await page.goto('http://127.0.0.1:5173');

  // Check Home Page for Review Button
  await expect(page.locator('text=苦手発見！ 数学')).toBeVisible();
  await page.screenshot({ path: 'home_with_weakness.png' });

  // Check Dashboard Page for Weakness Analysis
  await page.click('text=データ');
  await expect(page.locator('text=苦手分野の分析')).toBeVisible();
  await expect(page.locator('text=連立方程式')).toBeVisible();
  await page.screenshot({ path: 'dashboard_with_weakness.png', fullPage: true });
});
