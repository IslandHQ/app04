import { test, expect } from '@playwright/test';

test('verify weakness analysis and review button', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // Inject mock data into localStorage
  await page.evaluate(() => {
    const mockData = {
      name: 'テストユーザー',
      grade: '中2',
      results: [],
      detailedStats: {
        '数学': {
          '連立方程式': { attempts: 5, corrects: 1 },
          '一次関数': { attempts: 10, corrects: 9 }
        }
      }
    };
    localStorage.setItem('learning_user_data', JSON.stringify(mockData));
  });

  await page.reload();

  // Check Home Page for Review Button
  await expect(page.locator('text=苦手分野を復習する')).toBeVisible();
  await page.screenshot({ path: 'home_with_weakness.png' });

  // Check Dashboard Page for Weakness Analysis
  await page.click('text=データ');
  await expect(page.locator('text=苦手分析（ギャップ分析）')).toBeVisible();
  await expect(page.locator('text=連立方程式')).toBeVisible();
  await page.screenshot({ path: 'dashboard_with_weakness.png', fullPage: true });
});
